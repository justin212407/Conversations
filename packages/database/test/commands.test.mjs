import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { Buffer } from "node:buffer"
import {
  ConversationStore,
  ConversationConflict,
  DomainError,
  ResourceNotFound,
  migrateDatabase,
} from "../dist/index.js"
import { createTestDatabase } from "./database-fixture.mjs"
import {
  domainEventSchema,
  textGenerationJobSchema,
} from "@conversations/shared"

async function setup(t) {
  const db = await createTestDatabase()
  t.after(() => db.close())
  await migrateDatabase(db.pool)
  const store = new ConversationStore(db.pool)
  const owner = await store.provisionAccount("user_commands")
  const other = await store.provisionAccount("user_other")
  const conversation = await store.createConversation(owner.id)
  return { ...db, store, owner, other, conversation }
}
const invalid = (error) =>
  error instanceof DomainError && error.statusCode === 400

test("durable admission converges concurrent identities and enforces active/owned command constraints", async (t) => {
  const { pool, store, owner, other, conversation: c } = await setup(t)
  const request = randomUUID()
  const accepted = await Promise.all(
    Array.from({ length: 16 }, () =>
      store.commands.submitText(owner.id, c.id, request, "Explain the parser")
    )
  )
  assert.equal(new Set(accepted.map((item) => item.operationId)).size, 1)
  assert.ok(accepted.every((item) => item.status === "pending"))
  assert.deepEqual(
    await store.commands.submitText(
      owner.id.toUpperCase(),
      c.id.toUpperCase(),
      request.toUpperCase(),
      "Explain the parser"
    ),
    accepted[0]
  )
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM operations")).rows[0]
      .count,
    1
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM handoffs WHERE kind='job'"
      )
    ).rows[0].count,
    1
  )
  const history = await store.listMessages(owner.id, c.id)
  assert.deepEqual(
    history.map((message) => [message.role, message.state, message.sequence]),
    [
      ["user", "completed", 1],
      ["assistant", "pending", 2],
    ]
  )
  assert.equal(history[0].id, accepted[0].userMessageId)
  assert.equal(history[1].id, accepted[0].assistantMessageId)
  assert.equal(history[1].content, "")
  await assert.rejects(
    store.appendMessages(owner.id, c.id, [
      { role: "user", modality: "text", content: "Bypass", state: "completed" },
    ]),
    ConversationConflict
  )
  await assert.rejects(
    store.updateMessage(owner.id, c.id, history[1].id, {
      content: "Bypass",
      state: "completed",
    }),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.submitText(owner.id, c.id, request, "Changed payload"),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.submitText(owner.id, c.id, randomUUID(), "Busy"),
    ConversationConflict
  )
  await assert.rejects(
    store.updateConversation(owner.id, c.id, { title: "Busy rename" }),
    ConversationConflict
  )
  await assert.rejects(
    store.updateConversation(owner.id, c.id, { status: "archived" }),
    ConversationConflict
  )
  await assert.rejects(
    store.updateConversation(owner.id, c.id, { status: "deleted" }),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.submitText(other.id, c.id, randomUUID(), "No access"),
    ResourceNotFound
  )
  const second = await store.createConversation(owner.id)
  await assert.rejects(
    store.commands.submitText(
      owner.id,
      second.id,
      request,
      "Explain the parser"
    ),
    ConversationConflict
  )
  const foreign = await store.createConversation(other.id)
  assert.equal(
    (
      await store.commands.submitText(
        other.id,
        foreign.id,
        request,
        "Own request scope"
      )
    ).status,
    "pending"
  )
  await assert.rejects(
    pool.query(
      "INSERT INTO operations (account_id, conversation_id, client_request_id, request_hash, kind, input_message_id, assistant_message_id, expires_at) VALUES ($1,$2,$3,'synthetic','text',$4,$5,clock_timestamp()+interval '1 minute')",
      [owner.id, c.id, randomUUID(), history[0].id, history[1].id]
    )
  )
  await assert.rejects(
    pool.query(
      "INSERT INTO handoffs (conversation_id, kind, sequence, type, payload) VALUES ($1,'event',NULL,'invalid','{}')",
      [c.id]
    )
  )
  await assert.rejects(
    pool.query(
      "INSERT INTO handoffs (conversation_id, kind, type, payload) VALUES ($1,'job','invalid','{}')",
      [c.id]
    )
  )
})

