import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID, createHash } from "node:crypto"
import { Buffer } from "node:buffer"
import { URL } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { WebSocket } from "ws"
import {
  domainEventSchema,
  provisionalMessageSnapshotSchema,
  provisionalChannel,
  durableChannel,
  createConversationConnection,
  conversationSnapshotSchema,
} from "@conversations/shared"
import { relayConversationEvents } from "../../api/dist/realtime.js"
import { fixture, until, origin } from "./realtime-fixture.mjs"
const { fetch } = globalThis

async function rejected(url, headers = { origin }) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, headers)
    ws.on("error", () => {})
    ws.on("unexpected-response", (_request, response) => {
      response.resume()
      resolve(response.statusCode)
      ws.terminate()
    })
    ws.on("open", () => {
      resolve(101)
      ws.close()
    })
  })
}
const key = (f, kind, id) =>
  `${f.config.REALTIME_REDIS_PREFIX}:${kind}:${createHash("sha256").update(id).digest("hex")}`

test("tickets use actual Clerk verification, ownership/exact Origin, sixty-second TTL and atomic one-use redemption", async (t) => {
  const f = await fixture(t),
    mine = await f.create(),
    foreign = await f.create("Foreign", "bob")
  for (const [body, actor, headers, status] of [
    [{ conversationId: mine.id }, null, { origin }, 401],
    [{ conversationId: foreign.id }, "alice", { origin }, 404],
    [
      { conversationId: mine.id },
      "alice",
      { origin: "https://evil.invalid" },
      401,
    ],
    [
      { conversationId: mine.id, accountId: randomUUID() },
      "alice",
      { origin },
      400,
    ],
  ])
    assert.equal(
      (await f.request("POST", "/v1/realtime-tickets", body, actor, headers))
        .statusCode,
      status
    )
  const issued = await f.ticket(mine.id),
    ttl = await f.redis.pttl(key(f, "ticket", issued.ticket))
  assert.ok(ttl > 58000 && ttl <= 60000)
  assert.equal(new URL(issued.url).searchParams.get("ticket"), issued.ticket)
  assert.ok(!JSON.stringify(issued).includes(f.tokens.alice))
  const requests = await Promise.all(
    Array.from({ length: 12 }, () =>
      f.request(
        "POST",
        "/internal/realtime/redeem",
        { ticket: issued.ticket, origin },
        null,
        { authorization: "Bearer " + f.config.REALTIME_INTERNAL_SECRET }
      )
    )
  )
  assert.equal(requests.filter((r) => r.statusCode === 200).length, 1)
  assert.ok(requests.every((r) => [200, 401].includes(r.statusCode)))
  assert.equal(await rejected(issued.url), 401)
  const expired = await f.ticket(mine.id)
  await f.redis.pexpire(key(f, "ticket", expired.ticket), 1)
  await delay(10)
  assert.equal(await rejected(expired.url), 401)
  const wrong = await f.ticket(mine.id)
  assert.equal(
    await rejected(wrong.url, { origin: "https://evil.invalid" }),
    401
  )
  assert.equal(await rejected(wrong.url + "&conversationId=" + foreign.id), 401)
  assert.equal(
    (
      await f.request(
        "POST",
        "/internal/realtime/check",
        { connectionId: randomUUID() },
        null,
        { authorization: "Bearer " + "x".repeat(43) }
      )
    ).statusCode,
    401
  )
  const logs = f.logs.join("")
  for (const secret of [
    issued.ticket,
    expired.ticket,
    wrong.ticket,
    f.tokens.alice,
    f.config.REALTIME_INTERNAL_SECRET,
  ])
    assert.ok(!logs.includes(secret))
})

