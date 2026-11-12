import assert from "node:assert/strict"
import { test } from "node:test"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import * as Sentry from "@sentry/nextjs"
import {
  diagnosticsOptions,
  initializeDiagnostics,
  reportFailure,
} from "../modules/diagnostics/policy"

const dsn = "https://public@example.invalid/1"
const canary = "PRIVATE_TRANSCRIPT_TOKEN_URL_STACK_HEADER_CANARY"

function receiver(bodies: string[]): typeof fetch {
  return async (url, init) => {
    assert.ok(String(url).startsWith("https://example.invalid/api/1/envelope/"))
    assert.equal(typeof init?.body, "string")
    assert.equal(init?.credentials, "omit")
    assert.equal(init?.redirect, "error")
    assert.equal(init?.referrerPolicy, "no-referrer")
    assert.deepEqual(init?.headers, {
      "content-type": "application/x-sentry-envelope",
    })
    bodies.push(String(init?.body))
    return new Response(null, { status: 200 })
  }
}

function inspect(body: string, runtime: string, failure: string) {
  assert.ok(!body.includes(canary))
  const lines = body.split("\n").map((line) => JSON.parse(line))
  assert.equal(lines.length, 3)
  const [header, item, event] = lines
  assert.deepEqual(Object.keys(header).sort(), ["event_id", "sent_at"])
  assert.match(header.event_id, /^[a-f0-9]{32}$/)
  assert.equal(event.event_id, header.event_id)
  assert.equal(Number.isNaN(Date.parse(header.sent_at)), false)
  assert.deepEqual(item, { type: "event" })
  assert.deepEqual(Object.keys(event).sort(), [
    "event_id",
    "fingerprint",
    "level",
    "message",
    "platform",
    "tags",
    "timestamp",
  ])
  assert.equal(event.message, "Application failure")
  assert.equal(event.level, "error")
  assert.equal(event.platform, "javascript")
  assert.deepEqual(event.tags, { runtime, failure })
  assert.deepEqual(event.fingerprint, ["conversations", runtime, failure])
  assert.ok(Math.abs(event.timestamp - Date.now() / 1000) < 10)
  return event.event_id
}

test("actual Next.js Node SDK serializes only safe summaries after processing, enrichment and attachments", async () => {
  const bodies: string[] = []
  initializeDiagnostics(Sentry, "node", dsn, receiver(bodies))
  try {
    const client = Sentry.getClient()
    assert.ok(client)
    assert.equal(Sentry.SDK_VERSION, "10.78.0")
    assert.deepEqual(client.getOptions().integrations, [])
    assert.equal(client.getOptions().tracesSampleRate, undefined)
    assert.equal(client.getOptions().enableLogs, false)
    assert.equal(client.getOptions().enableMetrics, false)
    client.on("beforeEnvelope", (envelope) => {
      envelope[0].sdk = { name: canary, version: canary }
      envelope[0].trace = { public_key: canary, trace_id: canary }
      for (const item of envelope[1]) item[0].filename = canary
    })
    client.on("beforeSendEvent", (event) => {
      event.tags = { runtime: canary, failure: canary }
      event.event_id = canary
      event.timestamp = 1
      event.fingerprint = [canary]
      event.extra = { data: canary }
    })
    Sentry.withScope((scope) => {
      scope.setUser({ id: canary, email: canary })
      scope.setTag(canary, canary)
      scope.setExtra(canary, canary)
      scope.setContext(canary, { data: canary })
      scope.addAttachment({ filename: canary, data: canary })
      Sentry.captureEvent({
        event_id: canary,
        message: canary,
        transaction: canary,
        release: canary,
        environment: canary,
        request: {
          url: `https://private.invalid/?ticket=${canary}`,
          headers: { authorization: canary },
          data: canary,
        },
        exception: {
          values: [
            {
              type: canary,
              value: canary,
              stacktrace: {
                frames: [
                  {
                    filename: canary,
                    function: canary,
                    vars: { data: canary },
                  },
                ],
              },
            },
          ],
        },
        breadcrumbs: [{ message: canary, data: { data: canary } }],
      })
    })
    reportFailure(Sentry.captureEvent, "render_error")
    reportFailure(Sentry.captureEvent, "request_error")
    Sentry.captureException(new Error(canary))
    Sentry.logger.info(canary)
    Sentry.metrics.count(canary)
    Sentry.startSession({ release: canary })
    Sentry.captureSession()
    Sentry.endSession()
    Sentry.captureCheckIn({ monitorSlug: canary, status: "ok" })
    await Sentry.startSpan({ name: canary }, async () => "domain result")
    assert.equal(await Sentry.flush(1000), true)
    assert.equal(bodies.length, 4)
    const ids = bodies.map((body, index) =>
      inspect(
        body,
        "node",
        [
          "application_error",
          "render_error",
          "request_error",
          "application_error",
        ][index]!
      )
    )
    assert.equal(new Set(ids).size, 4)
  } finally {
    await Sentry.close(1000)
  }
})

