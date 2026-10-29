import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import type { Redis } from "ioredis"
import { type ConversationStore } from "@conversations/database"
import { domainEventSchema, durableChannel } from "@conversations/shared"
import type { RealtimeConfig } from "@conversations/service-runtime"
import {
  authenticateSession,
  AuthenticationError,
  AuthenticationUnavailable,
  type AuthConfig,
} from "./auth.js"

type StoredGrant = {
  accountId: string
  conversationId: string
  origin: string
  authorization: string
  expiresAt: number
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const opaque = () => randomBytes(32).toString("base64url")
const validOpaque = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
export function createRealtimeApi(options: {
  redis: Redis
  store: ConversationStore
  auth: AuthConfig | undefined
  config: RealtimeConfig
}) {
  const { redis, store, config } = options
  const key = (kind: string, id: string) =>
    `${config.REALTIME_REDIS_PREFIX}:${kind}:${digest(id)}`
  function available() {
    if (!config.REALTIME_INTERNAL_SECRET) throw new AuthenticationUnavailable()
  }
  async function verify(grant: StoredGrant) {
    const session = await authenticateSession(grant.authorization, options.auth)
    if (grant.expiresAt <= Date.now() || session.expiresAt < grant.expiresAt)
      throw new AuthenticationError()
    const account = await store.provisionAccount(session.subject)
    if (account.id !== grant.accountId) throw new AuthenticationError()
    return {
      ...(await store.authorizeSubscription(account.id, grant.conversationId)),
      expiresAt: new Date(grant.expiresAt).toISOString(),
    }
  }
  function parse(value: string | null): StoredGrant {
    if (!value) throw new AuthenticationError()
    try {
      const grant = JSON.parse(value)
      if (
        !grant ||
        typeof grant.accountId !== "string" ||
        typeof grant.conversationId !== "string" ||
        typeof grant.origin !== "string" ||
        typeof grant.authorization !== "string" ||
        !Number.isFinite(grant.expiresAt)
      )
        throw new Error()
      return grant
    } catch {
      throw new AuthenticationError()
    }
  }
  return {
    authorizeInternal(header: string | undefined) {
      available()
      const supplied = header?.match(/^Bearer ([A-Za-z0-9_-]{43,256})$/)?.[1]
      if (
        !supplied ||
        !timingSafeEqual(
          Buffer.from(digest(supplied)),
          Buffer.from(digest(config.REALTIME_INTERNAL_SECRET!))
        )
      )
        throw new AuthenticationError()
    },
    async issue(
      accountId: string,
      conversationId: string,
      origin: string | undefined,
      authorization: string | undefined
    ) {
      available()
      if (
        !origin ||
        !options.auth?.authorizedParties.includes(origin) ||
        !config.origins.includes(origin)
      )
        throw new AuthenticationError()
      const session = await authenticateSession(authorization, options.auth)
      const scope = await store.authorizeSubscription(accountId, conversationId)
      const expiresAt = Math.min(Date.now() + 60000, session.expiresAt)
      if (expiresAt <= Date.now()) throw new AuthenticationError()
      const ticket = opaque()
      const grant: StoredGrant = {
        ...scope,
        origin,
        authorization: authorization!,
        expiresAt: Math.min(session.expiresAt, Date.now() + 300000),
      }
      await redis.set(
        key("ticket", ticket),
        JSON.stringify(grant),
        "PXAT",
        expiresAt,
        "NX"
      )
      const url = new URL(config.REALTIME_PUBLIC_URL)
      url.searchParams.set("ticket", ticket)
      return {
        ticket,
        url: url.href,
        expiresAt: new Date(expiresAt).toISOString(),
      }
    },
    async redeem(ticket: unknown, origin: unknown) {
      available()
      if (
        !validOpaque(ticket) ||
        typeof origin !== "string" ||
        !config.origins.includes(origin)
      )
        throw new AuthenticationError()
      const grant = parse(await redis.getdel(key("ticket", ticket)))
      if (grant.origin !== origin) throw new AuthenticationError()
      const scope = await verify(grant),
        connectionId = randomUUID()
      await redis.set(
        key("grant", connectionId),
        JSON.stringify(grant),
        "PXAT",
        grant.expiresAt
      )
      return { connectionId, ...scope }
    },
    async check(connectionId: string) {
      available()
      const grant = parse(await redis.get(key("grant", connectionId)))
      return { connectionId, ...(await verify(grant)) }
    },
    async release(connectionId: string) {
      await redis.del(key("grant", connectionId))
    },
  }
}
export type RealtimeApi = ReturnType<typeof createRealtimeApi>

export async function relayConversationEvents(
  store: ConversationStore,
  redis: Pick<Redis, "publish">,
  options: {
    shouldStop?: () => boolean
    afterPublish?: () => Promise<void>
  } = {}
) {
  const claimed = await store.handoff.claim("event", {
    limit: 50,
    leaseMs: 10000,
  })
  for (const row of claimed) {
    if (options.shouldStop?.()) break
    const event = domainEventSchema.parse(row.payload)
    if (
      event.eventId !== row.id ||
      event.conversationId !== row.conversationId ||
      event.sequence !== row.sequence ||
      event.type !== row.type
    )
      throw new Error("Invalid durable event")
    await redis.publish(
      durableChannel(event.conversationId),
      JSON.stringify(event)
    )
    await options.afterPublish?.()
    if (row.leaseToken) await store.handoff.acknowledge(row.id, row.leaseToken)
  }
}
export function createEventRelay(store: ConversationStore, redis: Redis) {
  let timer: NodeJS.Timeout | undefined,
    pending: Promise<void> | undefined,
    stopping = false
  const tick = () => {
    if (stopping || pending) return
    pending = relayConversationEvents(store, redis, {
      shouldStop: () => stopping,
    })
      .catch(() => {})
      .finally(() => {
        pending = undefined
      })
  }
  return {
    start() {
      if (timer || stopping) return
      timer = setInterval(tick, 50)
      tick()
    },
    stop() {
      stopping = true
      if (timer) clearInterval(timer)
    },
    async close() {
      stopping = true
      if (timer) clearInterval(timer)
      await pending
    },
  }
}
