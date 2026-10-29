import type { Server } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, WebSocket } from "ws"
import { Redis } from "ioredis"
import {
  redisConnectionOptions,
  type RealtimeConfig,
} from "@conversations/service-runtime"
import {
  domainEventSchema,
  provisionalMessageSnapshotSchema,
  realtimeClientControlSchema,
  realtimeGrantSchema,
  durableChannel,
  provisionalChannel,
  MAX_REALTIME_BUFFER_BYTES,
  MAX_REALTIME_FRAME_BYTES,
} from "@conversations/shared"

type Grant = {
  connectionId: string
  accountId: string
  conversationId: string
  expiresAt: string
}
type Connection = {
  ws: WebSocket
  grant: Grant
  subscribed: boolean
  subscribing: boolean
  closed: boolean
  alive: boolean
  subscription: number
  buffer: string[]
  bytes: number
  controlCount: number
  controlWindow: number
  expiry: NodeJS.Timeout
}
class AccessFailure extends Error {
  constructor(readonly status: number) {
    super("Realtime access unavailable")
  }
}
export function createGateway(options: {
  server: Server
  redisUrl: string
  config: RealtimeConfig
}) {
  const { config } = options
  const subscriber = new Redis({
    ...redisConnectionOptions(options.redisUrl),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    commandTimeout: 1500,
    autoResubscribe: false,
    connectionName: config.REALTIME_REDIS_PREFIX + "-subscriber",
  })
  subscriber.on("error", () => {})
  void subscriber.connect().catch(() => {})
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  })
  const connections = new Set<Connection>(),
    topics = new Map<string, Set<Connection>>(),
    upgrades = new Set<Duplex>()
  let stopping = false,
    checks = 0
  async function api(
    action: "redeem" | "check" | "release",
    body: unknown
  ): Promise<unknown> {
    if (!config.REALTIME_INTERNAL_SECRET) throw new AccessFailure(503)
    const response = await fetch(
      config.REALTIME_API_URL + "/internal/realtime/" + action,
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + config.REALTIME_INTERNAL_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(2000),
      }
    )
    if (!response.ok) throw new AccessFailure(response.status)
    return response.json()
  }
  function send(connection: Connection, text: string) {
    if (connection.closed) return
    if (Date.parse(connection.grant.expiresAt) <= Date.now()) {
      close(connection, 4001)
      return
    }
    if (
      Buffer.byteLength(text) > MAX_REALTIME_FRAME_BYTES ||
      connection.ws.bufferedAmount + Buffer.byteLength(text) >
        MAX_REALTIME_BUFFER_BYTES
    ) {
      close(connection, 1013)
      return
    }
    connection.ws.send(text, (error) => {
      if (error) close(connection, 1013)
    })
  }
  function control(
    connection: Connection,
    type: "connection.ready" | "connection.unsubscribed"
  ) {
    send(
      connection,
      JSON.stringify({
        version: 1,
        type,
        connectionId: connection.grant.connectionId,
        conversationId: connection.grant.conversationId,
        expiresAt: connection.grant.expiresAt,
      })
    )
  }
  function detach(connection: Connection) {
    connection.subscription++
    connection.subscribed = false
    connection.subscribing = false
    connection.buffer = []
    connection.bytes = 0
    const topic = topics.get(connection.grant.conversationId)
    topic?.delete(connection)
    if (topic?.size === 0) {
      topics.delete(connection.grant.conversationId)
      void subscriber
        .unsubscribe(
          durableChannel(connection.grant.conversationId),
          provisionalChannel(connection.grant.conversationId)
        )
        .catch(() => {})
    }
  }
  function cleanup(connection: Connection) {
    if (connection.closed) return
    connection.closed = true
    cancelQueuedCheck(connection)
    clearTimeout(connection.expiry)
    detach(connection)
    connections.delete(connection)
    void api("release", { connectionId: connection.grant.connectionId }).catch(
      () => {}
    )
  }
  function close(connection: Connection, code: number) {
    if (connection.closed) return
    cleanup(connection)
    connection.ws.close(code, "Reconnect and reconcile")
    const timeout = setTimeout(() => connection.ws.terminate(), 1000)
    timeout.unref()
    connection.ws.once("close", () => clearTimeout(timeout))
  }
  const checkTasks = new Map<Connection, Promise<boolean>>()
  const waitingChecks: {
    connection: Connection
    resolve: (allowed: boolean) => void
  }[] = []
  function cancelQueuedCheck(connection: Connection) {
    const index = waitingChecks.findIndex(
      (item) => item.connection === connection
    )
    if (index < 0) return
    const [waiting] = waitingChecks.splice(index, 1)
    checkTasks.delete(connection)
    waiting?.resolve(false)
  }
  function drainChecks() {
    while (checks < 8 && waitingChecks.length) {
      const next = waitingChecks.shift()!
      const { connection, resolve } = next
      if (connection.closed) {
        checkTasks.delete(connection)
        resolve(false)
        continue
      }
      checks++
      void performCheck(connection)
        .then(resolve)
        .finally(() => {
          checks--
          checkTasks.delete(connection)
          drainChecks()
        })
    }
  }
  async function performCheck(connection: Connection) {
    try {
      const grant = realtimeGrantSchema.parse(
        await api("check", { connectionId: connection.grant.connectionId })
      )
      if (
        grant.accountId !== connection.grant.accountId ||
        grant.conversationId !== connection.grant.conversationId ||
        grant.expiresAt !== connection.grant.expiresAt
      )
        throw new AccessFailure(401)
      return !connection.closed
    } catch (error) {
      close(
        connection,
        error instanceof AccessFailure && error.status === 404
          ? 4003
          : error instanceof AccessFailure && error.status === 401
            ? 4001
            : 1013
      )
      return false
    }
  }
  function check(connection: Connection): Promise<boolean> {
    if (connection.closed) return Promise.resolve(false)
    const prior = checkTasks.get(connection)
    if (prior) return prior
    // One queued/running check per admitted socket bounds the queue. Normal
    // polling bursts must not revoke healthy sockets beyond the HTTP limit.
    const task = new Promise<boolean>((resolve) => {
      waitingChecks.push({ connection, resolve })
    })
    checkTasks.set(connection, task)
    drainChecks()
    return task
  }
  async function subscribe(connection: Connection) {
    if (connection.closed || connection.subscribed || connection.subscribing)
      return
    const generation = ++connection.subscription
    connection.subscribing = true
    const id = connection.grant.conversationId
    let topic = topics.get(id)
    if (!topic) {
      topic = new Set()
      topics.set(id, topic)
    }
    topic.add(connection)
    try {
      if (subscriber.status !== "ready") throw new AccessFailure(503)
      await subscriber.subscribe(durableChannel(id), provisionalChannel(id))
      if (
        !(await check(connection)) ||
        connection.closed ||
        !connection.subscribing ||
        generation !== connection.subscription
      )
        return
      connection.subscribing = false
      connection.subscribed = true
      control(connection, "connection.ready")
      for (const frame of connection.buffer) send(connection, frame)
      connection.buffer = []
      connection.bytes = 0
    } catch {
      if (generation === connection.subscription) close(connection, 1013)
    }
  }
  subscriber.on("message", (channel, payload) => {
    if (Buffer.byteLength(payload) > MAX_REALTIME_FRAME_BYTES) return
    let raw: unknown
    try {
      raw = JSON.parse(payload)
    } catch {
      return
    }
    const durable = domainEventSchema.safeParse(raw),
      partial = provisionalMessageSnapshotSchema.safeParse(raw)
    const event = durable.success
      ? durable.data
      : partial.success
        ? partial.data
        : undefined
    if (
      !event ||
      channel !==
        (durable.success
          ? durableChannel(event.conversationId)
          : provisionalChannel(event.conversationId))
    )
      return
    for (const connection of topics.get(event.conversationId) ?? []) {
      if (connection.subscribing) {
        connection.bytes += Buffer.byteLength(payload)
        if (
          connection.bytes > MAX_REALTIME_BUFFER_BYTES ||
          connection.buffer.length >= 256
        )
          close(connection, 1013)
        else connection.buffer.push(payload)
      } else if (connection.subscribed) {
        send(connection, payload)
        if (event.type === "conversation.deleted") close(connection, 4003)
      }
    }
  })
  const interrupted = () => {
    for (const connection of [...connections]) close(connection, 1013)
  }
  subscriber.on("close", interrupted)
  subscriber.on("end", interrupted)
  subscriber.on("reconnecting", interrupted)
  // Upgrade authentication happens before creating any WebSocket capability.
  const handler = async (
    request: import("node:http").IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) => {
    let grant: Grant | undefined
    upgrades.add(socket)
    try {
      const url = new URL(request.url ?? "/", "http://realtime.invalid")
      if (
        stopping ||
        upgrades.size > 16 ||
        connections.size >= 100 ||
        subscriber.status !== "ready"
      )
        throw new AccessFailure(503)
      if (
        url.pathname !== "/v1/connect" ||
        url.searchParams.size !== 1 ||
        !url.searchParams.has("ticket") ||
        !request.headers.origin ||
        !config.origins.includes(request.headers.origin) ||
        request.headers["sec-websocket-protocol"]
      )
        throw new AccessFailure(401)
      grant = realtimeGrantSchema.parse(
        await api("redeem", {
          ticket: url.searchParams.get("ticket"),
          origin: request.headers.origin,
        })
      )
      if (
        stopping ||
        socket.destroyed ||
        connections.size >= 100 ||
        Date.parse(grant.expiresAt) <= Date.now()
      )
        throw new AccessFailure(401)
      const authorized = grant
      wss.handleUpgrade(request, socket, head, (ws) => {
        const connection: Connection = {
          ws,
          grant: authorized,
          subscribed: false,
          subscribing: false,
          closed: false,
          alive: true,
          subscription: 0,
          buffer: [],
          bytes: 0,
          controlCount: 0,
          controlWindow: Date.now(),
          expiry: setTimeout(
            () => close(connection, 4001),
            Math.max(1, Date.parse(authorized.expiresAt) - Date.now())
          ),
        }
        connections.add(connection)
        ws.on("error", () => {})
        ws.on("close", () => cleanup(connection))
        ws.on("pong", () => {
          connection.alive = true
        })
        ws.on("message", (data, binary) => {
          if (Date.now() - connection.controlWindow >= 1000) {
            connection.controlCount = 0
            connection.controlWindow = Date.now()
          }
          if (++connection.controlCount > 20) {
            close(connection, 1008)
            return
          }
          if (binary) {
            close(connection, 1008)
            return
          }
          let parsed
          try {
            parsed = realtimeClientControlSchema.safeParse(
              JSON.parse(data.toString())
            )
          } catch {
            close(connection, 1008)
            return
          }
          if (!parsed.success) {
            close(connection, 1008)
            return
          }
          if (parsed.data.type === "unsubscribe") {
            detach(connection)
            control(connection, "connection.unsubscribed")
          } else void subscribe(connection)
        })
        void subscribe(connection)
      })
    } catch (error) {
      if (grant)
        void api("release", { connectionId: grant.connectionId }).catch(
          () => {}
        )
      const status =
        error instanceof AccessFailure && error.status < 500 ? 401 : 503
      if (!socket.destroyed)
        socket.end(
          `HTTP/1.1 ${status} ${status === 401 ? "Unauthorized" : "Service Unavailable"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
        )
    } finally {
      upgrades.delete(socket)
    }
  }
  options.server.on("upgrade", handler)
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        close(connection, 1001)
        continue
      }
      connection.alive = false
      connection.ws.ping()
    }
  }, config.REALTIME_HEARTBEAT_MS)
  const access = setInterval(() => {
    for (const connection of connections) void check(connection)
  }, config.REALTIME_ACCESS_CHECK_MS)
  return {
    async check() {
      if (
        stopping ||
        !config.REALTIME_INTERNAL_SECRET ||
        subscriber.status !== "ready"
      )
        throw new Error("Realtime unavailable")
      const response = await fetch(config.REALTIME_API_URL + "/health/ready", {
        redirect: "error",
        signal: AbortSignal.timeout(1500),
      })
      if (!response.ok) throw new Error("Authorization service unavailable")
    },
    stop() {
      stopping = true
      options.server.off("upgrade", handler)
      clearInterval(heartbeat)
      clearInterval(access)
      for (const socket of upgrades) socket.destroy()
      for (const connection of [...connections]) close(connection, 1001)
    },
    async close() {
      stopping = true
      clearInterval(heartbeat)
      clearInterval(access)
      for (const connection of [...connections]) close(connection, 1001)
      subscriber.disconnect()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
