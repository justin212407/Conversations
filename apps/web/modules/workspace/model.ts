import {
  createConversationConnection,
  initialConversationState,
  type ConversationState,
  type MessageData,
  type OperationAdmission,
} from "@conversations/shared"
import {
  WorkspaceError,
  userError,
  type Conversation,
  type WorkspaceApi,
} from "./api"

import { pendingRequests, type PendingIntent } from "./pending"
type Connection = ReturnType<typeof createConversationConnection>
export type WorkspaceState = {
  account: "loading" | "ready" | "error"
  accountId: string | null
  error: string | null
  filter: "active" | "archived"
  conversations: Conversation[]
  listLoading: boolean
  listError: string | null
  listCursor: string | null
  creating: boolean
  createUnknown: boolean
  selectedId: string | null
  phase: ReturnType<Connection["current"]>["phase"]
  conversation: ConversationState | null
  older: MessageData[]
  olderCursor: string | null
  olderLoaded: boolean
  olderLoading: boolean
  olderError: string | null
  draft: string
  intent: PendingIntent | null
  sending: boolean
  admission: OperationAdmission | null
  commandError: string | null
  changing: boolean
}
const initial = (): WorkspaceState => ({
  account: "loading",
  accountId: null,
  error: null,
  filter: "active",
  conversations: [],
  listLoading: false,
  listError: null,
  listCursor: null,
  creating: false,
  createUnknown: false,
  selectedId: null,
  phase: "idle",
  conversation: null,
  older: [],
  olderCursor: null,
  olderLoaded: false,
  olderLoading: false,
  olderError: null,
  draft: "",
  intent: null,
  sending: false,
  admission: null,
  commandError: null,
  changing: false,
})
const unique = (items: Conversation[]) =>
  [...new Map(items.map((item) => [item.id, item])).values()].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
  )