test("actual Redis/WebSocket fan-out preserves durable identities, voice final messages and replaceable snapshots", async (t) => {
  const f = await fixture(t),
    conversation = await f.create(),
    client = await f.open(conversation.id)
  const submitted = await f.request(
    "POST",
    `/v1/conversations/${conversation.id}/messages`,
    { clientRequestId: randomUUID(), content: "Continue" }
  )
  const op = submitted.json(),
    streamId = randomUUID()
  const snapshot = provisionalMessageSnapshotSchema.parse({
    version: 1,
    eventId: randomUUID(),
    type: "message.snapshot",
    conversationId: conversation.id,
    sequence: 1,
    occurredAt: new Date().toISOString(),
    payload: {
      messageId: op.assistantMessageId,
      operationId: op.operationId,
      streamId,
      revision: 1,
      state: "streaming",
      content: "Provisional",
    },
  })
  await f.redis.publish(
    provisionalChannel(conversation.id),
    JSON.stringify(snapshot)
  )
  await until(() =>
    client.frames.some((frame) => frame.eventId === snapshot.eventId)
  )
  const token = randomUUID()
  await f.store.commands.begin(
    (await f.store.provisionAccount("user_api_alice")).id,
    conversation.id,
    op.operationId,
    token
  )
  await f.store.commands.finalize(
    (await f.store.provisionAccount("user_api_alice")).id,
    conversation.id,
    op.operationId,
    { state: "completed", content: "Persisted", executionToken: token }
  )
  await until(() =>
    client.frames.some((frame) => frame.type === "operation.completed")
  )
  const events = client.frames
    .filter(
      (frame) =>
        !frame.type.startsWith("connection.") &&
        frame.type !== "message.snapshot"
    )
    .map((frame) => domainEventSchema.parse(frame))
  assert.deepEqual(
    events.map((event) => event.sequence),
    [...events.map((event) => event.sequence)].sort((a, b) => a - b)
  )
  const owner = await f.store.provisionAccount("user_api_alice")
  await f.store.commands.persistFinalMessage(owner.id, conversation.id, {
    deliveryId: randomUUID(),
    role: "user",
    modality: "voice",
    content: "Final voice transcript",
  })
  await until(() =>
    client.frames.some((frame) => frame.payload?.message?.modality === "voice")
  )
  const authoritative = conversationSnapshotSchema.parse(
    (
      await f.request(
        "GET",
        `/v1/conversations/${conversation.id}/snapshot?limit=1`
      )
    ).json()
  )
  assert.equal(authoritative.messages.items.length, 1)
  assert.ok(authoritative.messages.nextCursor)
  assert.equal(authoritative.messages.items[0].modality, "voice")
  const last = (
    await f.pool.query(
      "SELECT payload FROM handoffs WHERE conversation_id=$1 AND sequence=$2",
      [conversation.id, authoritative.checkpoint]
    )
  ).rows[0].payload
  assert.equal(last.type, "message.completed")
  client.ws.close()
})

test("event relay publication-before-ack replay retains IDs and does not lose later ordered delivery", async (t) => {
  const f = await fixture(t, { relay: false }),
    conversation = await f.create(),
    client = await f.open(conversation.id)
  await assert.rejects(() =>
    relayConversationEvents(f.store, f.redis, {
      afterPublish: async () => {
        throw new Error("publication interruption")
      },
    })
  )
  await until(() =>
    client.frames.some((frame) => frame.type === "conversation.created")
  )
  const event = client.frames.find(
    (frame) => frame.type === "conversation.created"
  )
  assert.equal(
    (
      await f.pool.query("SELECT delivered_at FROM handoffs WHERE id=$1", [
        event.eventId,
      ])
    ).rows[0].delivered_at,
    null
  )
  await f.pool.query(
    "UPDATE handoffs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [event.eventId]
  )
  await relayConversationEvents(f.store, f.redis)
  await until(
    () =>
      client.frames.filter((frame) => frame.eventId === event.eventId)
        .length === 2
  )
  await f.store.updateConversation(
    (await f.store.provisionAccount("user_api_alice")).id,
    conversation.id,
    { title: "Later" }
  )
  await relayConversationEvents(f.store, f.redis)
  await until(() =>
    client.frames.some((frame) => frame.type === "conversation.updated")
  )
  assert.equal(
    client.frames.find((frame) => frame.type === "conversation.updated")
      .sequence,
    event.sequence + 1
  )
  client.ws.close()
})

