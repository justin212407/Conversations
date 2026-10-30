import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import process from "node:process"
import { setTimeout } from "node:timers"
import { createServer } from "node:net"
import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { ConversationStore, migrateDatabase } from "@conversations/database"
import {
  TEXT_GENERATION_QUEUE,
  domainEventSchema,
  provisionalChannel,
  provisionalMessageSnapshotSchema,
  textGenerationJobSchema,
} from "@conversations/shared"
import { redisConnectionOptions } from "@conversations/service-runtime"
import { createTestDatabase } from "../../../packages/database/test/database-fixture.mjs"
import { createConversationApi } from "../../api/test/conversation-fixture.mjs"
import { createTextRuntime, relayTextHandoffs } from "../dist/text-runtime.js"
import { createTextRunner } from "../dist/text-runner.js"
import { deterministicProvider, geminiProvider } from "../dist/provider.js"
import { loadTextConfig } from "../dist/text-config.js"

const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379"
const { Response, AbortController } = globalThis
const connection = redisConnectionOptions(redisUrl)
const prefix = () => "text_test_" + randomUUID().replaceAll("-", "")
async function until(fn) {
  const deadline = Date.now() + 7000
  while (Date.now() < deadline) {
    const result = await fn()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error("Timed out waiting for isolated worker state")
}
async function setup(t) {
  const db = await createTestDatabase()
  t.after(() => db.close())
  await migrateDatabase(db.pool)
  const store = new ConversationStore(db.pool),
    owner = await store.provisionAccount("user_worker")
  const conversation = await store.createConversation(owner.id)
  return { ...db, store, owner, conversation }
}
async function admit(f, content = "Explain the parser") {
  const accepted = await f.store.commands.submitText(
    f.owner.id,
    f.conversation.id,
    randomUUID(),
    content,
    {
      requestId: "fixture-request",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    }
  )
  const row = (
    await f.pool.query(
      "SELECT payload FROM handoffs WHERE operation_id=$1 AND kind='job'",
      [accepted.operationId]
    )
  ).rows[0]
  return { accepted, job: textGenerationJobSchema.parse(row.payload) }
}
async function runtime(t, f, provider = deterministicProvider(), extra = {}) {
  const queuePrefix = prefix()
  const result = createTextRuntime({
    store: f.store,
    redisUrl,
    prefix: queuePrefix,
    provider,
    timeoutMs: 1000,
    ...extra,
  })
  t.after(async () => {
    await result.stopIntake()
    await result.close()
    const clean = new Queue(TEXT_GENERATION_QUEUE, {
      prefix: queuePrefix,
      connection: { ...connection, maxRetriesPerRequest: 1 },
    })
    try {
      await clean.obliterate({ force: true })
    } finally {
      await clean.close()
    }
  })
  await result.start()
  return result
}
async function operation(f, id) {
  return (await f.pool.query("SELECT * FROM operations WHERE id=$1", [id]))
    .rows[0]
}

test("real API admission → durable relay → BullMQ worker → PG result/events, with full voice/text context and safe snapshots", async (t) => {
  const api = await createConversationApi(t),
    conversation = await api.create("Resume")
  const owner = await api.store.provisionAccount("user_api_alice")
  for (const [role, content] of [
    ["user", "Earlier voice question"],
    ["assistant", "Earlier voice answer"],
  ])
    await api.store.commands.persistFinalMessage(owner.id, conversation.id, {
      deliveryId: randomUUID(),
      role,
      modality: "voice",
      content,
    })
  const snapshots = [],
    subscriber = new Redis({ ...connection, maxRetriesPerRequest: 1 })
  subscriber.on("error", () => {})
  t.after(() => subscriber.disconnect())
  await subscriber.subscribe(provisionalChannel(conversation.id))
  subscriber.on("message", (_, value) =>
    snapshots.push(provisionalMessageSnapshotSchema.parse(JSON.parse(value)))
  )
  let calls = 0,
    seen
  const provider = {
    available: true,
    async *stream(context) {
      calls++
      seen = context
      // No provider call holds the conversation transaction/connection.
      await api.pool.query(
        "SELECT id FROM conversations WHERE id=$1 FOR UPDATE NOWAIT",
        [conversation.id]
      )
      yield "A persisted "
      await new Promise((resolve) => setTimeout(resolve, 120))
      yield "answer"
    },
  }
  const result = await api.request(
    "POST",
    `/v1/conversations/${conversation.id}/messages`,
    { clientRequestId: randomUUID(), content: "Continue once" },
    "alice",
    { traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" }
  )
  assert.equal(result.statusCode, 202, result.body)
  const accepted = result.json()
  const rt = await runtime(t, { store: api.store }, provider)
  await until(
    async () =>
      (await operation(api, accepted.operationId)).status === "completed"
  )
  assert.deepEqual(
    seen.map((m) => [m.role, m.content]),
    [
      ["user", "Earlier voice question"],
      ["assistant", "Earlier voice answer"],
      ["user", "Continue once"],
    ]
  )
  const history = (
    await api.request("GET", `/v1/conversations/${conversation.id}/messages`)
  ).json().items
  assert.equal(history.at(-1).content, "A persisted answer")
  assert.equal(history.at(-1).operationId, accepted.operationId)
  assert.equal(history.at(-1).failureCode, null)
  const terminal = (
    await api.pool.query(
      "SELECT payload FROM handoffs WHERE type='operation.completed'"
    )
  ).rows.map((r) => domainEventSchema.parse(r.payload))
  assert.equal(terminal.length, 1)
  assert.equal(
    terminal[0].correlation.traceparent.split("-")[1],
    "0123456789abcdef0123456789abcdef"
  )
  await until(() => snapshots.length >= 1)
  assert.equal(snapshots[0].payload.messageId, accepted.assistantMessageId)
  assert.equal(snapshots[0].payload.operationId, accepted.operationId)
  assert.ok(
    snapshots.every(
      (s) =>
        s.sequence < terminal[0].sequence && s.payload.state === "streaming"
    )
  )
  assert.ok(
    !JSON.stringify(snapshots).includes(
      (await operation(api, accepted.operationId)).execution_token
    )
  )
  const handoff = (
    await api.pool.query(
      "SELECT payload FROM handoffs WHERE kind='job' AND operation_id=$1",
      [accepted.operationId]
    )
  ).rows[0]
  await rt.queue.add("text.generate", handoff.payload, { jobId: randomUUID() }) // wrong job identity rejected
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(calls, 1)
})

test("enqueue-before-ack crash replays stable queue identity, duplicate execution never pays twice", async (t) => {
  const f = await setup(t),
    { accepted, job } = await admit(f),
    queuePrefix = prefix()
  const queue = new Queue(TEXT_GENERATION_QUEUE, {
    prefix: queuePrefix,
    connection: { ...connection, maxRetriesPerRequest: 1 },
  })
  t.after(async () => {
    await queue.obliterate({ force: true })
    await queue.close()
  })
  await assert.rejects(() =>
    relayTextHandoffs(f.store, queue, {
      afterEnqueue: async () => {
        throw new Error("simulated crash")
      },
    })
  )
  assert.equal(
    (await f.pool.query("SELECT delivered_at FROM handoffs WHERE kind='job'"))
      .rows[0].delivered_at,
    null
  )
  await f.pool.query(
    "UPDATE handoffs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE kind='job'"
  )
  await relayTextHandoffs(f.store, queue)
  assert.equal(await queue.getWaitingCount(), 1)
  assert.ok(
    (await f.pool.query("SELECT delivered_at FROM handoffs WHERE kind='job'"))
      .rows[0].delivered_at
  )
  let calls = 0
  const runner = createTextRunner({
    store: f.store,
    provider: {
      available: true,
      async *stream() {
        calls++
        yield "Once"
      },
    },
    timeoutMs: 1000,
    publish: async () => {},
  })
  const results = await Promise.all(
    Array.from({ length: 8 }, () => runner.execute(job, accepted.operationId))
  )
  assert.equal(calls, 1)
  assert.equal(results.filter((r) => r.status === "completed").length, 1)
  await runner.execute(job, accepted.operationId)
  assert.equal(calls, 1)
  assert.equal(
    (
      await f.pool.query(
        "SELECT count(*)::int count FROM handoffs WHERE type='operation.completed'"
      )
    ).rows[0].count,
    1
  )
})

test("malformed, foreign, wrong input, deleted and voice commands cannot execute or mutate foreign history", async (t) => {
  const f = await setup(t),
    { job, accepted } = await admit(f)
  const foreign = await f.store.provisionAccount("user_foreign")
  let calls = 0
  const runner = createTextRunner({
    store: f.store,
    provider: {
      available: true,
      async *stream() {
        calls++
        yield "bad"
      },
    },
    timeoutMs: 1000,
    publish: async () => {},
  })
  for (const raw of [
    {},
    { ...job, accountId: foreign.id },
    { ...job, inputMessageId: randomUUID() },
    { ...job, version: 2 },
    { ...job, operationId: randomUUID() },
  ])
    assert.equal(
      (await runner.execute(raw, raw.operationId ?? accepted.operationId))
        .status,
      "ignored"
    )
  await f.pool.query("UPDATE operations SET kind='voice' WHERE id=$1", [
    accepted.operationId,
  ])
  await runner.execute(job, accepted.operationId)
  await f.pool.query("UPDATE operations SET kind='text' WHERE id=$1", [
    accepted.operationId,
  ])
  await f.pool.query("UPDATE conversations SET status='deleted' WHERE id=$1", [
    f.conversation.id,
  ])
  await runner.execute(job, accepted.operationId)
  assert.equal(calls, 0)
  assert.equal((await operation(f, accepted.operationId)).status, "pending")
})

test("safe provider failure/partial/timeout/output/unavailable states persist and failed history remains retryable", async (t) => {
  for (const [expected, provider, timeoutMs] of [
    [
      "provider_error",
      {
        available: true,
        async *stream() {
          yield "Useful partial"
          throw new Error("SECRET provider transcript")
        },
      },
      1000,
    ],
    [
      "timeout",
      {
        available: true,
        async *stream() {
          await new Promise(() => {})
          yield "never"
        },
      },
      100,
    ],
    [
      "output_limit",
      {
        available: true,
        async *stream() {
          yield "x".repeat(64001)
        },
      },
      1000,
    ],
    [
      "provider_unavailable",
      {
        available: false,
        async *stream() {
          yield "never"
        },
      },
      1000,
    ],
  ]) {
    const f = await setup(t),
      { accepted, job } = await admit(f)
    const runner = createTextRunner({
      store: f.store,
      provider,
      timeoutMs,
      publish: async () => {
        throw new Error("Redis down")
      },
    })
    assert.equal(
      (await runner.execute(job, accepted.operationId)).status,
      "failed"
    )
    const history = await f.store.history.messages(
      f.owner.id,
      f.conversation.id
    )
    assert.equal(history.items.at(-1).failureCode, expected)
    assert.equal(history.items.at(-1).operationId, accepted.operationId)
    assert.equal(
      history.items.at(-1).content,
      expected === "provider_error" ? "Useful partial" : ""
    )
    assert.ok(!JSON.stringify(history).includes("SECRET"))
    const retried = await f.store.commands.retry(
      f.owner.id,
      f.conversation.id,
      history.items.at(-1).operationId,
      randomUUID()
    )
    assert.equal(retried.userMessageId, accepted.userMessageId)
    assert.equal(
      (
        await f.pool.query(
          "SELECT count(*)::int count FROM messages WHERE role='user'"
        )
      ).rows[0].count,
      1
    )
  }
})

test("retry older failed turn uses original cutoff once, excluding later completed messages", async (t) => {
  const f = await setup(t),
    { accepted, job } = await admit(f, "Original input")
  const failed = createTextRunner({
    store: f.store,
    provider: { available: false, async *stream() {} },
    timeoutMs: 1000,
    publish: async () => {},
  })
  await failed.execute(job, accepted.operationId)
  await f.store.commands.persistFinalMessage(f.owner.id, f.conversation.id, {
    deliveryId: randomUUID(),
    role: "user",
    modality: "voice",
    content: "Later voice input",
  })
  const retry = await f.store.commands.retry(
    f.owner.id,
    f.conversation.id,
    accepted.operationId,
    randomUUID()
  )
  const payload = (
    await f.pool.query(
      "SELECT payload FROM handoffs WHERE kind='job' AND operation_id=$1",
      [retry.operationId]
    )
  ).rows[0].payload
  let seen
  const runner = createTextRunner({
    store: f.store,
    provider: {
      available: true,
      async *stream(context) {
        seen = context
        yield "Retry done"
      },
    },
    timeoutMs: 1000,
    publish: async () => {},
  })
  await runner.execute(payload, retry.operationId)
  assert.deepEqual(
    seen.map((m) => m.content),
    ["Original input"]
  )
})

test("expired restart recovery fences stale tokens; finalization outage cannot trigger another model call", async (t) => {
  const f = await setup(t),
    { accepted } = await admit(f)
  const token = randomUUID()
  await f.store.commands.begin(
    f.owner.id,
    f.conversation.id,
    accepted.operationId,
    token
  )
  await f.pool.query(
    "UPDATE operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [accepted.operationId]
  )
  let calls = 0
  const rt = await runtime(t, f, {
    available: true,
    async *stream() {
      calls++
      yield "never"
    },
  })
  await until(
    async () =>
      (await operation(f, accepted.operationId)).status === "interrupted"
  )
  assert.equal(
    (await operation(f, accepted.operationId)).failure_code,
    "expired"
  )
  assert.equal(calls, 0)
  await assert.rejects(() =>
    f.store.commands.finalize(
      f.owner.id,
      f.conversation.id,
      accepted.operationId,
      { state: "completed", content: "stale", executionToken: token }
    )
  )
  await rt.stopIntake()
  await rt.close()
  const second = await f.store.createConversation(f.owner.id)
  f.conversation = second
  const next = await admit(f)
  const finalize = f.store.commands.finalize.bind(f.store.commands)
  f.store.commands.finalize = async () => {
    throw new Error("database unavailable")
  }
  const runner = createTextRunner({
    store: f.store,
    provider: {
      available: true,
      async *stream() {
        calls++
        yield "A result"
      },
    },
    timeoutMs: 1000,
    publish: async () => {},
  })
  await assert.rejects(
    () => runner.execute(next.job, next.accepted.operationId),
    { message: "Generation finalization unavailable" }
  )
  f.store.commands.finalize = finalize
  await runner.execute(next.job, next.accepted.operationId)
  assert.equal(calls, 1)
  await f.pool.query(
    "UPDATE operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [next.accepted.operationId]
  )
  await f.store.commands.interruptExpiredTextOperations()
  assert.equal(
    (await operation(f, next.accepted.operationId)).status,
    "interrupted"
  )
})

test("shutdown stops intake, cancels uncooperative stream, and persists interruption before pool closes", async (t) => {
  const f = await setup(t),
    { accepted } = await admit(f)
  const rt = await runtime(
    t,
    f,
    {
      available: true,
      async *stream() {
        yield "Before shutdown"
        await new Promise(() => {})
        yield "never"
      },
    },
    { timeoutMs: 10000 }
  )
  await until(
    async () => (await operation(f, accepted.operationId)).status === "running"
  )
  await rt.stopIntake()
  await rt.close()
  const result = await operation(f, accepted.operationId)
  assert.equal(result.status, "interrupted")
  assert.equal(result.failure_code, "interrupted")
})

test("expired PostgreSQL admission recovers even while Redis is unavailable", async (t) => {
  const f = await setup(t),
    { accepted } = await admit(f)
  await f.pool.query(
    "UPDATE operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [accepted.operationId]
  )
  const server = createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const rt = await runtime(t, f, deterministicProvider(), {
    redisUrl: `redis://127.0.0.1:${port}`,
  })
  await until(
    async () =>
      (await operation(f, accepted.operationId)).status === "interrupted"
  )
  assert.equal(
    (await operation(f, accepted.operationId)).failure_code,
    "expired"
  )
  // A second, unexpired handoff exercises bounded enqueue startup, rather than
  // only an empty/cancelled queue, during disconnected shutdown.
  await admit(f, "Pending while Redis is disconnected")
  await new Promise((resolve) => setTimeout(resolve, 300))
  await rt.stopIntake()
  await rt.close()
})

test("actual Gemini SDK streams behind adapter, disables retries, maps safe failures, and rejects fake production configuration", async () => {
  let body,
    attempts = 0
  const provider = geminiProvider({
    apiKey: "local-signed-test-key",
    model: "gemini-3.5-flash-lite",
    timeoutMs: 1000,
    httpOptions: {
      fetch: async (_url, init) => {
        attempts++
        body = JSON.parse(init.body)
        return new Response(
          "data: " +
            JSON.stringify({
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [
                      { text: "Hello " },
                      { text: "private thought", thought: true },
                    ],
                  },
                },
              ],
            }) +
            "\n\ndata: " +
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: "world" }] },
                  finishReason: "STOP",
                },
              ],
            }) +
            "\n\n",
          { headers: { "content-type": "text/event-stream" } }
        )
      },
    },
  })
  const chunks = []
  for await (const value of provider.stream(
    [
      { role: "user", content: "Prior voice" },
      { role: "assistant", content: "Prior answer" },
      { role: "user", content: "Next" },
    ],
    new AbortController().signal
  ))
    chunks.push(value)
  assert.deepEqual(chunks, ["Hello ", "world"])
  assert.equal(attempts, 1)
  assert.deepEqual(
    body.contents.map((c) => c.role),
    ["user", "model", "user"]
  )
  for (const [response, expected] of [
    [new Response("provider SECRET", { status: 503 }), "provider_error"],
    [
      new Response(
        "data: " +
          JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }) +
          "\n\n"
      ),
      "output_limit",
    ],
    [
      new Response(
        "data: " +
          JSON.stringify({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "Incomplete" }] },
                finishReason: "CONTINUATION",
                continuationToken: "synthetic-continuation-token",
              },
            ],
          }) +
          "\n\n",
        { headers: { "content-type": "text/event-stream" } }
      ),
      "provider_error",
    ],
  ]) {
    let count = 0
    const failed = geminiProvider({
      apiKey: "test",
      model: "gemini-3.5-flash-lite",
      timeoutMs: 1000,
      httpOptions: {
        fetch: async () => {
          count++
          return response
        },
      },
    })
    await assert.rejects(
      async () => {
        for await (const _ of failed.stream(
          [{ role: "user", content: "x" }],
          new AbortController().signal
        ))
          void _
      },
      (error) =>
        error.message === "Text generation failed" && error.code === expected
    )
    assert.equal(count, 1)
  }
  assert.throws(() =>
    loadTextConfig({ NODE_ENV: "production", TEXT_PROVIDER: "deterministic" })
  )
  assert.throws(() =>
    loadTextConfig({ NODE_ENV: "production", TEXT_PROVIDER: "gemini" })
  )
  assert.throws(() =>
    loadTextConfig({ NODE_ENV: "production", GOOGLE_GENERATIVE_AI_API_KEY: "" })
  )
  assert.equal(
    loadTextConfig({ GOOGLE_GENERATIVE_AI_API_KEY: "" })
      .GOOGLE_GENERATIVE_AI_API_KEY,
    undefined
  )
  assert.equal(
    loadTextConfig({ NODE_ENV: "test", TEXT_PROVIDER: "deterministic" })
      .TEXT_PROVIDER,
    "deterministic"
  )
})

