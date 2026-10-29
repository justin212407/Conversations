import {
  conversationSnapshotSchema,
  domainEventSchema,
  provisionalMessageSnapshotSchema,
  realtimeServerControlSchema,
  MAX_REALTIME_BUFFER_BYTES,
  MAX_REALTIME_FRAME_BYTES,
  type ConversationSnapshot,
  type DomainEvent,
  type MessageData,
  type OperationAdmission,
  type ProvisionalMessageSnapshot,
} from "./index.js"

type Phase =
  | "idle"
  | "connecting"
  | "reconciling"
  | "live"
  | "disconnected"
  | "unsubscribed"
  | "unavailable"
export type ConversationState = {
  conversationId: string
  checkpoint: number
  conversation: ConversationSnapshot["conversation"] | null
  activeOperation: OperationAdmission | null
  messages: MessageData[]
  nextCursor: string | null
  pending: DomainEvent[]
  streams: Record<string, { streamId: string; revision: number }>
  needsReconciliation: boolean
}
export function initialConversationState(
  conversationId: string
): ConversationState {
  return {
    conversationId,
    checkpoint: 0,
    conversation: null,
    activeOperation: null,
    messages: [],
    nextCursor: null,
    pending: [],
    streams: {},
    needsReconciliation: true,
  }
}
const terminal = (message: MessageData) =>
  ["completed", "failed", "interrupted"].includes(message.state)
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Realtime deadline exceeded"))
    signal.addEventListener("abort", abort, { once: true })
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
    if (signal.aborted) abort()
  })
}
function apply(
  state: ConversationState,
  event: DomainEvent
): ConversationState {
  let messages = state.messages,
    conversation = state.conversation,
    activeOperation = state.activeOperation
  if ("message" in event.payload) {
    const next = event.payload.message,
      prior = messages.find((message) => message.id === next.id)
    if (!prior || !terminal(prior) || terminal(next))
      messages = [
        ...messages.filter((message) => message.id !== next.id),
        { ...prior, ...next },
      ].sort((a, b) => a.sequence - b.sequence)
  } else if ("operation" in event.payload) {
    const operation = event.payload.operation
    activeOperation =
      event.type === "operation.accepted"
        ? operation
        : activeOperation?.operationId === operation.operationId
          ? null
          : activeOperation
    if (event.type === "operation.accepted")
      messages = messages.map((message) =>
        message.id === operation.assistantMessageId
          ? { ...message, operationId: operation.operationId }
          : message
      )
    else
      messages = messages.map((message) =>
        message.id === operation.assistantMessageId
          ? {
              ...message,
              operationId: operation.operationId,
              ...(operation.failureCode !== undefined
                ? { failureCode: operation.failureCode }
                : {}),
            }
          : message
      )
  } else if (event.type === "conversation.updated" && conversation)
    conversation = {
      ...conversation,
      title: event.payload.title,
      status: event.payload.status === "archived" ? "archived" : "active",
      updatedAt: event.occurredAt,
    }
  if (event.type === "conversation.deleted")
    return {
      ...initialConversationState(state.conversationId),
      checkpoint: event.sequence,
      needsReconciliation: false,
    }
  return {
    ...state,
    messages,
    conversation,
    activeOperation,
    checkpoint: event.sequence,
  }
}
export function applyConversationEvent(
  state: ConversationState,
  event: DomainEvent
): ConversationState {
  if (
    event.conversationId !== state.conversationId ||
    event.sequence <= state.checkpoint
  )
    return state
  const prior = state.pending.find((item) => item.sequence === event.sequence)
  if (prior && prior.eventId !== event.eventId)
    return { ...state, needsReconciliation: true }
  let pending = prior ? [...state.pending] : [...state.pending, event]
  if (
    pending.length > 256 ||
    pending.reduce(
      (total, item) =>
        total + new TextEncoder().encode(JSON.stringify(item)).byteLength,
      0
    ) > MAX_REALTIME_BUFFER_BYTES
  )
    return { ...state, pending: [], needsReconciliation: true }
  let next = { ...state, pending: [] as DomainEvent[] }
  pending = pending.sort((a, b) => a.sequence - b.sequence)
  while (pending[0]?.sequence === next.checkpoint + 1) {
    const first = pending.shift()
    if (first) next = apply(next, first)
  }
  return {
    ...next,
    pending,
    messages: next.messages.slice(-200),
    needsReconciliation: pending.length > 0 || next.messages.length > 200,
  }
}
export function applyProvisionalSnapshot(
  state: ConversationState,
  snapshot: ProvisionalMessageSnapshot
): ConversationState {
  if (snapshot.conversationId !== state.conversationId) return state
  const payload = snapshot.payload,
    message = state.messages.find((item) => item.id === payload.messageId)
  const operation = state.activeOperation
  if (
    !message ||
    terminal(message) ||
    operation?.operationId !== payload.operationId ||
    operation.assistantMessageId !== message.id
  )
    return state
  const previous = state.streams[message.id]
  if (
    previous &&
    (previous.streamId !== payload.streamId ||
      previous.revision >= payload.revision)
  )
    return state
  // The durable checkpoint may advance independently (e.g. a rename). Only
  // operation/message/stream revision and terminal state order provisional data.
  return {
    ...state,
    activeOperation: { ...operation, status: "running" },
    messages: state.messages.map((item) =>
      item.id === message.id
        ? { ...item, state: "streaming", content: payload.content }
        : item
    ),
    streams: {
      ...state.streams,
      [message.id]: { streamId: payload.streamId, revision: payload.revision },
    },
  }
}
export function reconcileConversation(
  state: ConversationState,
  snapshot: ConversationSnapshot
): ConversationState {
  if (
    snapshot.conversation.id !== state.conversationId ||
    snapshot.checkpoint < state.checkpoint
  )
    return { ...state, needsReconciliation: true }
  let next: ConversationState = {
    ...state,
    conversation: snapshot.conversation,
    checkpoint: snapshot.checkpoint,
    activeOperation: snapshot.activeOperation,
    messages: snapshot.messages.items,
    nextCursor: snapshot.messages.nextCursor,
    streams: {},
    pending: [],
    needsReconciliation: false,
  }
  for (const event of state.pending) next = applyConversationEvent(next, event)
  return next
}
export function disconnectConversation(
  state: ConversationState
): ConversationState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.state === "streaming"
        ? { ...message, state: "pending", content: "" }
        : message
    ),
    streams: {},
    pending: [],
    needsReconciliation: true,
  }
}
export function reconnectDelay(attempt: number, random = Math.random): number {
  return Math.min(
    10000,
    Math.round(
      Math.min(10000, 250 * 2 ** Math.min(6, Math.max(0, attempt))) *
        (0.5 + Math.min(1, Math.max(0, random())))
    )
  )
}

