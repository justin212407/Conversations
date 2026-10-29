import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import {
  initialConversationState,
  reconcileConversation,
  applyConversationEvent,
  applyProvisionalSnapshot,
  disconnectConversation,
  reconnectDelay,
  createConversationConnection,
} from "@conversations/shared"
import { until } from "./realtime-fixture.mjs"
import { loadRealtimeConfig } from "@conversations/service-runtime"
const { Response, queueMicrotask } = globalThis
function data() {
  const id = randomUUID(),
    messageId = randomUUID(),
    operationId = randomUUID(),
    now = new Date().toISOString()
  const message = {
    id: messageId,
    conversationId: id,
    sequence: 2,
    role: "assistant",
    modality: "text",
    content: "",
    state: "pending",
    operationId,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  }
  const operation = {
    operationId,
    conversationId: id,
    userMessageId: randomUUID(),
    assistantMessageId: messageId,
    status: "running",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    failureCode: null,
  }
  const snapshot = {
    conversation: {
      id,
      title: "Original",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    activeOperation: operation,
    messages: { items: [message], nextCursor: null },
    checkpoint: 10,
  }
  const event = (sequence, type, payload) => ({
    version: 1,
    eventId: randomUUID(),
    conversationId: id,
    sequence,
    type,
    payload,
    occurredAt: now,
  })
  const partial = (revision, content, streamId) =>
    event(10, "message.snapshot", {
      messageId,
      operationId,
      streamId,
      revision,
      state: "streaming",
      content,
    })
  return { id, now, message, operation, snapshot, event, partial }
}
test("reducer keeps provisional revision independent of checkpoint and preserves live retry metadata across optional legacy payloads", () => {
  const f = data(),
    streamId = randomUUID()
  let state = reconcileConversation(initialConversationState(f.id), f.snapshot)
  state = applyConversationEvent(
    state,
    f.event(11, "conversation.updated", {
      conversationId: f.id,
      title: "Renamed while streaming",
      status: "active",
    })
  )
  state = applyProvisionalSnapshot(
    state,
    f.partial(2, "Useful partial", streamId)
  )
  assert.equal(state.messages[0].content, "Useful partial")
  assert.equal(
    applyProvisionalSnapshot(state, f.partial(1, "Stale", streamId)),
    state
  )
  assert.equal(
    applyProvisionalSnapshot(
      state,
      f.partial(3, "Foreign stream", randomUUID())
    ),
    state
  )
  const { operationId, failureCode, ...legacy } = f.message
  assert.ok(operationId)
  assert.equal(failureCode, null)
  state = applyConversationEvent(
    state,
    f.event(12, "message.failed", {
      message: { ...legacy, state: "failed", content: "Useful partial" },
    })
  )
  state = applyConversationEvent(
    state,
    f.event(13, "operation.failed", {
      operation: {
        ...f.operation,
        status: "failed",
        failureCode: "provider_error",
      },
    })
  )
  assert.equal(state.messages[0].operationId, f.operation.operationId)
  assert.equal(state.messages[0].failureCode, "provider_error")
  assert.equal(state.activeOperation, null)
  assert.equal(
    applyProvisionalSnapshot(
      state,
      f.partial(99, "Late unsafe overwrite", streamId)
    ),
    state
  )
})
test("reducer deduplicates replay and restores contiguous order/gaps without mutating prior state; disconnect drops only provisional assumptions", () => {
  const f = data()
  let state = reconcileConversation(initialConversationState(f.id), f.snapshot)
  const later = f.event(12, "conversation.updated", {
      conversationId: f.id,
      title: "Later",
      status: "active",
    }),
    missing = f.event(11, "conversation.updated", {
      conversationId: f.id,
      title: "Earlier",
      status: "active",
    })
  const gap = applyConversationEvent(state, later)
  assert.equal(gap.needsReconciliation, true)
  assert.equal(gap.checkpoint, 10)
  state = applyConversationEvent(gap, missing)
  assert.equal(state.checkpoint, 12)
  assert.equal(state.conversation.title, "Later")
  assert.equal(state.needsReconciliation, false)
  assert.equal(gap.pending.length, 1)
  assert.equal(applyConversationEvent(state, later), state)
  const old = reconcileConversation(state, f.snapshot)
  assert.equal(old.checkpoint, 12)
  assert.equal(old.needsReconciliation, true)
  const reconciled = reconcileConversation(gap, {
    ...f.snapshot,
    checkpoint: 12,
    conversation: { ...f.snapshot.conversation, title: "Later" },
  })
  assert.equal(reconciled.checkpoint, 12)
  assert.equal(reconciled.pending.length, 0)
  const streaming = applyProvisionalSnapshot(
      state,
      f.partial(1, "Transient", randomUUID())
    ),
    disconnected = disconnectConversation(streaming)
  assert.equal(disconnected.messages[0].content, "")
  assert.equal(disconnected.messages[0].state, "pending")
  assert.equal(disconnected.needsReconciliation, true)
  for (let attempt = 0; attempt < 100; attempt++)
    for (const random of [() => 0, () => 0.5, () => 1])
      assert.ok(
        reconnectDelay(attempt, random) >= 125 &&
          reconnectDelay(attempt, random) <= 10000
      )
})

class Socket {
  readyState = 1
  listeners = new Map()
  addEventListener(type, callback) {
    const handlers = this.listeners.get(type) ?? []
    handlers.push(callback)
    this.listeners.set(type, handlers)
  }
  emit(type, event) {
    for (const callback of this.listeners.get(type) ?? []) callback(event)
  }
  send() {}
  close() {
    this.readyState = 3
    this.emit("close", { code: 1000 })
  }
}
test("browser deadlines recover hung token/ticket/ready/snapshot work and discard stale asynchronous epochs", async (t) => {
  for (const blocked of ["token", "ticket", "ready", "snapshot"]) {
    const f = data(),
      changes = []
    let tokens = 0,
      tickets = 0
    const transport = createConversationConnection({
      apiUrl: "http://fixture.invalid",
      conversationId: f.id,
      timeoutMs: 100,
      random: () => 0,
      onChange: (value) => changes.push(value),
      getToken: () => {
        tokens++
        return blocked === "token"
          ? new Promise(() => {})
          : Promise.resolve("signed-fixture")
      },
      fetch: async (url) => {
        if (url.endsWith("realtime-tickets")) {
          tickets++
          return blocked === "ticket"
            ? new Promise(() => {})
            : new Response(
                JSON.stringify({
                  ticket: "x".repeat(43),
                  url:
                    "ws://fixture.invalid/v1/connect?ticket=" + "x".repeat(43),
                })
              )
        }
        return blocked === "snapshot"
          ? new Promise(() => {})
          : new Response(JSON.stringify(f.snapshot))
      },
      createSocket: () => {
        const socket = new Socket()
        if (blocked !== "ready")
          queueMicrotask(() =>
            socket.emit("message", {
              data: JSON.stringify({
                version: 1,
                type: "connection.ready",
                connectionId: randomUUID(),
                conversationId: f.id,
                expiresAt: new Date(Date.now() + 60000).toISOString(),
              }),
            })
          )
        return socket
      },
    })
    t.after(() => transport.stop())
    transport.start()
    await until(() => changes.some((change) => change.phase === "disconnected"))
    await until(() => (blocked === "token" ? tokens >= 2 : tickets >= 2))
    transport.stop()
    const count = changes.length
    await delay(150)
    assert.equal(changes.length, count)
  }
})

test("stop during connecting or token resolution cannot create work or unhandled rejection", async () => {
  let transport,
    calls = 0
  transport = createConversationConnection({
    apiUrl: "http://fixture.invalid",
    conversationId: randomUUID(),
    getToken: () => {
      calls++
      return Promise.reject(new Error("Private token error"))
    },
    onChange: (value) => {
      if (value.phase === "connecting") transport.stop()
    },
  })
  transport.start()
  await delay(20)
  assert.equal(calls, 0)
  transport = createConversationConnection({
    apiUrl: "http://fixture.invalid",
    conversationId: randomUUID(),
    getToken: () => {
      calls++
      transport.stop()
      return Promise.reject(new Error("Private token error"))
    },
    onChange: () => {},
  })
  transport.start()
  await delay(20)
  assert.equal(calls, 1)
  assert.equal(transport.current().phase, "idle")
})

test("transport can restart after stopping during a pending snapshot and ignores the old completion", async (t) => {
  const f = data()
  let snapshotCalls = 0,
    resolveOld
  const old = new Promise((resolve) => {
    resolveOld = resolve
  })
  const transport = createConversationConnection({
    apiUrl: "http://fixture.invalid",
    conversationId: f.id,
    getToken: async () => "signed-fixture",
    onChange: () => {},
    fetch: async (url) => {
      if (url.endsWith("realtime-tickets"))
        return new Response(
          JSON.stringify({
            ticket: "x".repeat(43),
            url: "ws://fixture.invalid/v1/connect?ticket=" + "x".repeat(43),
          })
        )
      snapshotCalls++
      return snapshotCalls === 1
        ? old
        : new Response(
            JSON.stringify({
              ...f.snapshot,
              conversation: { ...f.snapshot.conversation, title: "Current" },
            })
          )
    },
    createSocket: () => {
      const socket = new Socket()
      queueMicrotask(() =>
        socket.emit("message", {
          data: JSON.stringify({
            version: 1,
            type: "connection.ready",
            connectionId: randomUUID(),
            conversationId: f.id,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        })
      )
      return socket
    },
  })
  t.after(() => transport.stop())
  transport.start()
  await until(() => snapshotCalls === 1)
  transport.stop()
  transport.start()
  await until(() => transport.current().phase === "live")
  assert.equal(snapshotCalls, 2)
  assert.equal(transport.current().state.conversation.title, "Current")
  resolveOld(new Response(JSON.stringify(f.snapshot)))
  await delay(20)
  assert.equal(transport.current().state.conversation.title, "Current")
})

test("resubscribe acknowledgement has a fresh deadline and recovers through a new ticket", async (t) => {
  const f = data(),
    changes = []
  let tickets = 0,
    socket
  const transport = createConversationConnection({
    apiUrl: "http://fixture.invalid",
    conversationId: f.id,
    timeoutMs: 100,
    random: () => 0,
    getToken: async () => "signed-fixture",
    onChange: (value) => changes.push(value.phase),
    fetch: async (url) => {
      if (url.endsWith("realtime-tickets")) {
        tickets++
        return new Response(
          JSON.stringify({
            ticket: "x".repeat(43),
            url: "ws://fixture.invalid/v1/connect?ticket=" + "x".repeat(43),
          })
        )
      }
      return new Response(JSON.stringify(f.snapshot))
    },
    createSocket: () => {
      socket = new Socket()
      const current = socket,
        connectionId = randomUUID()
      const control = (type) =>
        current.emit("message", {
          data: JSON.stringify({
            version: 1,
            type,
            connectionId,
            conversationId: f.id,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        })
      current.send = (text) => {
        if (JSON.parse(text).type === "unsubscribe")
          control("connection.unsubscribed")
      }
      queueMicrotask(() => control("connection.ready"))
      return current
    },
  })
  t.after(() => transport.stop())
  transport.start()
  await until(() => transport.current().phase === "live")
  transport.subscribe()
  await delay(150)
  assert.equal(tickets, 1, "An already desired subscription remains idempotent")
  transport.unsubscribe()
  assert.equal(transport.current().phase, "unsubscribed")
  transport.subscribe()
  await until(() => tickets >= 2)
  await until(() => transport.current().phase === "live")
  assert.ok(changes.includes("disconnected"))
})

test("realtime configuration fails closed in production and shares exact development Origins without exposing secrets", () => {
  const secret = "s".repeat(43)
  for (const env of [
    { NODE_ENV: "production" },
    {
      NODE_ENV: "production",
      REALTIME_INTERNAL_SECRET: secret,
      CLERK_AUTHORIZED_PARTIES: "http://localhost:3000",
    },
    { REALTIME_INTERNAL_SECRET: "short" },
    { CLERK_AUTHORIZED_PARTIES: "*" },
    { REALTIME_API_URL: "http://user:password@localhost:4300" },
  ])
    assert.throws(
      () => loadRealtimeConfig(env),
      (error) =>
        !error.message.includes(secret) && !error.message.includes("password")
    )
  assert.ok(
    loadRealtimeConfig({ CLERK_AUTHORIZED_PARTIES: "" }).origins.includes(
      "http://localhost:3000"
    )
  )
  assert.equal(
    loadRealtimeConfig({
      NODE_ENV: "production",
      REALTIME_INTERNAL_SECRET: secret,
      REALTIME_PUBLIC_URL: "wss://realtime.example/v1/connect",
      CLERK_AUTHORIZED_PARTIES: "https://app.example",
    }).REALTIME_INTERNAL_SECRET,
    secret
  )
})
