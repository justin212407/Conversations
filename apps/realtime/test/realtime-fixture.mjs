import { randomBytes, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { setTimeout as delay } from "node:timers/promises"
import process from "node:process"
import { Redis } from "ioredis"
import { WebSocket } from "ws"
import {
  loadRealtimeConfig,
  redisConnectionOptions,
} from "@conversations/service-runtime"
import {
  createConversationApi,
  frontendOrigin,
} from "../../api/test/conversation-fixture.mjs"
import { createRealtimeApi, createEventRelay } from "../../api/dist/realtime.js"
import { createGateway } from "../dist/gateway.js"

export const origin = frontendOrigin
export async function until(fn) {
  const end = Date.now() + 10000
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await delay(20)
  }
  throw new Error("Timed out waiting for isolated realtime state")
}
export async function fixture(t, options = {}) {
  const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379"
  const redis = new Redis({
    ...redisConnectionOptions(redisUrl),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  })
  redis.on("error", () => {})
  await redis.connect()
  const config = loadRealtimeConfig({
    NODE_ENV: "test",
    REALTIME_INTERNAL_SECRET: randomBytes(32).toString("base64url"),
    REALTIME_REDIS_PREFIX: "realtime_test_" + randomUUID().replaceAll("-", ""),
    REALTIME_ACCESS_CHECK_MS: "1000",
    REALTIME_HEARTBEAT_MS: String(options.heartbeatMs ?? 1000),
    CLERK_AUTHORIZED_PARTIES: origin,
  })
  const api = await createConversationApi(t, {
    tokenSeconds: options.tokenSeconds,
    realtime: (store, auth) => {
      const realtime = createRealtimeApi({ redis, store, auth, config }),
        check = realtime.check
      realtime.check = async (id) => {
        await options.onCheck?.(id)
        return check(id)
      }
      return realtime
    },
  })
  await api.app.listen({ host: "127.0.0.1", port: 0 })
  config.REALTIME_API_URL = `http://127.0.0.1:${api.app.server.address().port}`
  let server, gateway
  async function start(port = 0) {
    server = createServer((_req, res) => {
      res.end("ok")
    })
    gateway = createGateway({ server, redisUrl, config })
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve))
    config.REALTIME_PUBLIC_URL = `ws://127.0.0.1:${server.address().port}/v1/connect`
    await until(async () => {
      try {
        await gateway.check()
        return true
      } catch {
        return false
      }
    })
  }
  await start()
  const relay = createEventRelay(api.store, redis)
  if (options.relay !== false) relay.start()
  t.after(async () => {
    relay.stop()
    await relay.close()
    gateway.stop()
    await gateway.close()
    await new Promise((resolve) => server.close(resolve))
    const keys = await redis.keys(config.REALTIME_REDIS_PREFIX + ":*")
    if (keys.length) await redis.del(...keys)
    redis.disconnect()
  })
  async function ticket(conversationId, actor = "alice") {
    const result = await api.request(
      "POST",
      "/v1/realtime-tickets",
      { conversationId },
      actor,
      { origin }
    )
    if (result.statusCode !== 201)
      throw new Error("Ticket fixture failed: " + result.statusCode)
    return result.json()
  }
  async function open(conversationId, extra = {}) {
    const issued = await ticket(conversationId)
    const ws = new WebSocket(issued.url, { origin, ...extra }),
      frames = []
    let closed
    ws.on("error", () => {})
    ws.on("message", (data) => frames.push(JSON.parse(data.toString())))
    ws.on("close", (code) => {
      closed = code
    })
    await until(() => frames.some((frame) => frame.type === "connection.ready"))
    return { ws, frames, issued, closed: () => closed }
  }
  return {
    ...api,
    redis,
    redisUrl,
    config,
    relay,
    ticket,
    open,
    get gateway() {
      return gateway
    },
    async restart() {
      const port = server.address().port
      gateway.stop()
      await gateway.close()
      await new Promise((resolve) => server.close(resolve))
      await start(port)
    },
  }
}
