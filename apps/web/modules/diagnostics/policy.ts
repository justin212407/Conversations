import type {
  ErrorEvent,
  EventHint,
  createTransport,
  captureEvent,
  init,
  BrowserClient,
  NodeClient,
  VercelEdgeClient,
  setCurrentClient,
} from "@sentry/nextjs"

type Runtime = "browser" | "node" | "edge"
type Failure = "render_error" | "request_error" | "application_error"
type SdkOptions = Parameters<typeof init>[0]
type Transport = ReturnType<typeof createTransport>
type TransportFactory = NonNullable<SdkOptions["transport"]>

const markers = new WeakMap<object, Failure>()
const deadlineMs = 750
const bufferSize = 8

/** A private marker carries only our category, never the caught error or request. */
export function reportFailure(capture: typeof captureEvent, failure: Failure) {
  try {
    const marker = {}
    markers.set(
      marker,
      failure === "render_error" || failure === "request_error"
        ? failure
        : "application_error"
    )
    capture({}, { originalException: marker })
  } catch {
    // Diagnostics never replace the request/render outcome with their own failure.
  }
}

function configuredDsn(value: string | undefined): string | undefined {
  if (
    !value ||
    /[\s\\?#]/u.test(value) ||
    [...value].some(
      (char) =>
        char.charCodeAt(0) < 32 ||
        (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)
    )
  )
    return
  try {
    const url = new URL(value)
    if (
      !/^https:\/\/[a-zA-Z0-9]+@[^/]+\//.test(value) ||
      !/^(?:\[[0-9a-f:.]+\]|[a-zA-Z0-9_.-]+)$/.test(url.hostname) ||
      !/^[a-zA-Z0-9]+$/.test(url.username) ||
      url.password ||
      !/^\/(?:[a-zA-Z0-9_-]+\/)*[0-9]+$/.test(url.pathname)
    )
      return
    // Pass only canonical SDK-compatible syntax; its string parser can log invalid input.
    return url.href
  } catch {
    return
  }
}

function category(hint: EventHint): Failure {
  const marker = hint.originalException
  return marker && typeof marker === "object"
    ? (markers.get(marker) ?? "application_error")
    : "application_error"
}

function safeError(runtime: Runtime, failure: Failure) {
  return {
    type: undefined,
    event_id: crypto.randomUUID().replaceAll("-", ""),
    timestamp: Date.now() / 1000,
    level: "error",
    platform: "javascript",
    message: "Application failure",
    tags: { runtime, failure },
    fingerprint: ["conversations", runtime, failure],
  } satisfies ErrorEvent
}

/**
 * Only the final transport may export data. SDK event hooks do not cover sessions,
 * reports, attachments or metadata added after beforeSend.
 */
export function diagnosticsOptions(
  runtime: Runtime,
  value: string | undefined,
  sdkTransport: typeof createTransport,
  http: typeof fetch = globalThis.fetch
) {
  if (!["browser", "node", "edge"].includes(runtime)) return
  const dsn = configuredDsn(value)
  if (!dsn) return
  const projected = new WeakMap<object, Failure>()
  const transport: TransportFactory = (
    options: Parameters<TransportFactory>[0]
  ) => {
    // Discard transport headers/tunnel/drop callbacks from upstream configuration.
    const serialized = sdkTransport(
      { bufferSize, recordDroppedEvent: () => {} },
      async ({ body }) => {
        if (typeof body !== "string") return {}
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            Promise.resolve()
              .then(() =>
                http(options.url, {
                  method: "POST",
                  body,
                  headers: { "content-type": "application/x-sentry-envelope" },
                  credentials: "omit",
                  redirect: "error",
                  referrerPolicy: "no-referrer",
                  signal: controller.signal,
                })
              )
              .then((response) => {
                void response.body?.cancel().catch(() => {})
                return { statusCode: response.status }
              })
              .catch(() => ({})),
            new Promise<Record<string, never>>((resolve) => {
              timer = setTimeout(() => resolve({}), deadlineMs)
            }),
          ])
        } catch {
          return {}
        } finally {
          clearTimeout(timer)
          controller.abort()
        }
      }
    )
    const result: Transport = {
      async send(envelope) {
        try {
          // Bound inspection too: no unbounded array traversal or payload parsing.
          if (!Array.isArray(envelope) || !Array.isArray(envelope[1])) return {}
          for (const item of envelope[1].slice(0, bufferSize)) {
            if (!Array.isArray(item) || item[0]?.type !== "event") continue
            const payload: unknown = item[1]
            if (!payload || typeof payload !== "object") continue
            const safe = safeError(
              runtime,
              projected.get(payload) ?? "application_error"
            )
            // Never reuse an input header, event ID, timestamp or SDK-enriched body.
            return await serialized.send([
              { event_id: safe.event_id, sent_at: new Date().toISOString() },
              [[{ type: "event" }, safe]],
            ])
          }
        } catch {
          // Malformed/getter/proxy inputs and SDK transport failures fail closed.
        }
        return {}
      },
      async flush(timeout) {
        try {
          return await serialized.flush(
            Number.isFinite(timeout)
              ? Math.min(Math.max(timeout ?? deadlineMs, 1), deadlineMs)
              : deadlineMs
          )
        } catch {
          return false
        }
      },
    }
    return result
  }
  return {
    dsn,
    enabled: true,
    debug: false,
    defaultIntegrations: false,
    integrations: [],
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    enableMetrics: false,
    spotlight: false,
    tracesSampleRate: undefined,
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    skipOpenTelemetrySetup: true,
    transportOptions: { bufferSize },
    beforeBreadcrumb: () => null,
    beforeSend: (_event: ErrorEvent, hint: EventHint) => {
      try {
        const failure = category(hint)
        const event = safeError(runtime, failure)
        projected.set(event, failure)
        return event
      } catch {
        return null
      }
    },
    beforeSendTransaction: () => null,
    transport,
  } satisfies SdkOptions
}

export function initializeDiagnostics(
  sdk: {
    createTransport: typeof createTransport
    setCurrentClient: typeof setCurrentClient
    BrowserClient?: typeof BrowserClient
    NodeClient?: typeof NodeClient
    VercelEdgeClient?: typeof VercelEdgeClient
  },
  runtime: Runtime,
  dsn: string | undefined,
  http: typeof fetch = globalThis.fetch
) {
  try {
    const options = diagnosticsOptions(runtime, dsn, sdk.createTransport, http)
    if (!options) return
    // Convenience initializers can add environment-selected senders, global error
    // handlers and tracing hooks even when integrations are disabled. Bind only
    // an explicit public client; its empty integration list owns all collection.
    const Client = {
      browser: sdk.BrowserClient,
      node: sdk.NodeClient,
      edge: sdk.VercelEdgeClient,
    }[runtime]
    if (!Client) return
    const client = new Client({
      ...options,
      integrations: [],
      stackParser: () => [],
    })
    sdk.setCurrentClient(client)
    client.init()
  } catch {
    // Optional configuration/SDK failures cannot prevent application startup.
  }
}