test("terminal state and result events commit once; execution and handoff leases fence duplicates", async (t) => {
  const { pool, store, owner, conversation: c } = await setup(t)
  const accepted = await store.commands.submitText(
    owner.id,
    c.id,
    randomUUID(),
    "Question"
  )
  const [firstJob] = await store.handoff.claim("job", { leaseMs: 1000 })
  assert.ok(firstJob)
  assert.equal(firstJob.payload.operationId, accepted.operationId)
  assert.ok(textGenerationJobSchema.safeParse(firstJob.payload).success)
  assert.equal(
    textGenerationJobSchema.safeParse({
      ...firstJob.payload,
      providerSecret: "unexpected",
    }).success,
    false
  )
  assert.equal((await store.handoff.claim("job")).length, 0)
  // Broker publication was interrupted after claim: the durable row stays pending.
  await pool.query(
    "UPDATE handoffs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [firstJob.id]
  )
  const [replayed] = await store.handoff.claim("job")
  assert.equal(replayed.id, firstJob.id)
  assert.notEqual(replayed.leaseToken, firstJob.leaseToken)
  assert.equal(
    await store.handoff.acknowledge(firstJob.id, firstJob.leaseToken),
    false
  )
  assert.equal(
    await store.handoff.acknowledge(replayed.id, replayed.leaseToken),
    true
  )
  const token = randomUUID()
  await store.commands.begin(owner.id, c.id, accepted.operationId, token)
  await store.commands.begin(
    owner.id,
    c.id,
    accepted.operationId,
    token.toUpperCase()
  )
  await assert.rejects(
    store.commands.begin(owner.id, c.id, accepted.operationId, randomUUID()),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.finalize(owner.id, c.id, accepted.operationId, {
      state: "completed",
      content: "Wrong runner",
      executionToken: randomUUID(),
    }),
    ConversationConflict
  )
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      store.commands.finalize(owner.id, c.id, accepted.operationId, {
        state: "completed",
        content: "Persisted answer",
        executionToken: token,
      })
    )
  )
  assert.ok(results.every((result) => result.status === "completed"))
  await assert.rejects(
    store.commands.finalize(owner.id, c.id, accepted.operationId, {
      state: "completed",
      content: "Changed answer",
      executionToken: token,
    }),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.retry(owner.id, c.id, accepted.operationId, randomUUID()),
    ConversationConflict
  )
  assert.equal(await store.commands.activeOperation(owner.id, c.id), null)
  assert.equal(
    (await store.getMessage(owner.id, c.id, accepted.assistantMessageId))
      .content,
    "Persisted answer"
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM handoffs WHERE type='message.completed' AND payload->'payload'->'message'->>'id'=$1",
        [accepted.assistantMessageId]
      )
    ).rows[0].count,
    1
  )
  const events = (
    await pool.query(
      "SELECT sequence FROM handoffs WHERE kind='event' ORDER BY sequence"
    )
  ).rows.map((row) => row.sequence)
  const payloads = (
    await pool.query("SELECT payload FROM handoffs WHERE kind='event'")
  ).rows
  for (const row of payloads)
    assert.ok(
      domainEventSchema.safeParse(JSON.parse(JSON.stringify(row.payload)))
        .success
    )
  const completed = payloads.find(
    (row) => row.payload.type === "message.completed"
  ).payload
  assert.equal(
    domainEventSchema.safeParse({ ...completed, conversationId: randomUUID() })
      .success,
    false
  )
  assert.equal(
    domainEventSchema.safeParse({ ...completed, type: "message.failed" })
      .success,
    false
  )
  assert.deepEqual(
    events,
    Array.from({ length: events.length }, (_, index) => index + 1)
  )
  const claims = await Promise.all([
    store.handoff.claim("event"),
    store.handoff.claim("event"),
  ])
  assert.equal(claims.flat().length, 1)
  const event = claims.flat()[0]
  assert.equal(event.sequence, 1)
  await pool.query(
    "UPDATE handoffs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [event.id]
  )
  const [retry] = await store.handoff.claim("event")
  assert.equal(retry.id, event.id)
  assert.equal(
    await store.handoff.acknowledge(event.id, event.leaseToken),
    false
  )
  assert.equal(
    await store.handoff.acknowledge(retry.id, retry.leaseToken),
    true
  )
  assert.equal((await store.handoff.claim("event"))[0].sequence, 2)
})