/** Browser transport: subscribe acknowledgement always precedes REST snapshot. */
export function createConversationConnection(options: {
  apiUrl: string
  conversationId: string
  getToken: () => Promise<string | null>
  onChange: (value: { phase: Phase; state: ConversationState }) => void
  createSocket?: (
    url: string
  ) => Pick<WebSocket, "addEventListener" | "send" | "close" | "readyState">
  fetch?: typeof fetch
  random?: () => number
  timeoutMs?: number
}) {
  const http = options.fetch ?? globalThis.fetch,
    makeSocket = options.createSocket ?? ((url) => new WebSocket(url))
  const timeoutMs = options.timeoutMs ?? 10000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    throw new Error("Invalid realtime deadline")
  let state = initialConversationState(options.conversationId),
    phase: Phase = "idle",
    socket: ReturnType<typeof makeSocket> | undefined,
    controller: AbortController | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    deadline: ReturnType<typeof setTimeout> | undefined,
    stopped = true,
    desired = true,
    epoch = 0,
    attempt = 0,
    reconciling = false,
    reconciliation = 0
  let frames: unknown[] = [],
    bytes = 0
  const emit = () => options.onChange({ phase, state })
  const resetBuffer = () => {
    frames = []
    bytes = 0
  }
  function armAcknowledgementDeadline(current: number) {
    clearTimeout(deadline)
    deadline = setTimeout(() => {
      if (current === epoch && !stopped && desired) reconnect()
    }, timeoutMs)
  }
  async function request(path: string, method = "GET", payload?: unknown) {
    const signal = controller
      ? AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs)
    const token = await abortable(
      Promise.resolve().then(options.getToken),
      signal
    )
    if (!token) throw new Error("Session unavailable")
    const response = await abortable(
      http(options.apiUrl + path, {
        method,
        headers: {
          authorization: "Bearer " + token,
          ...(payload ? { "content-type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal,
        redirect: "error",
      }),
      signal
    )
    if (!response.ok) {
      if (response.status === 404) throw new Error("Conversation inaccessible")
      throw new Error("Conversation temporarily unavailable")
    }
    return abortable(response.json(), signal)
  }
  function inaccessible() {
    stopped = true
    epoch++
    controller?.abort()
    clearTimeout(retry)
    clearTimeout(deadline)
    socket?.close()
    state = initialConversationState(options.conversationId)
    phase = "unavailable"
    emit()
  }
  function reconnect() {
    if (stopped) return
    epoch++
    clearTimeout(deadline)
    controller?.abort()
    socket?.close()
    socket = undefined
    reconciling = false
    resetBuffer()
    state = disconnectConversation(state)
    phase = desired ? "disconnected" : "unsubscribed"
    emit()
    clearTimeout(retry)
    if (!desired) return
    retry = setTimeout(
      () => {
        void connect()
      },
      reconnectDelay(attempt++, options.random)
    )
  }
  function consume(raw: unknown) {
    const event = domainEventSchema.safeParse(raw),
      partial = provisionalMessageSnapshotSchema.safeParse(raw)
    if (event.success) {
      if (
        event.data.type === "conversation.deleted" &&
        event.data.conversationId === options.conversationId
      ) {
        inaccessible()
        return
      }
      state = applyConversationEvent(state, event.data)
    } else if (partial.success)
      state = applyProvisionalSnapshot(state, partial.data)
    else {
      reconnect()
      return
    }
    emit()
  }
  async function reconcile(current: number) {
    if (stopped || reconciling || !desired) return
    reconciling = true
    const operation = ++reconciliation
    phase = "reconciling"
    emit()
    if (stopped || current !== epoch || !desired) return
    try {
      const snapshot = conversationSnapshotSchema.parse(
        await request(`/v1/conversations/${options.conversationId}/snapshot`)
      )
      if (
        current !== epoch ||
        stopped ||
        operation !== reconciliation ||
        !desired
      )
        return
      state = reconcileConversation(state, snapshot)
      const buffered = frames
      resetBuffer()
      for (const raw of buffered) {
        consume(raw)
        if (stopped || current !== epoch) return
      }
      reconciling = false
      if (state.needsReconciliation) {
        reconnect()
        return
      }
      attempt = 0
      phase = "live"
      emit()
    } catch (error) {
      if (
        current !== epoch ||
        stopped ||
        operation !== reconciliation ||
        !desired
      )
        return
      if (
        error instanceof Error &&
        error.message === "Conversation inaccessible"
      )
        inaccessible()
      else reconnect()
    }
  }
  async function connect() {
    if (stopped) return
    const current = ++epoch
    armAcknowledgementDeadline(current)
    controller = new AbortController()
    phase = "connecting"
    emit()
    if (stopped || current !== epoch) return
    try {
      const issued = await request("/v1/realtime-tickets", "POST", {
        conversationId: options.conversationId,
      })
      if (current !== epoch || stopped) return
      const url = new URL(issued.url)
      if (
        !["ws:", "wss:"].includes(url.protocol) ||
        typeof issued.ticket !== "string" ||
        url.searchParams.get("ticket") !== issued.ticket
      )
        throw new Error("Invalid connection ticket")
      socket = makeSocket(url.href)
      socket.addEventListener("message", (event) => {
        if (current !== epoch || stopped) return
        if (
          typeof event.data !== "string" ||
          new TextEncoder().encode(event.data).byteLength >
            MAX_REALTIME_FRAME_BYTES
        ) {
          reconnect()
          return
        }
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          reconnect()
          return
        }
        const control = realtimeServerControlSchema.safeParse(raw)
        if (control.success) {
          if (control.data.conversationId !== options.conversationId) {
            reconnect()
            return
          }
          if (control.data.type === "connection.ready") clearTimeout(deadline)
          if (control.data.type === "connection.unsubscribed") {
            phase = "unsubscribed"
            state = disconnectConversation(state)
            resetBuffer()
            emit()
          } else if (desired && !reconciling) {
            clearTimeout(deadline)
            resetBuffer()
            void reconcile(current)
          } else if (!desired && socket?.readyState === 1)
            socket.send(JSON.stringify({ version: 1, type: "unsubscribe" }))
          return
        }
        if (!desired) return
        if (reconciling || phase !== "live") {
          bytes += new TextEncoder().encode(event.data).byteLength
          if (bytes > MAX_REALTIME_BUFFER_BYTES || frames.length >= 256) {
            reconnect()
            return
          }
          frames.push(raw)
          return
        }
        consume(raw)
        if (state.needsReconciliation) void reconcile(current)
      })
      socket.addEventListener("close", (event) => {
        if (current !== epoch || stopped) return
        if (event.code === 4003) inaccessible()
        else reconnect()
      })
      socket.addEventListener("error", () => {
        if (current === epoch && !stopped) reconnect()
      })
    } catch (error) {
      if (current !== epoch || stopped) return
      if (
        error instanceof Error &&
        error.message === "Conversation inaccessible"
      )
        inaccessible()
      else reconnect()
    }
  }
  return {
    start() {
      if (!stopped) return
      stopped = false
      desired = true
      reconciling = false
      reconciliation++
      void connect()
    },
    stop() {
      stopped = true
      epoch++
      reconciling = false
      reconciliation++
      clearTimeout(retry)
      clearTimeout(deadline)
      controller?.abort()
      socket?.close()
      socket = undefined
      resetBuffer()
      state = disconnectConversation(state)
      phase = "idle"
      emit()
    },
    unsubscribe() {
      desired = false
      clearTimeout(deadline)
      reconciliation++
      reconciling = false
      resetBuffer()
      if (socket?.readyState === 1)
        socket.send(JSON.stringify({ version: 1, type: "unsubscribe" }))
    },
    subscribe() {
      if (desired) return
      desired = true
      if (socket?.readyState === 1) {
        const current = epoch
        armAcknowledgementDeadline(current)
        phase = "connecting"
        emit()
        if (stopped || current !== epoch || !desired) return
        socket.send(JSON.stringify({ version: 1, type: "subscribe" }))
      } else if (!stopped) reconnect()
    },
    current() {
      return { phase, state }
    },
  }
}