test("REST limits reject oversized complete context before202; Unicode boundary and worker revalidation agree", async (t) => {
  const api = await createConversationApi(t),
    owner = await api.store.provisionAccount("user_api_alice")
  const tooMany = await api.create("Count limit")
  await api.store.appendMessages(
    owner.id,
    tooMany.id,
    Array.from({ length: 100 }, () => ({
      role: "user",
      modality: "voice",
      content: "Earlier",
      state: "completed",
    }))
  )
  const oversized = await api.create("Character limit")
  await api.store.commands.persistFinalMessage(owner.id, oversized.id, {
    deliveryId: randomUUID(),
    role: "user",
    modality: "voice",
    content: "😀".repeat(64000),
  })
  for (const conversation of [tooMany, oversized]) {
    const result = await api.request(
      "POST",
      `/v1/conversations/${conversation.id}/messages`,
      { clientRequestId: randomUUID(), content: "x" }
    )
    assert.equal(result.statusCode, 413, result.body)
    assert.equal(result.json().error.code, "INPUT_LIMIT_EXCEEDED")
    assert.equal(
      (
        await api.pool.query(
          "SELECT count(*)::int count FROM operations WHERE conversation_id=$1",
          [conversation.id]
        )
      ).rows[0].count,
      0
    )
  }
  const boundary = await api.create("Exactly within Unicode limit")
  await api.store.commands.persistFinalMessage(owner.id, boundary.id, {
    deliveryId: randomUUID(),
    role: "user",
    modality: "voice",
    content: "😀".repeat(63999),
  })
  const admitted = await api.request(
    "POST",
    `/v1/conversations/${boundary.id}/messages`,
    { clientRequestId: randomUUID(), content: "x" }
  )
  assert.equal(admitted.statusCode, 202, admitted.body)
  const accepted = admitted.json(),
    job = (
      await api.pool.query(
        "SELECT payload FROM handoffs WHERE kind='job' AND operation_id=$1",
        [accepted.operationId]
      )
    ).rows[0].payload
  // Simulate preexisting/imported oversized history changing outside the app.
  await api.pool.query(
    "UPDATE messages SET content=content||'y' WHERE conversation_id=$1 AND modality='voice'",
    [boundary.id]
  )
  let calls = 0
  const runner = createTextRunner({
    store: api.store,
    provider: {
      available: true,
      async *stream() {
        calls++
        yield "never"
      },
    },
    timeoutMs: 1000,
    publish: async () => {},
  })
  await runner.execute(job, accepted.operationId)
  assert.equal(calls, 0)
  assert.equal(
    (await operation(api, accepted.operationId)).failure_code,
    "context_limit"
  )
})

