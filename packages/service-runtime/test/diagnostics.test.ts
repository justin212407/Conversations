import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace"
import {
  Diagnostics,
  createSafeLogger,
  metricsAuthorized,
} from "../src/diagnostics.js"
import { loadConfig } from "../src/config.js"
import { createHealthServer } from "../src/health.js"
import { loadRealtimeConfig } from "../src/realtime-config.js"
const env = {
  NODE_ENV: "test",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  LOG_LEVEL: "info",
  TRACE_SAMPLE_RATIO: "1",
}
const token = "T".repeat(43),
  canary = "CREDENTIAL_TRANSCRIPT_CANARY_24"
const parent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01"

test("all logger bindings, error objects and untrusted messages are allowlisted", () => {
  const lines: string[] = []
  const logger = createSafeLogger(loadConfig("api", env), {
    write: (line) => {
      lines.push(line)
    },
  })
  logger.child({ authorization: canary, body: canary, reqId: canary }).error(
    {
      err: new Error(canary),
      token: canary,
      headers: { authorization: canary },
      conversationId: canary,
      route: "/" + canary,
    },
    canary
  )
  logger.info({}, "provider." + canary.toLowerCase())
  logger.info(
    { requestId: randomUUID(), stage: "http", outcome: "success" },
    "http.completed"
  )
  const text = lines.join("")
  assert.ok(!text.includes(canary))
  assert.ok(!text.includes(canary.toLowerCase()))
  assert.equal(JSON.parse(lines[0]!).route, "unmatched")
  assert.equal(JSON.parse(lines[0]!).msg, "runtime.diagnostic")
  assert.equal(JSON.parse(lines.at(-1)!).msg, "http.completed")
})

test("metrics require a distinct credential and normalize hostile HTTP dimensions", async (t) => {
  const lines: string[] = []
  const diag = new Diagnostics(
    loadConfig("api", { ...env, METRICS_BEARER_TOKEN: token }),
    {
      stream: {
        write: (line) => {
          lines.push(line)
        },
      },
    }
  )
  const app = createHealthServer(
    diag.config,
    { dependencies: [], close: async () => {} },
    undefined,
    diag
  )
  t.after(() => app.close())
  assert.ok(metricsAuthorized("Bearer " + token, token))
  for (const value of [
    undefined,
    "Bearer no",
    "Bearer " + token + "x",
    "Basic " + token,
    "Bearer " + "x".repeat(5000),
  ])
    assert.equal(metricsAuthorized(value, token), false)
  assert.equal((await app.inject("/metrics")).statusCode, 401)
  assert.equal(
    (
      await app.inject({
        url: "/metrics",
        headers: { authorization: "Bearer wrong" },
      })
    ).statusCode,
    401
  )
  for (let i = 0; i < 5; i++)
    await app.inject({
      url: "/hostile/" + canary + i + "?ticket=" + canary,
      headers: {
        "x-request-id": canary,
        authorization: "Bearer " + canary,
        traceparent: parent,
        tracestate: "secret=" + canary,
        baggage: "secret=" + canary,
      },
    })
  await app.inject({ url: "/%XX?ticket=" + canary })
  const result = await app.inject({
    url: "/metrics",
    headers: { authorization: "Bearer " + token },
  })
  assert.equal(result.statusCode, 200)
  assert.match(
    result.body,
    /conversations_http_requests_total\{route="unmatched",method="GET",status_class="4xx",service="api"\} 6/
  )
  assert.ok(!result.body.includes(canary))
  assert.ok(!result.body.includes(token))
  assert.ok(!result.body.includes("/metrics"))
  assert.ok(!lines.join("").includes(canary))
  assert.ok(!lines.join("").includes(token))
  const requestIds = lines
    .map((line) => JSON.parse(line))
    .filter((row) => row.msg === "http.completed")
    .map((row) => row.requestId)
  assert.ok(requestIds.length >= 5)
  assert.ok(requestIds.every((id) => /^[a-f0-9-]{36}$/.test(id)))
})