test("unsubscribe/resubscribe stays in scope, removes presence and rejects arbitrary controls/oversized payloads", async (t) => {
  const f = await fixture(t),
    conversation = await f.create(),
    client = await f.open(conversation.id)
  client.ws.send(JSON.stringify({ version: 1, type: "unsubscribe" }))
  await until(() =>
    client.frames.some((frame) => frame.type === "connection.unsubscribed")
  )
  assert.equal(
    (await f.redis.pubsub("NUMSUB", durableChannel(conversation.id)))[1],
    0
  )
  client.ws.send(JSON.stringify({ version: 1, type: "subscribe" }))
  await until(
    () =>
      client.frames.filter((frame) => frame.type === "connection.ready")
        .length === 2
  )
  client.ws.send(
    JSON.stringify({
      version: 1,
      type: "subscribe",
      conversationId: randomUUID(),
    })
  )
  await until(() => client.closed())
  assert.equal(client.closed(), 1008)
  const oversized = await f.open(conversation.id)
  oversized.ws.send("x".repeat(2048))
  await until(() => oversized.closed())
  assert.equal(oversized.closed(), 1009)
  await until(
    async () =>
      (await f.redis.pubsub("NUMSUB", durableChannel(conversation.id)))[1] === 0
  )
})

test("periodic access/expiry/heartbeat checks fail closed and release socket grants", async (t) => {
  const f = await fixture(t),
    conversation = await f.create(),
    client = await f.open(conversation.id)
  const ready = client.frames[0],
    other = await f.store.provisionAccount("user_api_bob")
  await f.pool.query("UPDATE conversations SET account_id=$1 WHERE id=$2", [
    other.id,
    conversation.id,
  ])
  await until(() => client.closed())
  assert.equal(client.closed(), 4003)
  await until(
    async () =>
      (await f.redis.exists(key(f, "grant", ready.connectionId))) === 0
  )
  const heartbeat = await f.open((await f.create()).id, { autoPong: false })
  await until(() => heartbeat.closed())
  assert.equal(heartbeat.closed(), 1001)
  const expiring = await fixture(t, { tokenSeconds: 3 }),
    expClient = await expiring.open((await expiring.create()).id)
  await until(() => expClient.closed())
  assert.equal(expClient.closed(), 4001)
})

test("browser transport subscribes before snapshot, recovers restart and Redis interruption, and preserves missed durable history", async (t) => {
  const f = await fixture(t),
    conversation = await f.create(),
    changes = []
  const transport = createConversationConnection({
    apiUrl: f.config.REALTIME_API_URL,
    conversationId: conversation.id,
    getToken: async () => f.tokens.alice,
    onChange: (state) => changes.push(state),
    random: () => 0,
    createSocket: (url) => new WebSocket(url, { origin }),
    fetch: (url, init) =>
      fetch(url, { ...init, headers: { ...init.headers, origin } }),
  })
  t.after(() => transport.stop())
  transport.start()
  await until(() => transport.current().phase === "live")
  const owner = await f.store.provisionAccount("user_api_alice")
  await f.store.updateConversation(owner.id, conversation.id, {
    title: "Before restart",
  })
  await until(
    () => transport.current().state.conversation?.title === "Before restart"
  )
  await f.restart()
  await f.store.updateConversation(owner.id, conversation.id, {
    title: "During restart",
  })
  await until(
    () =>
      transport.current().phase === "live" &&
      transport.current().state.conversation?.title === "During restart"
  )
  const clients = await f.redis.client("LIST", "TYPE", "pubsub")
  const line = clients
    .split("\n")
    .find((value) =>
      value.includes("name=" + f.config.REALTIME_REDIS_PREFIX + "-subscriber ")
    )
  assert.ok(line, "Own subscriber must have an isolated connection name")
  await f.redis.client("KILL", "ID", line.match(/^id=(\d+)/)[1])
  await f.store.updateConversation(owner.id, conversation.id, {
    title: "During Redis interruption",
  })
  await until(
    () =>
      transport.current().phase === "live" &&
      transport.current().state.conversation?.title ===
        "During Redis interruption"
  )
  assert.ok(
    changes.filter((change) => change.phase === "reconciling").length >= 3
  )
  await f.store.updateConversation(owner.id, conversation.id, {
    status: "deleted",
  })
  await until(() => transport.current().phase === "unavailable")
  assert.equal(transport.current().state.messages.length, 0)
})

