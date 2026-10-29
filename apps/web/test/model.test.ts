import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import {
  createConversationConnection,
  initialConversationState,
  type ConversationState,
  type OperationAdmission,
  type MessageData,
} from "@conversations/shared"
import {
  createWorkspaceStore,
  displayedMessages,
} from "../modules/workspace/model"
import {
  WorkspaceError,
  type WorkspaceApi,
  type Conversation,
} from "../modules/workspace/api"
import { pendingRequests } from "../modules/workspace/pending"

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    values,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const now = new Date().toISOString()
const conversation = (
  id: string = randomUUID(),
  title = "Conversation"
): Conversation => ({
  id,
  title,
  status: "active",
  createdAt: now,
  updatedAt: now,
})
const admission = (id: string): OperationAdmission => ({
  operationId: randomUUID(),
  conversationId: id,
  userMessageId: randomUUID(),
  assistantMessageId: randomUUID(),
  status: "pending",
  failureCode: null,
  expiresAt: new Date(Date.now() + 300000).toISOString(),
})
async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}
function setup(overrides: Partial<WorkspaceApi> = {}, storage = memory()) {
  const first = conversation(),
    second = conversation(),
    accountId = randomUUID(),
    submitted: Array<{
      id: string
      body: { clientRequestId: string; content: string }
    }> = [],
    retried: Array<{ id: string; operationId: string; requestId: string }> = [],
    navigated: string[] = []
  const api: WorkspaceApi = {
    account: async () => ({ id: accountId, createdAt: now, updatedAt: now }),
    list: async () => ({ items: [first, second], nextCursor: null }),
    create: async () => conversation(),
    patch: async (id, patch) => ({ ...conversation(id), ...patch }),
    remove: async () => {},
    older: async () => ({ items: [], nextCursor: null }),
    submit: async (id, body) => {
      submitted.push({ id, body })
      return admission(id)
    },
    retry: async (id, operationId, requestId) => {
      retried.push({ id, operationId, requestId })
      return admission(id)
    },
    ...overrides,
  }
  const connections: Array<{
    publish: (patch: Partial<ConversationState>) => void
    options: Parameters<typeof createConversationConnection>[0]
  }> = []
  const factory: typeof createConversationConnection = (options) => {
    let state: ConversationState = {
        ...initialConversationState(options.conversationId),
        conversation: conversation(options.conversationId),
        needsReconciliation: false,
      },
      phase: ReturnType<
        ReturnType<typeof createConversationConnection>["current"]
      >["phase"] = "idle"
    const publish = (patch: Partial<ConversationState>) => {
      state = { ...state, ...patch }
      options.onChange({ phase, state })
    }
    connections.push({ publish, options })
    return {
      start() {
        phase = "live"
        publish({})
      },
      stop() {
        phase = "idle"
        publish({})
      },
      subscribe() {},
      unsubscribe() {},
      current: () => ({ phase, state }),
    }
  }
  const store = createWorkspaceStore({
    api,
    url: "http://fixture.invalid",
    getToken: async () => "signed-session",
    navigate: (path) => navigated.push(path),
    storage,
    connection: factory,
  })
  return {
    store,
    api,
    storage,
    first,
    second,
    accountId,
    submitted,
    retried,
    navigated,
    connections,
  }
}

test("unknown text delivery survives reload and replays the same identity/body without optimistic duplicates", async () => {
  let attempts = 0
  const bodies: Array<{ clientRequestId: string; content: string }> = []
  const f = setup({
    submit: async (id, body) => {
      bodies.push(body)
      attempts++
      if (attempts === 1) throw new WorkspaceError(503)
      return admission(id)
    },
  })
  f.store.select(f.first.id)
  await f.store.start()
  f.store.setDraft("Preserve exactly this prompt")
  f.store.send()
  await flush()
  const pending = f.store.snapshot().intent
  assert.equal(pending?.kind, "text")
  assert.equal(displayedMessages(f.store.snapshot()).length, 0)
  f.store.stop()
  const next = setup(
    { account: f.api.account, submit: f.api.submit },
    f.storage
  )
  next.store.select(f.first.id)
  await next.store.start()
  assert.equal(
    next.store.snapshot().intent?.clientRequestId,
    pending?.clientRequestId
  )
  next.store.checkDelivery()
  await flush()
  assert.deepEqual(bodies[1], bodies[0])
  assert.equal(next.store.snapshot().intent, null)
  assert.equal(next.store.snapshot().draft, "")
  f.store.stop()
  next.store.stop()
})

