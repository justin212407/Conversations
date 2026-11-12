// Bundle with esbuild's browser platform and run in a fresh real browser context.
// The receiver is in memory: the synthetic DSN must never be contacted.
import * as Sentry from "@sentry/nextjs"
import {
  initializeDiagnostics,
  reportFailure,
} from "../modules/diagnostics/policy"

export async function verifyBrowserDiagnostics() {
  const canary = "PRIVATE_BROWSER_TRANSCRIPT_TICKET_URL_STACK_CANARY"
  const bodies: string[] = []
  const originalConsole = [console.log, console.warn, console.error]
  const originalHandlers = [window.onerror, window.onunhandledrejection]
  const check = (value: unknown) => {
    if (!value) throw new Error("Browser diagnostics verification failed")
  }
  initializeDiagnostics(
    Sentry,
    "browser",
    "https://public@example.invalid/1",
    async (_url, init) => {
      check(
        init?.credentials === "omit" &&
          init.redirect === "error" &&
          init.referrerPolicy === "no-referrer"
      )
      bodies.push(String(init?.body))
      return new Response(null, { status: 200 })
    }
  )
  try {
    const client = Sentry.getClient()
    if (!client) throw new Error("Missing browser SDK client")
    check(Sentry.SDK_VERSION === "10.78.0")
    check(client.getOptions().integrations?.length === 0)
    check(window.onerror === originalHandlers[0])
    check(window.onunhandledrejection === originalHandlers[1])
    client.on("beforeSendEvent", (event) => {
      event.event_id = canary
      event.tags = { failure: canary, runtime: canary }
      event.extra = { data: canary }
    })
    client.on("beforeEnvelope", (envelope) => {
      envelope[0].sdk = { name: canary, version: canary }
      envelope[0].trace = { public_key: canary, trace_id: canary }
      for (const item of envelope[1]) item[0].filename = canary
    })
    Sentry.withScope((scope) => {
      scope.setUser({ id: canary })
      scope.setContext(canary, { data: canary })
      scope.addAttachment({ filename: canary, data: canary })
      Sentry.captureException(new Error(canary))
    })
    reportFailure(Sentry.captureEvent, "render_error")
    reportFailure(Sentry.captureEvent, "request_error")
    Sentry.captureMessage(canary)
    Sentry.logger.info(canary)
    Sentry.metrics.count(canary)
    Sentry.startSession({ release: canary })
    Sentry.captureSession()
    Sentry.endSession()
    await Sentry.startSpan({ name: canary }, async () => "unchanged result")
    check(await Sentry.flush(1000))
    check(bodies.length === 4)
    const failures = [
      "application_error",
      "render_error",
      "request_error",
      "application_error",
    ]
    const ids = new Set<string>()
    bodies.forEach((body, index) => {
      check(!body.includes(canary))
      const lines = body.split("\n").map((line) => JSON.parse(line))
      check(lines.length === 3)
      const [header, item, event] = lines
      check(Object.keys(header).sort().join() === "event_id,sent_at")
      check(Object.keys(item).join() === "type" && item.type === "event")
      check(
        Object.keys(event).sort().join() ===
          "event_id,fingerprint,level,message,platform,tags,timestamp"
      )
      check(
        event.tags.runtime === "browser" &&
          event.tags.failure === failures[index]
      )
      check(
        event.message === "Application failure" &&
          event.level === "error" &&
          event.platform === "javascript"
      )
      check(
        JSON.stringify(event.fingerprint) ===
          JSON.stringify(["conversations", "browser", failures[index]])
      )
      check(
        /^[a-f0-9]{32}$/.test(header.event_id) &&
          event.event_id === header.event_id
      )
      check(Math.abs(event.timestamp - Date.now() / 1000) < 10)
      ids.add(event.event_id)
    })
    check(ids.size === 4)
  } finally {
    await Sentry.close(1000)
  }
  let initializations = 0
  for (const dsn of [undefined, "", "invalid synthetic DSN"])
    initializeDiagnostics(
      {
        ...Sentry,
        BrowserClient: new Proxy(Sentry.BrowserClient, {
          construct() {
            initializations++
            throw new Error("Invalid configuration initialized diagnostics")
          },
        }),
      },
      "browser",
      dsn
    )
  reportFailure(Sentry.captureEvent, "render_error")
  await Sentry.flush(1000)
  check(initializations === 0 && bodies.length === 4)
  check(
    originalConsole.every(
      (method, index) =>
        method === [console.log, console.warn, console.error][index]
    )
  )
  return {
    sdkVersion: Sentry.SDK_VERSION,
    enabledEnvelopes: bodies.length,
    disabledEnvelopes: 0,
    nonErrorEnvelopes: 0,
    consoleUnchanged: true,
    globalErrorHandlersUnchanged: true,
  }
}