test("real SDK spans retain causal trace IDs while dropping tracestate and baggage", async (t) => {
  const exporter = new InMemorySpanExporter()
  const diag = new Diagnostics(loadConfig("worker", env), {
    exporter,
    stream: { write() {} },
  })
  t.after(() => diag.shutdown())
  const requestId = randomUUID()
  await diag.run(
    "job.execute",
    { requestId, conversationId: randomUUID() },
    async (job) => {
      const correlation = job.correlation(requestId)
      assert.equal(correlation.tracestate, undefined)
      await diag.run(
        "provider.generate",
        { requestId },
        async () => {},
        correlation
      )
    },
    { requestId, traceparent: parent, tracestate: "secret=" + canary }
  )
  await delay(400)
  const spans = exporter.getFinishedSpans()
  assert.equal(spans.length, 2)
  assert.ok(
    spans.every(
      (span) =>
        span.spanContext().traceId === "0123456789abcdef0123456789abcdef"
    )
  )
  assert.ok(spans.every((span) => span.spanContext().traceState === undefined))
  assert.equal(
    spans.find((s) => s.name === "provider.generate")!.parentSpanContext
      ?.spanId,
    spans.find((s) => s.name === "job.execute")!.spanContext().spanId
  )
  assert.ok(
    !JSON.stringify(
      spans.map((s) => ({
        attributes: s.attributes,
        events: s.events,
        context: s.spanContext(),
      }))
    ).includes(canary)
  )
})

test("remote sampled flag cannot override configured sampling or hang shutdown", async () => {
  const exporter = new InMemorySpanExporter()
  const diag = new Diagnostics(
    loadConfig("worker", { ...env, TRACE_SAMPLE_RATIO: "0" }),
    { exporter, stream: { write() {} } }
  )
  await diag.run("job.execute", {}, async () => {}, {
    requestId: randomUUID(),
    traceparent: parent,
  })
  await delay(300)
  assert.equal(exporter.getFinishedSpans().length, 0)
  await diag.shutdown()
  const stuck = new Diagnostics(
    loadConfig("worker", { ...env, SHUTDOWN_TIMEOUT_MS: "1000" }),
    {
      exporter: {
        export(_spans, done) {
          done({ code: 1 })
        },
        shutdown: () => new Promise(() => {}),
      },
      stream: {
        write() {
          throw new Error(canary)
        },
      },
    }
  )
  const value = await stuck.run(
    "provider.generate",
    {},
    async () => "unchanged"
  )
  assert.equal(value, "unchanged")
  const started = Date.now()
  await stuck.shutdown()
  assert.ok(Date.now() - started < 800)
})

test("production public and diagnostic transport settings fail closed without leaking values", () => {
  const base = { ...env, NODE_ENV: "production", METRICS_BEARER_TOKEN: token }
  for (const endpoint of [
    "http://collector:4318/v1/traces",
    "https://u:" + canary + "@collector/traces",
    "https://collector/traces?secret=" + canary,
  ])
    assert.throws(
      () =>
        loadConfig("worker", {
          ...base,
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
        }),
      (error) => error instanceof Error && !error.message.includes(canary)
    )
  assert.ok(
    loadConfig("worker", {
      ...base,
      OBSERVABILITY_ALLOW_PRIVATE_HTTP: "true",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector:4318/v1/traces",
    })
  )
  const realtime = {
    NODE_ENV: "production",
    REALTIME_INTERNAL_SECRET: token,
    REALTIME_PUBLIC_URL: "wss://realtime.example/v1/connect",
    CLERK_AUTHORIZED_PARTIES: "https://workspace.example",
    REALTIME_API_URL: "http://api:4300",
  }
  assert.throws(() => loadRealtimeConfig(realtime))
  assert.ok(
    loadRealtimeConfig({ ...realtime, REALTIME_ALLOW_PRIVATE_HTTP: "true" })
  )
  assert.throws(() =>
    loadRealtimeConfig({
      ...realtime,
      REALTIME_ALLOW_PRIVATE_HTTP: "true",
      CLERK_AUTHORIZED_PARTIES: "http://workspace.example",
    })
  )
})

test("local scrape preparation writes only a private ignored file and never prints its token", async (t) => {
  const { mkdtemp, readFile, stat, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { execFile } = await import("node:child_process")
  const { promisify } = await import("node:util")
  const directory = await mkdtemp(
    join(tmpdir(), "conversations-observability-config-")
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const run = promisify(execFile)
  const script = new URL(
    "../../../scripts/prepare-observability.mjs",
    import.meta.url
  )
  const result = await run(process.execPath, [script.pathname], {
    cwd: directory,
    env: { METRICS_BEARER_TOKEN: token },
  })
  assert.ok(!result.stdout.includes(token))
  assert.ok(!result.stderr.includes(token))
  const path = join(directory, ".local-observability", "prometheus.yml")
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal(
    (await stat(join(directory, ".local-observability"))).mode & 0o777,
    0o700
  )
  assert.ok((await readFile(path, "utf8")).includes(token))
  await assert.rejects(
    run(process.execPath, [script.pathname], {
      cwd: directory,
      env: { METRICS_BEARER_TOKEN: canary },
    }),
    (error) => !String(error).includes(canary)
  )
})