test("atomic snapshots and checkpoints serialize with concurrent conversation mutations", async (t) => {
  const f = await fixture(t),
    conversation = await f.create("Initial"),
    owner = await f.store.provisionAccount("user_api_alice")
  const snapshots = []
  await Promise.all(
    Array.from({ length: 16 }, async (_, index) => {
      await Promise.all([
        f.store.updateConversation(owner.id, conversation.id, {
          title: "Revision " + index,
        }),
        f.store.history
          .snapshot(owner.id, conversation.id)
          .then((value) => snapshots.push(value)),
      ])
    })
  )
  for (const snapshot of snapshots) {
    const event = (
      await f.pool.query(
        "SELECT payload FROM handoffs WHERE conversation_id=$1 AND sequence=$2",
        [conversation.id, snapshot.checkpoint]
      )
    ).rows[0].payload
    if (event.type === "conversation.updated")
      assert.equal(snapshot.conversation.title, event.payload.title)
    else assert.equal(snapshot.conversation.title, "Initial")
  }
  assert.equal(
    (
      await f.request(
        "GET",
        `/v1/conversations/${conversation.id}/snapshot`,
        undefined,
        "bob"
      )
    ).statusCode,
    404
  )
})

test("concurrent snapshot completion and delayed/out-of-order durable delivery reconcile without lost or duplicated messages", async (t) => {
  const f = await fixture(t, { relay: false }),
    conversation = await f.create(),
    owner = await f.store.provisionAccount("user_api_alice")
  let subscribed = false,
    inserted = false
  const connection = createConversationConnection({
    apiUrl: f.config.REALTIME_API_URL,
    conversationId: conversation.id,
    getToken: async () => f.tokens.alice,
    onChange: () => {},
    random: () => 0,
    createSocket: (url) => {
      const ws = new WebSocket(url, { origin })
      ws.on("message", (data) => {
        if (JSON.parse(data.toString()).type === "connection.ready")
          subscribed = true
      })
      return ws
    },
    fetch: async (url, init) => {
      const response = await fetch(url, {
        ...init,
        headers: { ...init.headers, origin },
      })
      if (url.endsWith("/snapshot") && !inserted) {
        assert.equal(subscribed, true)
        const snapshot = await response.json()
        inserted = true
        await f.store.commands.persistFinalMessage(owner.id, conversation.id, {
          deliveryId: randomUUID(),
          role: "user",
          modality: "voice",
          content: "Concurrent persisted turn",
        })
        await relayConversationEvents(f.store, f.redis)
        await relayConversationEvents(f.store, f.redis)
        await delay(100)
        return new globalThis.Response(JSON.stringify(snapshot))
      }
      return response
    },
  })
  t.after(() => connection.stop())
  connection.start()
  await until(
    () =>
      connection.current().phase === "live" &&
      connection.current().state.messages.length === 1
  )
  await f.store.updateConversation(owner.id, conversation.id, {
    title: "Earlier update",
  })
  await f.store.updateConversation(owner.id, conversation.id, {
    title: "Latest update",
  })
  const updates = (
    await f.pool.query(
      "SELECT payload FROM handoffs WHERE conversation_id=$1 AND type='conversation.updated' ORDER BY sequence",
      [conversation.id]
    )
  ).rows.map((row) => row.payload)
  await f.redis.publish(
    durableChannel(conversation.id),
    JSON.stringify(updates[1])
  )
  await until(
    () =>
      connection.current().phase === "live" &&
      connection.current().state.conversation?.title === "Latest update"
  )
  await f.redis.publish(
    durableChannel(conversation.id),
    JSON.stringify(updates[0])
  )
  await delay(100)
  assert.equal(connection.current().state.conversation.title, "Latest update")
  assert.equal(connection.current().state.messages.length, 1)
})