test("terminal stream before delayed POST acknowledgement unlocks the next turn", async () => {
  const response = deferred<OperationAdmission>(),
    f = setup({ submit: () => response.promise })
  f.store.select(f.first.id)
  await f.store.start()
  f.store.setDraft("First")
  f.store.send()
  const accepted = admission(f.first.id),
    message: MessageData = {
      id: accepted.assistantMessageId!,
      conversationId: f.first.id,
      role: "assistant",
      modality: "text",
      sequence: 2,
      content: "Already done",
      state: "completed",
      createdAt: now,
      updatedAt: now,
      operationId: accepted.operationId,
      failureCode: null,
    }
  f.connections.at(-1)!.publish({ messages: [message], activeOperation: null })
  response.resolve(accepted)
  await flush()
  assert.equal(f.store.snapshot().admission, null)
  f.store.setDraft("Second")
  f.store.send()
  assert.equal(f.store.snapshot().sending, true)
  f.store.stop()
})

test("A→B→A fences stale delivery and clears only its matching saved request", async () => {
  const old = deferred<OperationAdmission>(),
    newer = deferred<OperationAdmission>(),
    pending = deferred<OperationAdmission>()
  let calls = 0
  const f = setup({
    submit: () =>
      ++calls === 1
        ? old.promise
        : calls === 2
          ? newer.promise
          : pending.promise,
  })
  f.store.select(f.first.id)
  await f.store.start()
  f.store.setDraft("Old")
  f.store.send()
  const oldId = f.store.snapshot().intent!.clientRequestId
  f.store.select(f.second.id)
  f.store.select(f.first.id)
  f.store.checkDelivery()
  newer.resolve({ ...admission(f.first.id), status: "completed" })
  await flush()
  f.store.setDraft("New draft")
  f.store.send()
  const newId = f.store.snapshot().intent!.clientRequestId
  old.resolve(admission(f.first.id))
  await flush()
  assert.notEqual(newId, oldId)
  assert.equal(f.store.snapshot().draft, "New draft")
  assert.equal(f.store.snapshot().intent?.clientRequestId, newId)
  assert.equal(
    pendingRequests(() => f.storage).get(f.accountId, f.first.id)
      ?.clientRequestId,
    newId
  )
  f.store.stop()
})

test("navigation resets lifecycle flags and stale mutation completion cannot navigate or overwrite another selection", async () => {
  const rename = deferred<Conversation>(),
    remove = deferred<void>(),
    f = setup({ patch: () => rename.promise, remove: () => remove.promise })
  f.store.select(f.first.id)
  await f.store.start()
  const result = f.store.change({ title: "Old title" })
  assert.equal(f.store.snapshot().changing, true)
  f.store.select(f.second.id)
  assert.equal(f.store.snapshot().changing, false)
  f.store.select(f.first.id)
  f.store.setDraft("Preserved draft")
  rename.resolve(conversation(f.first.id, "Old title"))
  assert.equal(await result, false)
  assert.equal(f.store.snapshot().draft, "Preserved draft")
  const deletion = f.store.remove()
  f.store.select(f.second.id)
  remove.resolve()
  assert.equal(await deletion, false)
  assert.equal(f.navigated.length, 0)
  assert.equal(f.store.snapshot().changing, false)
  f.store.stop()
})

test("controlled retry retains original operation identity with a new request and blocks another active/oversized text turn", async () => {
  const f = setup()
  f.store.select(f.first.id)
  await f.store.start()
  const operationId = randomUUID()
  f.store.retry(operationId)
  await flush()
  assert.equal(f.retried[0]!.operationId, operationId)
  f.store.setDraft("Blocked while admitted")
  f.store.send()
  assert.equal(f.submitted.length, 0)
  const active = admission(f.first.id)
  f.connections.at(-1)!.publish({ activeOperation: active })
  f.store.send()
  assert.equal(f.submitted.length, 0)
  f.store.select(f.second.id)
  f.store.setDraft("😀".repeat(16001))
  f.store.send()
  assert.equal(f.submitted.length, 0)
  assert.ok(f.store.snapshot().commandError)
  f.store.setDraft("😀".repeat(16000))
  f.store.send()
  await flush()
  assert.equal([...f.submitted[0]!.body.content].length, 16000)
  f.store.stop()
})

