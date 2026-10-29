import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"
import { createWorkspaceApi } from "../modules/workspace/api.ts"
import {
  createWorkspaceStore,
  displayedMessages,
} from "../modules/workspace/model.ts"
import {
  createConversationConnection,
  TEXT_GENERATION_QUEUE,
} from "@conversations/shared"
import { redisConnectionOptions } from "../../../packages/service-runtime/dist/index.js"
import {
  fixture,
  until,
  origin,
} from "../../realtime/test/realtime-fixture.mjs"
import { createTextRuntime } from "../../worker/dist/text-runtime.js"
const { Queue } = createRequire(
  new URL("../../worker/package.json", import.meta.url)
)("bullmq")
const { WebSocket } = createRequire(
  new URL("../../realtime/package.json", import.meta.url)
)("ws")
const { fetch } = globalThis
function storage() {
  const map = new Map()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

test("workspace controller uses actual signed API/WS/worker history, safely replays lost acknowledgement and isolates another account", async (t) => {
  const f = await fixture(t),
    c = await f.create("Workspace integration"),
    owner = await f.store.provisionAccount("user_api_alice")
  await f.store.appendMessages(
    owner.id,
    c.id,
    Array.from({ length: 60 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      modality: "text",
      content: "Earlier turn " + index,
      state: "completed",
    }))
  )
  const prefix = "workspace_test_" + randomUUID(),
    contexts = []
  const runtime = createTextRuntime({
    store: f.store,
    redisUrl: f.redisUrl,
    prefix,
    timeoutMs: 1000,
    provider: {
      available: true,
      async *stream(context) {
        contexts.push(context)
        yield "Fixture "
        await delay(100)
        yield "answer"
      },
    },
  })
  runtime.start()
  t.after(async () => {
    await runtime.stopIntake()
    await runtime.close()
    const queue = new Queue(TEXT_GENERATION_QUEUE, {
      prefix,
      connection: {
        ...redisConnectionOptions(f.redisUrl),
        maxRetriesPerRequest: 1,
      },
    })
    try {
      await queue.obliterate({ force: true })
    } finally {
      await queue.close()
    }
  })
  let loseAcknowledgement = true
  const http = async (url, init) => {
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, origin },
    })
    if (
      loseAcknowledgement &&
      init.method === "POST" &&
      url.endsWith("/messages")
    ) {
      loseAcknowledgement = false
      await response.arrayBuffer()
      throw new Error("Simulated lost acknowledgement")
    }
    return response
  }
  const connection = (options) =>
    createConversationConnection({
      ...options,
      fetch: http,
      createSocket: (url) => new WebSocket(url, { origin }),
    })
  const saved = storage(),
    api = createWorkspaceApi({
      url: f.config.REALTIME_API_URL,
      getToken: async () => f.tokens.alice,
      fetch: http,
    })
  const store = createWorkspaceStore({
    api,
    url: f.config.REALTIME_API_URL,
    getToken: async () => f.tokens.alice,
    navigate: () => {},
    storage: saved,
    connection,
  })
  t.after(() => store.stop())
  store.select(c.id)
  await store.start()
  await until(() => store.snapshot().phase === "live")
  assert.equal(displayedMessages(store.snapshot()).length, 50)
  await store.older()
  assert.equal(displayedMessages(store.snapshot()).length, 60)
  store.setDraft("Continue without duplicating")
  store.send()
  await until(() => store.snapshot().intent && !store.snapshot().sending)
  const requestId = store.snapshot().intent.clientRequestId
  await until(() =>
    displayedMessages(store.snapshot()).some(
      (message) =>
        message.role === "assistant" &&
        message.content === "Fixture answer" &&
        message.state === "completed"
    )
  )
  store.checkDelivery()
  await until(() => store.snapshot().intent === null)
  assert.equal(store.snapshot().admission, null)
  assert.equal(contexts.length, 1)
  assert.equal(contexts[0].length, 61)
  assert.equal(contexts[0].at(-1).content, "Continue without duplicating")
  const rows = await f.pool.query(
    "SELECT client_request_id FROM operations WHERE conversation_id=$1",
    [c.id]
  )
  assert.equal(rows.rowCount, 1)
  assert.equal(rows.rows[0].client_request_id, requestId)
  const reload = createWorkspaceStore({
    api,
    url: f.config.REALTIME_API_URL,
    getToken: async () => f.tokens.alice,
    navigate: () => {},
    storage: saved,
    connection,
  })
  t.after(() => reload.stop())
  reload.select(c.id)
  await reload.start()
  await until(() => reload.snapshot().phase === "live")
  assert.equal(
    displayedMessages(reload.snapshot()).filter(
      (message) => message.content === "Fixture answer"
    ).length,
    1
  )
  const bobHttp = (url, init) =>
      fetch(url, { ...init, headers: { ...init.headers, origin } }),
    bob = createWorkspaceStore({
      api: createWorkspaceApi({
        url: f.config.REALTIME_API_URL,
        getToken: async () => f.tokens.bob,
        fetch: bobHttp,
      }),
      url: f.config.REALTIME_API_URL,
      getToken: async () => f.tokens.bob,
      navigate: () => {},
      storage: saved,
      connection: (options) =>
        createConversationConnection({
          ...options,
          fetch: bobHttp,
          createSocket: (url) => new WebSocket(url, { origin }),
        }),
    })
  t.after(() => bob.stop())
  bob.select(c.id)
  await bob.start()
  await until(() => bob.snapshot().phase === "unavailable")
  assert.equal(displayedMessages(bob.snapshot()).length, 0)
  assert.equal(bob.snapshot().draft, "")
  assert.ok(bob.snapshot().conversations.every((item) => item.id !== c.id))
  assert.notEqual(bob.snapshot().accountId, store.snapshot().accountId)
})
