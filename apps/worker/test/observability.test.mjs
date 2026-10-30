import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:http"
import { randomBytes, randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import process from "node:process"
import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { createRequire } from "node:module"
import { URL } from "node:url"
const { fetch, AbortSignal } = globalThis
const { WebSocket } = createRequire(
  new URL("../../realtime/package.json", import.meta.url)
)("ws")
import {
  Diagnostics,
  loadConfig,
  loadRealtimeConfig,
  redisConnectionOptions,
  serviceDiagnostics,
} from "@conversations/service-runtime"
import { TEXT_GENERATION_QUEUE, domainEventSchema } from "@conversations/shared"
import {
  createConversationApi,
  frontendOrigin,
} from "../../api/test/conversation-fixture.mjs"
import {
  createRealtimeApi,
  createEventRelay,
  relayConversationEvents,
} from "../../api/dist/realtime.js"
import { createGateway } from "../../realtime/dist/gateway.js"
import { createTextRuntime, relayTextHandoffs } from "../dist/text-runtime.js"

async function until(fn) {
  const end = Date.now() + 10000
  while (Date.now() < end) {
    const value = await fn()
    if (value) return value
    await delay(25)
  }
  throw new Error("Timed out waiting for isolated diagnostics")
}

test("actual HTTP, durable queue, failing provider and socket export one safe causal trace", async (t) => {
  const canary = "PRIVATE_TRANSCRIPT_AND_EXCEPTION_CANARY_24",
    scrapeToken = randomBytes(32).toString("base64url")
  const packets = [],
    collector = createServer((req, res) => {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
        if (body.length > 2 * 1024 * 1024) req.destroy()
      })
      req.on("end", () => {
        packets.push(JSON.parse(body))
        if (process.env.TEST_OTLP_FORWARD_URL)
          void fetch(process.env.TEST_OTLP_FORWARD_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(2000),
          }).catch(() => {})
        res.writeHead(200, { "content-type": "application/json" })
        res.end("{}")
      })
    })
  await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise((resolve) => collector.close(resolve)))
  const endpoint = `http://127.0.0.1:${collector.address().port}/v1/traces`
  const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379",
    connection = redisConnectionOptions(redisUrl)
  const redis = new Redis({
    ...connection,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
  redis.on("error", () => {})
  await redis.connect()
  const config = loadRealtimeConfig({
    NODE_ENV: "test",
    REALTIME_INTERNAL_SECRET: randomBytes(32).toString("base64url"),
    REALTIME_REDIS_PREFIX: "obs_" + randomUUID().replaceAll("-", ""),
    CLERK_AUTHORIZED_PARTIES: frontendOrigin,
  })
  t.after(async () => {
    const keys = await redis.keys(config.REALTIME_REDIS_PREFIX + ":*")
    if (keys.length) await redis.del(...keys)
    redis.disconnect()
  })
  const f = await createConversationApi(t, {
    environment: {
      NODE_ENV: "test",
      TRACE_SAMPLE_RATIO: "1",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
      METRICS_BEARER_TOKEN: scrapeToken,
    },
    realtime: (store, auth) =>
      createRealtimeApi({ store, redis, auth, config }),
  })
  await f.app.listen({ host: "127.0.0.1", port: 0 })
  const apiUrl = `http://127.0.0.1:${f.app.server.address().port}`
  config.REALTIME_API_URL = apiUrl
  const logs = [],
    diagnostics = {}
  for (const service of ["worker", "realtime"]) {
    diagnostics[service] = new Diagnostics(
      loadConfig(service, {
        NODE_ENV: "test",
        DATABASE_URL: f.connectionString,
        REDIS_URL: redisUrl,
        LOG_LEVEL: "info",
        TRACE_SAMPLE_RATIO: "1",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
        METRICS_BEARER_TOKEN: scrapeToken,
      }),
      { stream: { write: (line) => logs.push(line) } }
    )
    t.after(() => diagnostics[service].shutdown())
  }
  const server = createServer((_req, res) => res.end("ok"))
  const gateway = createGateway({
    server,
    redisUrl,
    config,
    diagnostics: diagnostics.realtime,
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  config.REALTIME_PUBLIC_URL = `ws://127.0.0.1:${server.address().port}/v1/connect`
  t.after(async () => {
    gateway.stop()
    await gateway.close()
    await new Promise((resolve) => server.close(resolve))
  })
  await until(async () => {
    try {
      await gateway.check()
      return true
    } catch {
      return false
    }
  })
  const relay = createEventRelay(f.store, redis, serviceDiagnostics(f.app))
  relay.start()
  t.after(async () => {
    relay.stop()
    await relay.close()
  })
  const document = (await f.request("GET", "/openapi.json")).json()
  assert.ok(document.paths["/metrics"].get.security[0].MetricsBearer)
  assert.equal(
    (
      await f.app.inject({
        url: "/metrics",
        headers: { authorization: "Bearer " + f.tokens.alice },
      })
    ).statusCode,
    401
  )
  assert.equal(
    (
      await f.app.inject({
        url: "/v1/me",
        headers: { authorization: "Bearer " + scrapeToken },
      })
    ).statusCode,
    401
  )
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/internal/realtime/check",
        payload: { connectionId: randomUUID() },
        headers: { authorization: "Bearer " + scrapeToken },
      })
    ).statusCode,
    401
  )
  const conversation = await f.create(canary)
  const ticket = (
    await f.request(
      "POST",
      "/v1/realtime-tickets",
      { conversationId: conversation.id },
      "alice",
      { origin: frontendOrigin }
    )
  ).json()
  const ws = new WebSocket(ticket.url, { origin: frontendOrigin }),
    frames = []
  ws.on("error", () => {})
  ws.on("message", (data) => frames.push(JSON.parse(data.toString())))
  t.after(() => ws.terminate())
  await until(() => frames.some((frame) => frame.type === "connection.ready"))
  const prefix = "obs_" + randomUUID().replaceAll("-", ""),
    clientRequestId = randomUUID()
  let calls = 0
  const runtime = createTextRuntime({
    store: f.store,
    redisUrl,
    prefix,
    timeoutMs: 1000,
    diagnostics: diagnostics.worker,
    provider: {
      available: true,
      async *stream() {
        calls++
        yield canary
        throw new Error(canary)
      },
    },
  })
  t.after(async () => {
    await runtime.stopIntake()
    await runtime.close()
    const clean = new Queue(TEXT_GENERATION_QUEUE, {
      prefix,
      connection: { ...connection, maxRetriesPerRequest: 1 },
    })
    try {
      await clean.obliterate({ force: true })
    } finally {
      await clean.close()
    }
  })
  runtime.start()
  const traceId = "13579bdf13579bdf13579bdf13579bdf"
  const response = await fetch(
    apiUrl + "/v1/conversations/" + conversation.id + "/messages",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + f.tokens.alice,
        "content-type": "application/json",
        "x-request-id": canary,
        traceparent: "00-" + traceId + "-123456789abcdef0-01",
        tracestate: "sensitive=" + canary,
        baggage: "sensitive=" + canary,
      },
      body: JSON.stringify({ clientRequestId, content: canary }),
    }
  )
  assert.equal(response.status, 202)
  const admitted = await response.json()
  const failed = await until(() =>
    frames.find(
      (frame) =>
        frame.type === "operation.failed" &&
        frame.payload.operation.operationId === admitted.operationId
    )
  )
  assert.equal(failed.payload.operation.failureCode, "provider_error")
  const completed = frames.find((frame) => frame.type === "message.failed")
  assert.ok(completed)
  assert.equal(completed.payload.message.content, canary)
  domainEventSchema.parse(completed)
  assert.deepEqual(Object.keys(completed.correlation), ["requestId"])
  // Re-delivery/replay never starts a second provider execution or writes another result.
  await f.request(
    "POST",
    "/v1/conversations/" + conversation.id + "/messages",
    { clientRequestId, content: canary }
  )
  await relayTextHandoffs(f.store, runtime.queue, {
    diagnostics: diagnostics.worker,
  })
  await relayConversationEvents(f.store, redis, {
    diagnostics: serviceDiagnostics(f.app),
  })
  await delay(350)
  assert.equal(calls, 1)
  const operation = (
    await f.pool.query(
      "SELECT status,failure_code FROM operations WHERE id=$1",
      [admitted.operationId]
    )
  ).rows[0]
  assert.deepEqual(operation, {
    status: "failed",
    failure_code: "provider_error",
  })
  const spans = packets
    .flatMap((packet) => packet.resourceSpans ?? [])
    .flatMap((resource) =>
      (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? [])
    )
  const causal = spans.filter((span) => span.traceId === traceId)
  for (const name of [
    "http",
    "command.admit",
    "job.publish",
    "job.execute",
    "provider.generate",
    "operation.finalize",
    "event.publish",
    "event.deliver",
  ])
    assert.ok(
      causal.some((span) => span.name === name),
      name
    )
  const provider = causal.find((span) => span.name === "provider.generate"),
    job = causal.find((span) => span.name === "job.execute")
  assert.equal(provider.parentSpanId, job.spanId)
  assert.equal(
    job.parentSpanId,
    causal.find((span) => span.name === "job.publish").spanId
  )
  assert.equal(provider.status.code, 2)
  const finalize = causal.find((span) => span.name === "operation.finalize")
  assert.equal(finalize.parentSpanId, provider.spanId)
  const event = causal.find(
    (span) =>
      span.name === "event.publish" &&
      span.attributes.some(
        (attribute) =>
          attribute.key === "eventId" &&
          attribute.value.stringValue === completed.eventId
      )
  )
  assert.equal(event.parentSpanId, finalize.spanId)
  assert.ok(
    causal.some(
      (span) =>
        span.name === "event.deliver" && span.parentSpanId === event.spanId
    )
  )
  const scraped = await f.app.inject({
    url: "/metrics",
    headers: { authorization: "Bearer " + scrapeToken },
  })
  assert.equal(scraped.statusCode, 200)
  const metrics =
    scraped.body +
    (await diagnostics.worker.registry.metrics()) +
    (await diagnostics.realtime.registry.metrics())
  assert.match(
    metrics,
    /stage="provider.generate",outcome="failed",failure_code="provider_error"/
  )
  const captured =
    f.logs.join("") + logs.join("") + JSON.stringify(packets) + metrics
  for (const privateValue of [
    canary,
    scrapeToken,
    config.REALTIME_INTERNAL_SECRET,
    f.tokens.alice,
    ticket.ticket,
  ])
    assert.ok(!captured.includes(privateValue))
  assert.ok(!metrics.includes(conversation.id))
  assert.ok(!metrics.includes(admitted.operationId))
  ws.close()
  await until(async () =>
    (await diagnostics.realtime.registry.metrics()).includes(
      'conversations_active_connections{service="realtime"} 0'
    )
  )
})