test("admission races with archive/delete are serialized without stranded or hidden operations", async (t) => {
  const { pool, store, owner } = await setup(t)
  for (const status of ["archived", "deleted"]) {
    for (let i = 0; i < 4; i++) {
      const c = await store.createConversation(owner.id)
      const outcomes = await Promise.allSettled([
        store.commands.submitText(
          owner.id,
          c.id,
          randomUUID(),
          "Concurrent admission"
        ),
        store.updateConversation(owner.id, c.id, { status }),
      ])
      assert.equal(
        outcomes.filter((result) => result.status === "fulfilled").length,
        1
      )
      const row = (
        await pool.query("SELECT status FROM conversations WHERE id=$1", [c.id])
      ).rows[0]
      const operations = (
        await pool.query(
          "SELECT status FROM operations WHERE conversation_id=$1",
          [c.id]
        )
      ).rows
      if (row.status === "active")
        assert.deepEqual(
          operations.map((operation) => operation.status),
          ["pending"]
        )
      else {
        assert.equal(row.status, status)
        assert.equal(operations.length, 0)
      }
    }
  }
})

test("controlled retry preserves the user turn and explicitly recovers expired admissions", async (t) => {
  const { pool, store, owner, conversation: c } = await setup(t)
  const accepted = await store.commands.submitText(
    owner.id,
    c.id,
    randomUUID(),
    "Original user turn"
  )
  await store.commands.finalize(owner.id, c.id, accepted.operationId, {
    state: "failed",
    content: "",
  })
  const retryId = randomUUID()
  const retries = await Promise.all(
    Array.from({ length: 8 }, () =>
      store.commands.retry(owner.id, c.id, accepted.operationId, retryId)
    )
  )
  assert.equal(new Set(retries.map((item) => item.operationId)).size, 1)
  const retry = retries[0]
  assert.equal(retry.userMessageId, accepted.userMessageId)
  assert.notEqual(retry.assistantMessageId, accepted.assistantMessageId)
  await assert.rejects(
    store.commands.retry(owner.id, c.id, accepted.operationId, randomUUID()),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.submitText(
      owner.id,
      c.id,
      retryId,
      "Identity reused for submit"
    ),
    ConversationConflict
  )
  await pool.query(
    "UPDATE operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [retry.operationId]
  )
  await assert.rejects(
    store.commands.finalize(owner.id, c.id, retry.operationId, {
      state: "completed",
      content: "Late answer",
    }),
    ConversationConflict
  )
  const recovered = await store.commands.retry(
    owner.id,
    c.id,
    retry.operationId,
    randomUUID()
  )
  assert.equal(recovered.userMessageId, accepted.userMessageId)
  assert.equal(
    (await store.commands.getOperation(owner.id, c.id, retry.operationId))
      .status,
    "interrupted"
  )
  assert.equal(
    (await store.getMessage(owner.id, c.id, retry.assistantMessageId)).state,
    "interrupted"
  )
  const history = await store.listMessages(owner.id, c.id)
  assert.equal(history.filter((message) => message.role === "user").length, 1)
  assert.deepEqual(
    history.map((message) => message.state),
    ["completed", "failed", "interrupted", "pending"]
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM handoffs WHERE kind='job' AND cancelled_at IS NULL"
      )
    ).rows[0].count,
    1
  )
  await assert.rejects(
    store.commands.begin(owner.id, c.id, retry.operationId, randomUUID()),
    ConversationConflict
  )
})

test("finalized adapter messages deduplicate stable deliveries but preserve repeated utterances", async (t) => {
  const { pool, store, owner, other, conversation: c } = await setup(t)
  const delivery = {
    deliveryId: randomUUID(),
    role: "user",
    modality: "voice",
    content: "Again",
  }
  const copies = await Promise.all(
    Array.from({ length: 10 }, () =>
      store.commands.persistFinalMessage(owner.id, c.id, delivery)
    )
  )
  assert.equal(new Set(copies.map((message) => message.id)).size, 1)
  await assert.rejects(
    store.updateMessage(owner.id, c.id, copies[0].id, {
      content: "Altered receipt",
      state: "completed",
    }),
    ConversationConflict
  )
  const repeated = await store.commands.persistFinalMessage(owner.id, c.id, {
    ...delivery,
    deliveryId: randomUUID(),
  })
  assert.notEqual(repeated.id, copies[0].id)
  await assert.rejects(
    store.commands.persistFinalMessage(owner.id, c.id, {
      ...delivery,
      content: "Changed",
    }),
    ConversationConflict
  )
  await assert.rejects(
    store.commands.persistFinalMessage(other.id, c.id, delivery),
    ResourceNotFound
  )
  const typed = await store.commands.persistFinalMessage(owner.id, c.id, {
    deliveryId: randomUUID(),
    role: "assistant",
    modality: "text",
    content: "Final text",
  })
  assert.equal(typed.state, "completed")
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM finalized_deliveries"
      )
    ).rows[0].count,
    3
  )
  const accepted = await store.commands.submitText(
    owner.id,
    c.id,
    randomUUID(),
    "Now generating"
  )
  assert.equal(accepted.status, "pending")
  await assert.rejects(
    store.commands.persistFinalMessage(owner.id, c.id, {
      ...delivery,
      deliveryId: randomUUID(),
    }),
    ConversationConflict
  )
})