test("final SDK serializer drops other envelope kinds and repairs no untrusted error metadata", async () => {
  const bodies: string[] = []
  const options = diagnosticsOptions(
    "edge",
    dsn,
    Sentry.createTransport,
    receiver(bodies)
  )
  assert.ok(options)
  const transport = options.transport({
    url: "https://example.invalid/api/1/envelope/",
    recordDroppedEvent: () => {
      throw new Error(canary)
    },
  })
  const send = (input: unknown) =>
    Reflect.apply(transport.send, transport, [input])
  for (const type of [
    "attachment",
    "session",
    "sessions",
    "client_report",
    "transaction",
    "span",
    "log",
    "metric",
    "trace_metric",
    "replay_event",
    "replay_recording",
    "profile",
    "profile_chunk",
    "check_in",
    "feedback",
    "user_report",
    "raw_security",
    canary,
  ])
    await send([
      { trace: canary },
      [[{ type, filename: canary }, { data: canary }]],
    ])
  for (const input of [
    undefined,
    null,
    [],
    [null, null],
    [{}, [null, [], [{ type: "event" }, canary]]],
    new Proxy([], {
      get() {
        throw new Error(canary)
      },
    }),
  ])
    await send(input)
  assert.equal(bodies.length, 0)
  await send([
    { event_id: canary, sdk: canary },
    [
      [{ type: "attachment" }, canary],
      [
        { type: "event", filename: canary },
        {
          event_id: canary,
          tags: { runtime: canary, failure: "request_error" },
          fingerprint: [canary],
          data: canary,
        },
      ],
    ],
  ])
  assert.equal(await transport.flush(1000), true)
  assert.equal(bodies.length, 1)
  inspect(bodies[0]!, "edge", "application_error")
})