test("failed assistant reload discovers operation and REST retry preserves the original user without local state", async (t) => {
  const api = await createConversationApi(t),
    conversation = await api.create()
  const result = await api.request(
    "POST",
    `/v1/conversations/${conversation.id}/messages`,
    { clientRequestId: randomUUID(), content: "Try once" }
  )
  const accepted = result.json(),
    job = (
      await api.pool.query(
        "SELECT payload FROM handoffs WHERE kind='job' AND operation_id=$1",
        [accepted.operationId]
      )
    ).rows[0].payload
  const runner = createTextRunner({
    store: api.store,
    provider: { available: false, async *stream() {} },
    timeoutMs: 1000,
    publish: async () => {},
  })
  await runner.execute(job, accepted.operationId)
  assert.equal(
    (await api.request("GET", `/v1/conversations/${conversation.id}`)).json()
      .activeOperation,
    null
  )
  const loaded = (
    await api.request(
      "GET",
      `/v1/conversations/${conversation.id}/messages?limit=1`
    )
  ).json()
  const failed = loaded.items[0]
  assert.equal(failed.failureCode, "provider_unavailable")
  assert.ok(failed.operationId)
  const retried = await api.request(
    "POST",
    `/v1/conversations/${conversation.id}/operations/${failed.operationId}/retry`,
    { clientRequestId: randomUUID() }
  )
  assert.equal(retried.statusCode, 202, retried.body)
  assert.equal(retried.json().userMessageId, accepted.userMessageId)
  const older = (
    await api.request(
      "GET",
      `/v1/conversations/${conversation.id}/messages?limit=1&cursor=${loaded.nextCursor}`
    )
  ).json()
  assert.equal(older.items[0].role, "user")
  assert.equal(older.items[0].operationId, null)
})