test("handoff failure rolls back admissions, finalization, receipts, and sequence allocation", async (t) => {
  const { pool, store, owner, conversation: c } = await setup(t)
  const voice = await store.createConversation(owner.id)
  const enableFailure = () =>
    pool.query(
      "CREATE FUNCTION reject_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic handoff interruption'; END $$; CREATE TRIGGER reject_handoff BEFORE INSERT ON handoffs FOR EACH ROW EXECUTE FUNCTION reject_handoff()"
    )
  const disableFailure = () =>
    pool.query(
      "DROP TRIGGER reject_handoff ON handoffs; DROP FUNCTION reject_handoff()"
    )
  await enableFailure()
  const requestId = randomUUID()
  await assert.rejects(
    store.commands.submitText(owner.id, c.id, requestId, "Question")
  )
  assert.equal((await store.listMessages(owner.id, c.id)).length, 0)
  assert.equal(
    (await store.getConversation(owner.id, c.id)).nextMessageSequence,
    0
  )
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM operations")).rows[0]
      .count,
    0
  )
  const delivery = {
    deliveryId: randomUUID(),
    role: "assistant",
    modality: "voice",
    content: "Voice result",
  }
  await assert.rejects(
    store.commands.persistFinalMessage(owner.id, voice.id, delivery)
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM finalized_deliveries"
      )
    ).rows[0].count,
    0
  )
  await disableFailure()
  const accepted = await store.commands.submitText(
    owner.id,
    c.id,
    requestId,
    "Question"
  )
  await enableFailure()
  await assert.rejects(
    store.commands.finalize(owner.id, c.id, accepted.operationId, {
      state: "completed",
      content: "Answer",
    })
  )
  assert.equal(
    (await store.commands.getOperation(owner.id, c.id, accepted.operationId))
      .status,
    "pending"
  )
  assert.equal(
    (await store.getMessage(owner.id, c.id, accepted.assistantMessageId)).state,
    "pending"
  )
  await disableFailure()
  await store.commands.finalize(owner.id, c.id, accepted.operationId, {
    state: "completed",
    content: "Answer",
  })
  assert.equal(
    (await store.commands.persistFinalMessage(owner.id, voice.id, delivery))
      .sequence,
    1
  )
})