test("explicit Node client ignores environment-selected senders and tracing bootstrap", async () => {
  const names = [
    "SENTRY_SPOTLIGHT",
    "SENTRY_TRACES_SAMPLE_RATE",
    "SENTRY_TRACE",
    "SENTRY_BAGGAGE",
  ] as const
  const previous = names.map((name) => process.env[name])
  const bodies: string[] = []
  const errorListeners = process.listeners("uncaughtException")
  const rejectionListeners = process.listeners("unhandledRejection")
  const propagation = Sentry.getCurrentScope().getPropagationContext()
  try {
    Object.assign(process.env, {
      SENTRY_SPOTLIGHT: "http://127.0.0.1:9/stream",
      SENTRY_TRACES_SAMPLE_RATE: "1",
      SENTRY_TRACE: `${"a".repeat(32)}-${"b".repeat(16)}-1`,
      SENTRY_BAGGAGE: `sentry-environment=${canary}`,
    })
    initializeDiagnostics(Sentry, "node", dsn, receiver(bodies))
    const client = Sentry.getClient()
    assert.ok(client)
    // Assert no bypass sender before capturing anything: a regression must not
    // send a poisoned envelope to a real local Spotlight service.
    assert.deepEqual(client.getOptions().integrations, [])
    assert.equal(Reflect.get(client.getOptions(), "spotlight"), false)
    assert.equal(client.getOptions().tracesSampleRate, undefined)
    assert.deepEqual(process.listeners("uncaughtException"), errorListeners)
    assert.deepEqual(
      process.listeners("unhandledRejection"),
      rejectionListeners
    )
    assert.deepEqual(
      Sentry.getCurrentScope().getPropagationContext(),
      propagation
    )
    reportFailure(Sentry.captureEvent, "request_error")
    assert.equal(await Sentry.flush(1000), true)
    assert.equal(bodies.length, 1)
    inspect(bodies[0]!, "node", "request_error")
  } finally {
    await Sentry.close(1000)
    names.forEach((name, index) => {
      const value = previous[index]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
  }
})

test("installed edge-specific SDK entrypoint processes safe request errors (Node host, not deployed edge)", async () => {
  const require = createRequire(import.meta.url)
  const edge: typeof Sentry = require(
    join(
      dirname(require.resolve("@sentry/nextjs/package.json")),
      "build/cjs/edge/index.js"
    )
  )
  const bodies: string[] = []
  const errorHandler = globalThis.onerror
  const rejectionHandler = globalThis.onunhandledrejection
  initializeDiagnostics(edge, "edge", dsn, receiver(bodies))
  try {
    assert.equal(globalThis.onerror, errorHandler)
    assert.equal(globalThis.onunhandledrejection, rejectionHandler)
    reportFailure(edge.captureEvent, "request_error")
    edge.captureException(new Error(canary))
    assert.equal(await edge.flush(1000), true)
    assert.equal(bodies.length, 2)
    inspect(bodies[0]!, "edge", "request_error")
    inspect(bodies[1]!, "edge", "application_error")
    assert.deepEqual(edge.getClient()?.getOptions().integrations, [])
  } finally {
    await edge.close(1000)
  }
})

test("missing/invalid configuration never initializes and diagnostic failures preserve control results", async () => {
  let calls = 0
  const rejectingSdk = {
    ...Sentry,
    NodeClient: new Proxy(Sentry.NodeClient, {
      construct() {
        calls++
        throw new Error(canary)
      },
    }),
  }
  for (const value of [
    undefined,
    "",
    canary,
    "https://example.invalid/1",
    "http://public@example.invalid/1",
    "https://public:SECRET@example.invalid/1",
    "https://public:@example.invalid/1",
    "https:///public@example.invalid/1",
    "https://public@host!invalid/1",
    "https://public@example.invalid/1?",
    "https://public@example.invalid/1#",
  ])
    initializeDiagnostics(rejectingSdk, "node", value)
  assert.equal(calls, 0)
  assert.doesNotThrow(() => initializeDiagnostics(rejectingSdk, "node", dsn))
  assert.equal(calls, 1)
  let domainCalls = 0
  const outcome = () => {
    domainCalls++
    reportFailure(() => {
      throw new Error(canary)
    }, "request_error")
    return "durable outcome"
  }
  assert.equal(outcome(), "durable outcome")
  assert.equal(domainCalls, 1)
  const original = new Error("original domain rejection")
  assert.throws(
    () => {
      reportFailure(() => {
        throw new Error(canary)
      }, "render_error")
      throw original
    },
    (error) => error === original
  )
  for (const http of [
    () => {
      throw new Error(canary)
    },
    async () => {
      throw new Error(canary)
    },
    () => new Promise<Response>(() => {}),
  ]) {
    const options = diagnosticsOptions(
      "node",
      dsn,
      Sentry.createTransport,
      http
    )
    assert.ok(options)
    const transport = options.transport({
      url: "https://example.invalid/api/1/envelope/",
      recordDroppedEvent: () => {},
    })
    const started = Date.now()
    await Reflect.apply(transport.send, transport, [
      [{}, [[{ type: "event" }, {}]]],
    ])
    assert.ok(Date.now() - started < 2000)
    assert.equal(await transport.flush(1000), true)
  }
})

test("actual SDK transport bounds concurrent stalled requests and aborts them at its deadline", async () => {
  let requests = 0,
    aborts = 0
  const options = diagnosticsOptions(
    "node",
    dsn,
    Sentry.createTransport,
    async (_url, init) => {
      requests++
      init?.signal?.addEventListener("abort", () => {
        aborts++
      })
      return new Promise<Response>(() => {})
    }
  )
  assert.ok(options)
  const transport = options.transport({
    url: "https://example.invalid/api/1/envelope/",
    recordDroppedEvent: () => {},
  })
  const started = Date.now()
  await Promise.all(
    Array.from({ length: 32 }, () =>
      Reflect.apply(transport.send, transport, [
        [{}, [[{ type: "event" }, {}]]],
      ])
    )
  )
  assert.equal(requests, 8)
  assert.equal(aborts, 8)
  assert.ok(Date.now() - started < 2000)
  assert.equal(await transport.flush(Number.NaN), true)
})