test("list pagination deduplicates IDs, filter races do not overwrite current results, and older history stays ordered", async () => {
  const stale = deferred<{
      items: Conversation[]
      nextCursor: string | null
    }>(),
    f = setup()
  let pages = 0
  f.api.list = async (status, cursor) => {
    if (status === "archived")
      return { items: [{ ...f.second, status: "archived" }], nextCursor: null }
    if (cursor) return { items: [f.first, f.second], nextCursor: null }
    return ++pages === 1
      ? { items: [f.first], nextCursor: "older" }
      : stale.promise
  }
  await f.store.start()
  await f.store.moreConversations()
  assert.equal(f.store.snapshot().conversations.length, 2)
  const refresh = f.store.refreshList()
  f.store.filter("archived")
  await flush()
  stale.resolve({ items: [f.first], nextCursor: null })
  await refresh
  assert.equal(f.store.snapshot().conversations[0]!.id, f.second.id)
  f.store.select(f.second.id)
  const newer: MessageData = {
      id: randomUUID(),
      conversationId: f.second.id,
      sequence: 3,
      role: "assistant",
      modality: "text",
      content: "Latest",
      state: "completed",
      createdAt: now,
      updatedAt: now,
    },
    older = { ...newer, id: randomUUID(), sequence: 1, content: "Old" }
  f.connections.at(-1)!.publish({ messages: [newer], nextCursor: "history" })
  f.api.older = async () => ({ items: [older, newer], nextCursor: null })
  await f.store.older()
  assert.deepEqual(
    displayedMessages(f.store.snapshot()).map((message) => message.sequence),
    [1, 3]
  )
  f.connections
    .at(-1)!
    .options.onChange({
      phase: "unavailable",
      state: initialConversationState(f.second.id),
    })
  assert.ok(
    f.store.snapshot().conversations.every((item) => item.id !== f.second.id)
  )
  f.store.stop()
})

test("pending storage is scoped, capped, validated and never silently evicts unknown deliveries", () => {
  const storage = memory(),
    pending = pendingRequests(() => storage),
    account = randomUUID(),
    other = randomUUID(),
    ids = Array.from({ length: 21 }, () => randomUUID())
  for (const id of ids.slice(0, 20))
    pending.save(account, id, {
      kind: "text",
      clientRequestId: randomUUID(),
      content: "Unconfirmed",
    })
  assert.throws(() =>
    pending.save(account, ids[20]!, {
      kind: "text",
      clientRequestId: randomUUID(),
      content: "Must not evict",
    })
  )
  assert.equal(pending.get(other, ids[0]!), null)
  assert.ok(pending.get(account, ids[0]!))
  assert.equal(pending.clear(account, ids[0]!, randomUUID()), false)
  const raw = storage.values.values().next().value
  assert.ok(raw)
  storage.setItem("conversations:pending:v1", "x".repeat(600000))
  assert.throws(() => pending.get(account, ids[0]!))
  storage.setItem("conversations:pending:v1", "malformed")
  assert.throws(() =>
    pending.save(account, ids[0]!, {
      kind: "text",
      clientRequestId: randomUUID(),
      content: "No overwrite",
    })
  )
  assert.equal(storage.getItem("conversations:pending:v1"), "malformed")
})

test("unavailable/full pending storage prevents mutation, and uncertain creation requires a list refresh", async () => {
  const storage = memory()
  storage.setItem("conversations:pending:v1", "malformed")
  const f = setup(
    {
      create: async () => {
        throw new WorkspaceError(503)
      },
    },
    storage
  )
  f.store.select(f.first.id)
  await f.store.start()
  f.store.setDraft("Keep it safe")
  f.store.send()
  await flush()
  assert.equal(f.submitted.length, 0)
  assert.equal(f.store.snapshot().draft, "Keep it safe")
  await f.store.create()
  assert.equal(f.store.snapshot().createUnknown, true)
  await f.store.refreshList()
  assert.equal(f.store.snapshot().createUnknown, false)
  f.store.stop()
})