test("keyset pages retain microseconds, ties, account/filter scope and latest-first message windows", async (t) => {
  const { pool, store, owner, other, conversation: c } = await setup(t)
  const items = [c]
  for (let i = 0; i < 6; i++)
    items.push(await store.createConversation(owner.id, "Page " + i))
  for (let i = 0; i < items.length; i++)
    await pool.query(
      "UPDATE conversations SET updated_at=$1::timestamptz WHERE id=$2",
      ["2026-10-29T00:00:00.12300" + Math.floor(i / 2) + "Z", items[i].id]
    )
  const expected = (
    await pool.query(
      "SELECT id FROM conversations WHERE account_id=$1 ORDER BY updated_at DESC,id DESC",
      [owner.id]
    )
  ).rows.map((row) => row.id)
  const seen = []
  let cursor
  do {
    const page = await store.history.conversations(owner.id, {
      limit: 2,
      cursor,
    })
    seen.push(...page.items.map((row) => row.id))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  assert.deepEqual(seen, expected)
  const first = await store.history.conversations(owner.id, { limit: 2 })
  const token = JSON.parse(Buffer.from(first.nextCursor, "base64url"))
  assert.match(token.ts, /\.\d{6}Z$/)
  await assert.rejects(
    store.history.conversations(other.id, { cursor: first.nextCursor }),
    invalid
  )
  await assert.rejects(
    store.history.conversations(owner.id, {
      cursor: first.nextCursor,
      status: "active",
    }),
    invalid
  )
  for (const ts of [
    "2026-02-31T00:00:00.123000Z",
    "0000-01-01T00:00:00.123000Z",
    "2026-13-01T00:00:00.123000Z",
  ]) {
    const bad = Buffer.from(JSON.stringify({ ...token, ts })).toString(
      "base64url"
    )
    await assert.rejects(
      store.history.conversations(owner.id, { cursor: bad }),
      invalid
    )
  }
  await store.appendMessages(
    owner.id,
    c.id,
    Array.from({ length: 7 }, (_, i) => ({
      role: "user",
      modality: "text",
      content: String(i),
      state: "completed",
    }))
  )
  const latest = await store.history.messages(owner.id, c.id, { limit: 3 })
  assert.deepEqual(
    latest.items.map((row) => row.sequence),
    [5, 6, 7]
  )
  const older = await store.history.messages(owner.id, c.id.toUpperCase(), {
    limit: 3,
    cursor: latest.nextCursor,
  })
  assert.deepEqual(
    older.items.map((row) => row.sequence),
    [2, 3, 4]
  )
  assert.deepEqual(
    (
      await store.history.messages(owner.id, c.id, { cursor: older.nextCursor })
    ).items.map((row) => row.sequence),
    [1]
  )
  await assert.rejects(
    store.history.messages(owner.id, items[1].id, {
      cursor: latest.nextCursor,
    }),
    invalid
  )
  await assert.rejects(
    store.history.conversations(owner.id, { cursor: latest.nextCursor }),
    invalid
  )
  for (const bad of ["bad!", Buffer.from("{}").toString("base64url")])
    await assert.rejects(
      store.history.conversations(owner.id, { cursor: bad }),
      invalid
    )
  for (const limit of [0, 101, 1.5])
    await assert.rejects(
      store.history.messages(owner.id, c.id, { limit }),
      invalid
    )
  await store.updateConversation(owner.id, items[1].id, { status: "archived" })
  assert.equal(
    (await store.history.conversations(owner.id, { status: "archived" })).items
      .length,
    1
  )
  await store.updateConversation(owner.id, items[1].id, { status: "deleted" })
  assert.equal(
    (await store.history.conversations(owner.id, { status: "archived" })).items
      .length,
    0
  )
})

test("new server-side mutations canonicalize UUIDs before producing events", async (t) => {
  const { pool, store, owner, conversation } = await setup(t)
  const accountId = owner.id.toUpperCase()
  const conversationId = conversation.id.toUpperCase()
  const admitted = await store.commands.submitText(
    accountId,
    conversationId,
    randomUUID(),
    "New uppercase admission"
  )
  assert.equal(admitted.conversationId, conversation.id)
  await store.commands.finalize(
    accountId,
    conversationId,
    admitted.operationId,
    { state: "failed", content: "" }
  )
  const retried = await store.commands.retry(
    accountId,
    conversationId,
    admitted.operationId,
    randomUUID()
  )
  assert.equal(retried.conversationId, conversation.id)
  assert.equal(retried.userMessageId, admitted.userMessageId)

  const unmanaged = await store.createConversation(owner.id)
  const [message] = await store.appendMessages(
    accountId,
    unmanaged.id.toUpperCase(),
    [
      {
        role: "user",
        modality: "text",
        content: "Uppercase append",
        state: "completed",
      },
    ]
  )
  await store.updateMessage(accountId, unmanaged.id.toUpperCase(), message.id, {
    content: "Uppercase update",
    state: "completed",
  })
  await store.updateConversation(accountId, unmanaged.id.toUpperCase(), {
    title: "Canonical event",
  })

  const voice = await store.createConversation(owner.id)
  const finalized = await store.commands.persistFinalMessage(
    accountId,
    voice.id.toUpperCase(),
    {
      deliveryId: randomUUID(),
      role: "user",
      modality: "voice",
      content: "Uppercase finalized voice",
    }
  )
  assert.equal(finalized.conversationId, voice.id)
  const events = await pool.query(
    "SELECT payload FROM handoffs WHERE kind='event'"
  )
  for (const { payload } of events.rows) {
    const event = domainEventSchema.parse(payload)
    assert.equal(event.conversationId, event.conversationId.toLowerCase())
    if ("message" in event.payload)
      assert.equal(event.payload.message.conversationId, event.conversationId)
  }
})
