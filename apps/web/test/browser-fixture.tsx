// Test-only app: production Next routes never import this fixture or its adapters.
import { useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import {
  WorkspaceNavigation,
  WorkspaceScreen,
} from "../modules/workspace/workspace-screen"
import { createWorkspaceStore } from "../modules/workspace/model"
import {
  WorkspaceError,
  type WorkspaceApi,
  type Conversation,
} from "../modules/workspace/api"
import {
  initialConversationState,
  createConversationConnection,
  type MessageData,
  type OperationAdmission,
  type ConversationState,
} from "@conversations/shared"

const timestamp = new Date().toISOString(),
  ids = Array.from(
    { length: 24 },
    (_, index) =>
      `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
  )
let conversations: Conversation[] = ids.map((id, index) => ({
    id,
    title:
      index === 0 ? "A debugger's notebook" : "Conversation " + (index + 1),
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  })),
  failNext = false,
  loseNext = false
const histories = new Map<string, MessageData[]>(),
  operations = new Map<string, OperationAdmission>(),
  deliveries = new Map<string, OperationAdmission>(),
  connections = new Set<{ id: string; notify: () => void; phase: string }>()
histories.set(
  ids[0]!,
  Array.from({ length: 60 }, (_, index) => ({
    id: crypto.randomUUID(),
    conversationId: ids[0]!,
    sequence: index + 1,
    role: index % 2 ? "assistant" : "user",
    modality: "text",
    content:
      index % 2
        ? "Earlier reasoning, saved in this conversation."
        : "Earlier question " + (index + 1),
    state: "completed",
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
)
function snapshot(id: string): ConversationState {
  const messages = histories.get(id) ?? []
  return {
    ...initialConversationState(id),
    conversation: conversations.find((item) => item.id === id) ?? null,
    activeOperation: operations.get(id) ?? null,
    messages: messages.slice(-50),
    nextCursor:
      messages.length > 50 ? String(messages.at(-50)!.sequence) : null,
    needsReconciliation: false,
    checkpoint: messages.length,
  }
}
const notify = (id: string) => {
  for (const connection of connections)
    if (connection.id === id) connection.notify()
}
const factory: typeof createConversationConnection = (options) => {
  const connection = {
    id: options.conversationId,
    phase: "idle",
    notify: () =>
      options.onChange({
        phase: connection.phase === "live" ? "live" : "disconnected",
        state: snapshot(options.conversationId),
      }),
  }
  return {
    start() {
      connection.phase = "live"
      connections.add(connection)
      connection.notify()
    },
    stop() {
      connections.delete(connection)
      connection.phase = "idle"
      options.onChange({ phase: "idle", state: snapshot(connection.id) })
    },
    subscribe() {
      connection.phase = "live"
      connection.notify()
    },
    unsubscribe() {
      connection.phase = "idle"
    },
    current: () => ({
      phase: connection.phase === "live" ? "live" : "idle",
      state: snapshot(connection.id),
    }),
  }
}
function generate(
  id: string,
  request: string,
  input: string,
  original?: OperationAdmission
) {
  if (deliveries.has(request)) return deliveries.get(request)!
  if (operations.has(id)) throw new WorkspaceError(409)
  const history = histories.get(id) ?? [],
    userId = original?.userMessageId ?? crypto.randomUUID(),
    assistantId = crypto.randomUUID(),
    operation: OperationAdmission = {
      operationId: crypto.randomUUID(),
      conversationId: id,
      userMessageId: userId,
      assistantMessageId: assistantId,
      status: "pending",
      failureCode: null,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    }
  if (!original)
    history.push({
      id: userId!,
      conversationId: id,
      sequence: history.length + 1,
      role: "user",
      modality: "text",
      content: input,
      state: "completed",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  const assistant: MessageData = {
    id: assistantId,
    conversationId: id,
    sequence: history.length + 1,
    role: "assistant",
    modality: "text",
    content: "",
    state: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
    operationId: operation.operationId,
    failureCode: null,
  }
  history.push(assistant)
  histories.set(id, history)
  operations.set(id, operation)
  deliveries.set(request, operation)
  notify(id)
  const fail = failNext
  failNext = false
  setTimeout(() => {
    assistant.state = "streaming"
    assistant.content = "Let's work through this carefully…"
    operation.status = "running"
    notify(id)
  }, 100)
  setTimeout(() => {
    assistant.state = fail ? "failed" : "completed"
    assistant.content = fail
      ? "A partial answer was preserved."
      : "Start with a small, reproducible example.\n\n```ts\nconst result = inspect(input)\n```\n\nThen check the boundary conditions before adding complexity."
    assistant.failureCode = fail ? "provider_error" : null
    operation.status = fail ? "failed" : "completed"
    operation.failureCode = assistant.failureCode
    operations.delete(id)
    notify(id)
  }, 450)
  return operation
}
const api: WorkspaceApi = {
  account: async () => ({
    id: "20000000-0000-4000-8000-000000000001",
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
  list: async (status, cursor) => {
    const filtered = conversations.filter((item) => item.status === status),
      offset = Number(cursor ?? 0)
    return {
      items: filtered.slice(offset, offset + 20),
      nextCursor: filtered.length > offset + 20 ? String(offset + 20) : null,
    }
  },
  create: async () => {
    const value: Conversation = {
      id: crypto.randomUUID(),
      title: "New conversation",
      status: "active",
      createdAt: timestamp,
      updatedAt: new Date().toISOString(),
    }
    conversations = [value, ...conversations]
    return value
  },
  patch: async (id, patch) => {
    if (operations.has(id)) throw new WorkspaceError(409)
    const value = conversations.find((item) => item.id === id)
    if (!value) throw new WorkspaceError(404)
    Object.assign(value, patch)
    notify(id)
    return value
  },
  remove: async (id) => {
    conversations = conversations.filter((item) => item.id !== id)
    histories.delete(id)
  },
  older: async (id, cursor) => {
    const messages = (histories.get(id) ?? []).filter(
      (message) => message.sequence < Number(cursor)
    )
    return {
      items: messages.slice(-50),
      nextCursor:
        messages.length > 50 ? String(messages.at(-50)!.sequence) : null,
    }
  },
  submit: async (id, body) => {
    const result = generate(id, body.clientRequestId, body.content)
    if (loseNext) {
      loseNext = false
      throw new WorkspaceError(503)
    }
    return result
  },
  retry: async (id, operationId, request) => {
    const original = [...deliveries.values()].find(
      (item) => item.operationId === operationId
    )
    if (!original) throw new WorkspaceError(404)
    return generate(id, request, "", original)
  },
}
const store = createWorkspaceStore({
  api,
  url: "http://fixture.invalid",
  getToken: async () => null,
  navigate: (path) => {
    history.pushState(null, "", path)
    store.select(path.split("/")[2] ?? null)
  },
  connection: factory,
})
function App() {
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot
  )
  const navigate = (id: string | null) => {
    history.pushState(null, "", id ? "/conversations/" + id : "/conversations")
    store.select(id)
  }
  return (
    <ThemeProvider attribute="class">
      <SidebarProvider>
        <WorkspaceNavigation
          state={state}
          store={store}
          navigate={navigate}
          identity={<span className="text-sm">Fixture account</span>}
        />
        <main className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceScreen state={state} store={store} navigate={navigate} />
        </main>
      </SidebarProvider>
    </ThemeProvider>
  )
}
const host = document.getElementById("root")
if (!host) throw new Error("Fixture host missing")
createRoot(host).render(<App />)
void store.start()
declare global {
  interface Window {
    workspaceFixture: {
      store: typeof store
      failNext: () => void
      loseNext: () => void
      disconnect: () => void
      reconnect: () => void
    }
  }
}
window.workspaceFixture = {
  store,
  failNext: () => {
    failNext = true
  },
  loseNext: () => {
    loseNext = true
  },
  disconnect: () => {
    for (const connection of connections) {
      connection.phase = "disconnected"
      connection.notify()
    }
  },
  reconnect: () => {
    for (const connection of connections) {
      connection.phase = "live"
      connection.notify()
    }
  },
}