export function displayedMessages(state: WorkspaceState) {
  return [
    ...new Map(
      [...state.older, ...(state.conversation?.messages ?? [])].map(
        (message) => [message.id, message]
      )
    ).values(),
  ].sort((a, b) => a.sequence - b.sequence)
}
export function createWorkspaceStore(options: {
  api: WorkspaceApi
  url: string
  getToken: () => Promise<string | null>
  navigate: (url: string) => void
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">
  connection?: typeof createConversationConnection
  uuid?: () => string
}) {
  let state = initial(),
    running = false,
    generation = 0,
    selection = 0,
    listRequest = 0,
    olderRequest = 0,
    controller: AbortController | undefined,
    connection: Connection | undefined
  const listeners = new Set<() => void>(),
    uuid = options.uuid ?? (() => crypto.randomUUID())
  const storage = () => options.storage ?? globalThis.sessionStorage
  const pending = pendingRequests(storage)
  const emit = (patch: Partial<WorkspaceState>) => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  function clearIntent(account: string, id: string, request: string) {
    try {
      pending.clear(account, id, request)
    } catch {
      // A retained acknowledged UUID is safe to replay after storage failure.
    }
  }
  function remember(intent: PendingIntent) {
    if (!state.accountId || !state.selectedId) throw new WorkspaceError(0)
    pending.save(state.accountId, state.selectedId, intent)
  }
  function current(session: number, id?: string | null, selected?: number) {
    return (
      running &&
      generation === session &&
      (id === undefined || state.selectedId === id) &&
      (selected === undefined || selected === selection)
    )
  }
  function connect() {
    connection?.stop()
    connection = undefined
    const id = state.selectedId,
      session = generation,
      selected = ++selection
    if (!id || !state.accountId || !running) return
    let intent: PendingIntent | null = null,
      storageError: string | null = null
    try {
      intent = pending.get(state.accountId, id)
    } catch {
      storageError =
        "Saved delivery state is unavailable. Check conversation history before using a new browser session."
    }
    emit({
      phase: "connecting",
      conversation: initialConversationState(id),
      older: [],
      olderCursor: null,
      olderLoaded: false,
      olderLoading: false,
      olderError: null,
      draft: intent?.kind === "text" ? intent.content : "",
      intent,
      admission: null,
      commandError: storageError,
      sending: false,
      changing: false,
    })
    connection = (options.connection ?? createConversationConnection)({
      apiUrl: options.url,
      conversationId: id,
      getToken: options.getToken,
      onChange: (value) => {
        if (!current(session, id) || selection !== selected) return
        const reset =
          value.phase === "reconciling" && state.phase !== "reconciling"
        if (reset) olderRequest++
        const admitted = state.admission,
          message = value.state.messages.find(
            (item) => item.id === admitted?.assistantMessageId
          )
        const metadata = value.state.conversation
        const conversations =
          value.phase === "unavailable"
            ? state.conversations.filter((item) => item.id !== id)
            : metadata
              ? state.conversations
                  .map((item) => (item.id === id ? metadata : item))
                  .filter((item) => item.status === state.filter)
              : state.conversations
        emit({
          phase: value.phase,
          conversation: value.state,
          conversations: unique(conversations),
          ...(reset
            ? {
                older: [],
                olderCursor: null,
                olderLoaded: false,
                olderLoading: false,
              }
            : {}),
          ...(message &&
          ["completed", "failed", "interrupted"].includes(message.state)
            ? { admission: null }
            : {}),
        })
      },
    })
    connection.start()
  }
  async function refreshList(more = false) {
    if (
      !running ||
      state.account !== "ready" ||
      (more && (!state.listCursor || state.listLoading))
    )
      return
    const session = generation,
      filter = state.filter,
      cursor = more ? state.listCursor : undefined,
      request = ++listRequest
    emit({ listLoading: true, listError: null })
    try {
      const page = await options.api.list(
        filter,
        cursor ?? undefined,
        controller?.signal
      )
      if (!current(session) || request !== listRequest) return
      emit({
        conversations: unique(
          more ? [...state.conversations, ...page.items] : page.items
        ),
        listCursor: page.nextCursor,
        listLoading: false,
        createUnknown: false,
      })
    } catch (error) {
      if (current(session) && request === listRequest)
        emit({ listLoading: false, listError: userError(error) })
    }
  }
  async function deliver(intent: PendingIntent) {
    const session = generation,
      id = state.selectedId,
      account = state.accountId,
      selected = selection
    if (!id || !account || state.sending || !running) return
    try {
      remember(intent)
    } catch {
      emit({
        commandError:
          "Your browser could not save the pending request. Allow session storage before sending safely.",
      })
      return
    }
    emit({ intent, sending: true, commandError: null })
    try {
      const admission =
        intent.kind === "text"
          ? await options.api.submit(id, {
              clientRequestId: intent.clientRequestId,
              content: intent.content,
            })
          : await options.api.retry(
              id,
              intent.operationId,
              intent.clientRequestId
            )
      clearIntent(account, id, intent.clientRequestId)
      if (
        !current(session, id, selected) ||
        state.intent?.clientRequestId !== intent.clientRequestId
      )
        return
      const message = state.conversation?.messages.find(
        (item) => item.id === admission.assistantMessageId
      )
      const finished =
        ["completed", "failed", "interrupted"].includes(admission.status) ||
        (!!message &&
          ["completed", "failed", "interrupted"].includes(message.state))
      emit({
        intent: null,
        sending: false,
        draft: intent.kind === "text" ? "" : state.draft,
        admission: finished ? null : admission,
        commandError: null,
      })
      void refreshList()
    } catch (error) {
      if (
        !current(session, id, selected) ||
        state.intent?.clientRequestId !== intent.clientRequestId
      )
        return
      const uncertain = !(error instanceof WorkspaceError) || error.uncertain
      if (!uncertain) clearIntent(account, id, intent.clientRequestId)
      emit({
        sending: false,
        intent: uncertain ? intent : null,
        commandError: uncertain
          ? "Delivery is not confirmed. Check delivery to safely resend this same request."
          : userError(error),
      })
      if (error instanceof WorkspaceError && error.status === 409) {
        connection?.stop()
        connection?.start()
      }
    }
  }
  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async start() {
      if (running) return
      running = true
      const session = ++generation
      controller = new AbortController()
      emit({ account: "loading", error: null })
      try {
        const account = await options.api.account(controller.signal)
        if (!current(session)) return
        emit({ account: "ready", accountId: account.id })
        connect()
        await refreshList()
      } catch (error) {
        if (current(session))
          emit({ account: "error", error: userError(error) })
      }
    },
    stop() {
      running = false
      generation++
      selection++
      olderRequest++
      controller?.abort()
      connection?.stop()
      connection = undefined
      const selectedId = state.selectedId
      emit({ ...initial(), selectedId })
    },
    select(id: string | null) {
      if (state.selectedId === id) return
      selection++
      olderRequest++
      connection?.stop()
      connection = undefined
      emit({
        selectedId: id,
        phase: id ? "connecting" : "idle",
        conversation: null,
        older: [],
        olderLoaded: false,
        olderCursor: null,
        olderLoading: false,
        olderError: null,
        draft: "",
        intent: null,
        commandError: null,
        admission: null,
        sending: false,
        changing: false,
      })
      if (state.account === "ready") connect()
    },
    refreshList: () => refreshList(),
    moreConversations: () => refreshList(true),
    filter(value: "active" | "archived") {
      if (state.filter === value) return
      emit({ filter: value, conversations: [], listCursor: null })
      void refreshList()
    },
    async create() {
      if (state.creating || state.createUnknown || state.account !== "ready")
        return false
      const session = generation
      emit({ creating: true, listError: null })
      try {
        const conversation = await options.api.create()
        if (!current(session)) return false
        emit({ creating: false })
        void refreshList()
        options.navigate("/conversations/" + conversation.id)
        return true
      } catch (error) {
        if (current(session))
          emit({
            creating: false,
            createUnknown:
              !(error instanceof WorkspaceError) || error.uncertain,
            listError:
              error instanceof WorkspaceError && !error.uncertain
                ? userError(error)
                : "Creation is not confirmed. Refresh the list before creating another conversation.",
          })
        return false
      }
    },
    setDraft(draft: string) {
      if (!state.intent) emit({ draft, commandError: null })
    },
    send() {
      const content = state.draft
      if (
        state.intent ||
        state.sending ||
        state.phase !== "live" ||
        state.conversation?.activeOperation ||
        (state.admission &&
          !["completed", "failed", "interrupted"].includes(
            state.admission.status
          )) ||
        state.conversation?.conversation?.status !== "active"
      )
        return
      if (
        !content.trim() ||
        content.includes("\u0000") ||
        [...content].length > 16000
      ) {
        emit({ commandError: "Enter a message of up to 16,000 characters." })
        return
      }
      void deliver({ kind: "text", clientRequestId: uuid(), content })
    },
    checkDelivery() {
      if (state.intent && !state.sending) void deliver(state.intent)
    },
    retry(operationId: string) {
      if (state.intent || state.sending || state.phase !== "live") return
      void deliver({ kind: "retry", clientRequestId: uuid(), operationId })
    },
    reconnect() {
      connection?.stop()
      connection?.start()
    },
    async older() {
      const id = state.selectedId,
        cursor = state.olderLoaded
          ? state.olderCursor
          : state.conversation?.nextCursor
      if (!id || !cursor || state.olderLoading || state.phase !== "live") return
      const session = generation,
        request = ++olderRequest
      emit({ olderLoading: true, olderError: null })
      try {
        const page = await options.api.older(id, cursor, controller?.signal)
        if (!current(session, id) || request !== olderRequest) return
        emit({
          older: [
            ...new Map(
              [...page.items, ...state.older].map((item) => [item.id, item])
            ).values(),
          ],
          olderCursor: page.nextCursor,
          olderLoaded: true,
          olderLoading: false,
        })
      } catch (error) {
        if (current(session, id) && request === olderRequest)
          emit({ olderLoading: false, olderError: userError(error) })
      }
    },
    async change(patch: { title?: string; status?: "active" | "archived" }) {
      const id = state.selectedId,
        session = generation,
        selected = selection
      if (!id || state.changing) return false
      emit({ changing: true, commandError: null })
      try {
        await options.api.patch(id, patch)
        if (!current(session, id, selected)) return false
        emit({ changing: false })
        void refreshList()
        connection?.stop()
        connection?.start()
        return true
      } catch (error) {
        if (current(session, id, selected))
          emit({ changing: false, commandError: userError(error) })
        return false
      }
    },
    async remove() {
      const id = state.selectedId,
        session = generation,
        selected = selection
      if (!id || state.changing) return false
      emit({ changing: true, commandError: null })
      try {
        await options.api.remove(id)
        if (!current(session, id, selected)) return false
        emit({ changing: false })
        void refreshList()
        options.navigate("/conversations")
        return true
      } catch (error) {
        if (current(session, id, selected))
          emit({ changing: false, commandError: userError(error) })
        return false
      }
    },
  }
}
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