test("overlapping subscription generations wait for authorization and fail closed when API checks become unavailable", async (t) => {
  let release,
    entered = 0,
    block = true,
    unavailable = false
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const f = await fixture(t, {
      onCheck: async () => {
        entered++
        if (unavailable) throw new Error("API dependency unavailable")
        if (block) await pending
      },
    }),
    conversation = await f.create(),
    issued = await f.ticket(conversation.id)
  const ws = new WebSocket(issued.url, { origin }),
    frames = []
  let closed
  ws.on("error", () => {})
  ws.on("message", (data) => frames.push(JSON.parse(data.toString())))
  ws.on("close", (code) => {
    closed = code
  })
  await until(() => entered === 1)
  ws.send(JSON.stringify({ version: 1, type: "unsubscribe" }))
  ws.send(JSON.stringify({ version: 1, type: "subscribe" }))
  await until(() =>
    frames.some((frame) => frame.type === "connection.unsubscribed")
  )
  assert.equal(
    frames.filter((frame) => frame.type === "connection.ready").length,
    0
  )
  block = false
  release()
  await until(() => frames.some((frame) => frame.type === "connection.ready"))
  assert.equal(
    frames.filter((frame) => frame.type === "connection.ready").length,
    1
  )
  unavailable = true
  await until(() => closed)
  assert.equal(closed, 1013)
  unavailable = false
  const spam = await f.open(conversation.id)
  for (let index = 0; index < 30; index++)
    spam.ws.send(JSON.stringify({ version: 1, type: "subscribe" }))
  await until(() => spam.closed())
  assert.equal(spam.closed(), 1008)
})

test("maximum finalized content fits the frame contract and slow consumers release bounded socket state", async (t) => {
  const f = await fixture(t, { relay: false, heartbeatMs: 30000 }),
    conversation = await f.create(),
    client = await f.open(conversation.id),
    owner = await f.store.provisionAccount("user_api_alice")
  await f.store.commands.persistFinalMessage(owner.id, conversation.id, {
    deliveryId: randomUUID(),
    role: "assistant",
    modality: "voice",
    content: "\u0001".repeat(64000),
  })
  const event = (
    await f.pool.query(
      "SELECT payload FROM handoffs WHERE conversation_id=$1 AND type='message.completed'",
      [conversation.id]
    )
  ).rows[0].payload
  const frame = JSON.stringify(event)
  assert.ok(Buffer.byteLength(frame) < 512 * 1024)
  await f.redis.publish(durableChannel(conversation.id), frame)
  await until(() =>
    client.frames.some((item) => item.eventId === event.eventId)
  )
  assert.equal(
    client.frames.find((item) => item.eventId === event.eventId).payload.message
      .content.length,
    64000
  )
  client.ws._socket.pause()
  const grantKey = key(f, "grant", client.frames[0].connectionId)
  for (let index = 0; index < 100; index++) {
    await f.redis.publish(durableChannel(conversation.id), frame)
    if (index % 5 === 0 && !(await f.redis.exists(grantKey))) break
  }
  await until(async () => !(await f.redis.exists(grantKey)))
  client.ws._socket.resume()
  await until(() => client.closed())
  assert.ok([1013, 1006].includes(client.closed()))
})
