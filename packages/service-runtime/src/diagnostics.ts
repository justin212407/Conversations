import type { FastifyBaseLogger } from "fastify"
import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, timingSafeEqual } from "node:crypto"
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
} from "@opentelemetry/api"
import { W3CTraceContextPropagator } from "@opentelemetry/core"
import { resourceFromAttributes } from "@opentelemetry/resources"
import {
  TracerProvider,
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from "@opentelemetry/sdk-trace"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client"
import { pino, type Logger } from "pino"
import {
  requestCorrelationSchema,
  type RequestCorrelation,
} from "@conversations/shared"
import type { ServiceConfig } from "./config.js"

const stages = [
  "http",
  "command.admit",
  "job.publish",
  "job.execute",
  "provider.generate",
  "operation.finalize",
  "event.publish",
  "event.deliver",
  "socket.connect",
  "socket.subscribe",
  "socket.close",
  "runtime.recover",
] as const
export type DiagnosticStage = (typeof stages)[number]
const failures = [
  "none",
  "dependency_unavailable",
  "invalid_input",
  "unauthorized",
  "inaccessible",
  "conflict",
  "provider_unavailable",
  "provider_error",
  "timeout",
  "context_limit",
  "output_limit",
  "interrupted",
  "expired",
  "ignored",
  "heartbeat",
  "redis_interruption",
  "buffer_limit",
  "client_closed",
  "shutdown",
  "protocol",
] as const
export type DiagnosticFailure = (typeof failures)[number]
export type DiagnosticOutcome = "success" | "failed" | "ignored"
export type DiagnosticFields = Partial<
  Record<
    | "requestId"
    | "conversationId"
    | "operationId"
    | "messageId"
    | "eventId"
    | "connectionId",
    string
  >
>
const idKeys = new Set([
  "requestId",
  "conversationId",
  "operationId",
  "messageId",
  "eventId",
  "connectionId",
])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const methods = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"])
const routes = new Set([
  "/v1/me",
  "/v1/conversations",
  "/v1/conversations/:id",
  "/v1/conversations/:id/messages",
  "/v1/conversations/:id/operations/:operationId/retry",
  "/v1/conversations/:id/snapshot",
  "/v1/realtime-tickets",
  "/internal/realtime/redeem",
  "/internal/realtime/check",
  "/internal/realtime/release",
  "/openapi.json",
  "/health/live",
  "/health/ready",
])
export const normalizedRoute = (value: string | undefined) =>
  value && routes.has(value) ? value : "unmatched"
export const normalizedMethod = (value: string) =>
  methods.has(value) ? value : "OTHER"
export function safeFailure(value: unknown): DiagnosticFailure {
  return typeof value === "string" &&
    (failures as readonly string[]).includes(value)
    ? (value as DiagnosticFailure)
    : "dependency_unavailable"
}

// Defense in depth for ALL logger calls, including framework and future callers.
function safeFields(
  input: Record<string, unknown>
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(input)) {
    if (idKeys.has(key) && typeof value === "string" && uuid.test(value))
      out[key] = value
    else if (
      (key === "traceId" &&
        typeof value === "string" &&
        /^[a-f0-9]{32}$/.test(value)) ||
      (key === "spanId" &&
        typeof value === "string" &&
        /^[a-f0-9]{16}$/.test(value))
    )
      out[key] = value
    else if (key === "stage" && (stages as readonly unknown[]).includes(value))
      out[key] = String(value)
    else if (
      key === "outcome" &&
      ["success", "failed", "ignored"].includes(String(value))
    )
      out[key] = String(value)
    else if (
      key === "failureCode" &&
      (failures as readonly unknown[]).includes(value)
    )
      out[key] = String(value)
    else if (
      key === "dependency" &&
      [
        "postgres",
        "redis",
        "schema",
        "queue",
        "generation",
        "gateway",
        "other",
      ].includes(String(value))
    )
      out[key] = String(value)
    else if (key === "route")
      out[key] = normalizedRoute(typeof value === "string" ? value : undefined)
    else if (key === "method") out[key] = normalizedMethod(String(value))
    else if (
      ["statusCode", "durationMs"].includes(key) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    )
      out[key] = value
  }
  return out
}
export function createSafeLogger(
  config: ServiceConfig,
  stream?: { write: (message: string) => void }
): FastifyBaseLogger {
  const logger = pino(
    {
      level: config.LOG_LEVEL,
      base: { service: config.service },
      redact: ["authorization", "cookie", "password", "token", "secret"],
      formatters: {
        log: safeFields,
        bindings: (input) => ({
          service: config.service,
          ...(typeof input.reqId === "string" && uuid.test(input.reqId)
            ? { reqId: input.reqId }
            : {}),
        }),
      },
      hooks: {
        logMethod(args, method) {
          const event =
            typeof args[1] === "string" &&
            [
              "http.completed",
              "runtime.started",
              "runtime.shutdown.started",
              "runtime.shutdown.failed",
              "runtime.shutdown.deadline",
              "runtime.dependency.failed",
              "runtime.dependency.recovered",
              ...stages.map((stage) => stage + ".finished"),
            ].includes(args[1])
              ? args[1]
              : "runtime.diagnostic"
          method.call(
            this,
            typeof args[0] === "object" && args[0] !== null
              ? safeFields(args[0] as Record<string, unknown>)
              : {},
            event
          )
        },
      },
    },
    stream
      ? {
          write(message: string) {
            try {
              stream.write(message)
            } catch {
              /* diagnostic sink failure is isolated */
            }
          },
        }
      : undefined
  )
  function wrap(logger: Logger): FastifyBaseLogger {
    return {
      level: logger.level,
      fatal: logger.fatal.bind(logger),
      error: logger.error.bind(logger),
      warn: logger.warn.bind(logger),
      info: logger.info.bind(logger),
      debug: logger.debug.bind(logger),
      trace: logger.trace.bind(logger),
      silent: logger.silent.bind(logger),
      child(bindings) {
        return wrap(logger.child(safeFields(bindings)))
      },
    }
  }
  return wrap(logger)
}
export function metricsAuthorized(
  header: string | undefined,
  token: string | undefined
): boolean {
  if (!token || !header || header.length > 1024) return false
  const hash = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(hash(header), hash("Bearer " + token))
}
export class Diagnostics {
  readonly registry = new Registry()
  readonly logger: FastifyBaseLogger
  readonly metricsToken: string | undefined
  private readonly active = new AsyncLocalStorage<Context>()
  private readonly propagator = new W3CTraceContextPropagator()
  private readonly provider: TracerProvider
  private readonly tracer
  private readonly operations
  private readonly duration
  private readonly httpRequests
  private readonly httpDuration
  private readonly sockets
  private closed = false
  constructor(
    readonly config: ServiceConfig,
    options: {
      stream?: { write: (message: string) => void }
      exporter?: SpanExporter
    } = {}
  ) {
    this.logger = createSafeLogger(config, options.stream)
    this.metricsToken = config.METRICS_BEARER_TOKEN
    this.registry.setDefaultLabels({ service: config.service })
    this.operations = new Counter({
      name: "conversations_operations_total",
      help: "Bounded service stage outcomes",
      labelNames: ["stage", "outcome", "failure_code"],
      registers: [this.registry],
    })
    this.duration = new Histogram({
      name: "conversations_operation_duration_seconds",
      help: "Service stage duration",
      labelNames: ["stage", "outcome"],
      buckets: [0.01, 0.05, 0.25, 1, 5, 15, 60, 120],
      registers: [this.registry],
    })
    this.httpRequests = new Counter({
      name: "conversations_http_requests_total",
      help: "HTTP requests by normalized route",
      labelNames: ["route", "method", "status_class"],
      registers: [this.registry],
    })
    this.httpDuration = new Histogram({
      name: "conversations_http_request_duration_seconds",
      help: "HTTP request duration",
      labelNames: ["route", "method", "status_class"],
      buckets: [0.005, 0.025, 0.1, 0.5, 2, 10],
      registers: [this.registry],
    })
    this.sockets = new Gauge({
      name: "conversations_active_connections",
      help: "Currently admitted WebSocket connections",
      registers: [this.registry],
    })
    this.sockets.set(0)
    const exporter =
      options.exporter ??
      (config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
        ? new OTLPTraceExporter({
            url: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
            headers: {},
            timeoutMillis: 750,
            concurrencyLimit: 1,
          })
        : undefined)
    this.provider = new TracerProvider({
      resource: resourceFromAttributes({
        "service.name": "conversations-" + config.service,
      }),
      sampler: new TraceIdRatioBasedSampler(config.TRACE_SAMPLE_RATIO),
      spanLimits: {
        attributeCountLimit: 24,
        attributeValueLengthLimit: 160,
        eventCountLimit: 0,
        linkCountLimit: 0,
      },
      spanProcessors: exporter
        ? [
            new BatchSpanProcessor({
              exporter,
              maxQueueSize: 256,
              maxExportBatchSize: 64,
              scheduledDelayMillis: 250,
              exportTimeoutMillis: 800,
            }),
          ]
        : [],
    })
    this.tracer = this.provider.getTracer("conversations-services", "1")
  }
  start(
    stage: DiagnosticStage,
    fields: DiagnosticFields = {},
    carrier?: RequestCorrelation,
    kind = stage === "http"
      ? SpanKind.SERVER
      : stage === "provider.generate"
        ? SpanKind.CLIENT
        : stage === "job.publish" || stage === "event.publish"
          ? SpanKind.PRODUCER
          : stage === "job.execute" || stage === "event.deliver"
            ? SpanKind.CONSUMER
            : SpanKind.INTERNAL
  ) {
    if (!(stages as readonly string[]).includes(stage))
      stage = "runtime.recover"
    const parsed = requestCorrelationSchema.safeParse(carrier)
    // Only standards-validated trace context; baggage never enters this carrier.
    const parent = parsed.success
      ? this.propagator.extract(
          ROOT_CONTEXT,
          { traceparent: parsed.data.traceparent },
          { get: (c, k) => c[k as keyof typeof c], keys: (c) => Object.keys(c) }
        )
      : (this.active.getStore() ?? ROOT_CONTEXT)
    const metadata = safeFields(fields)
    const span = this.tracer.startSpan(
      stage,
      { kind, attributes: metadata },
      parent
    )
    const ctx = trace.setSpan(parent, span),
      started = performance.now()
    let ended = false
    const contextIds = () => ({
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
    })
    return {
      correlation: (requestId: string): RequestCorrelation => {
        const output: Record<string, string> = {}
        this.propagator.inject(ctx, output, {
          set: (c, k, v) => {
            c[k] = v
          },
        })
        // Do not persist/forward arbitrary vendor tracestate into application data.
        return {
          requestId,
          ...(output.traceparent ? { traceparent: output.traceparent } : {}),
        }
      },
      context: ctx,
      http(route: string | undefined, method: string, status: number) {
        span.setAttributes({
          "http.route": normalizedRoute(route),
          "http.request.method": normalizedMethod(method),
          "http.response.status_code":
            status >= 100 && status <= 599 ? status : 503,
        })
      },
      add(fields: DiagnosticFields) {
        Object.assign(metadata, safeFields(fields))
        span.setAttributes(safeFields(fields))
      },
      finish: (
        outcome: DiagnosticOutcome = "success",
        code: DiagnosticFailure = "none"
      ) => {
        if (ended) return
        ended = true
        if (!["success", "failed", "ignored"].includes(outcome))
          outcome = "failed"
        const failure = safeFailure(code),
          seconds = (performance.now() - started) / 1000
        span.setAttributes({ outcome, failureCode: failure })
        if (outcome === "failed") span.setStatus({ code: SpanStatusCode.ERROR })
        span.end()
        this.count(stage, outcome, failure)
        this.duration.observe({ stage, outcome }, seconds)
        // Fixed message, explicitly selected fields. Never serialize caught errors.
        this.logger[outcome === "failed" ? "warn" : "info"](
          {
            ...metadata,
            ...contextIds(),
            stage,
            outcome,
            failureCode: failure,
            durationMs: Math.round(seconds * 1000),
          },
          stage + ".finished"
        )
      },
    }
  }
  async run<T>(
    stage: DiagnosticStage,
    fields: DiagnosticFields,
    work: (span: ReturnType<Diagnostics["start"]>) => Promise<T>,
    carrier?: RequestCorrelation
  ): Promise<T> {
    const span = this.start(stage, fields, carrier)
    try {
      const result = await this.active.run(span.context, () => work(span))
      span.finish()
      return result
    } catch (error) {
      const status =
        error && typeof error === "object" && "statusCode" in error
          ? error.statusCode
          : undefined
      span.finish(
        "failed",
        status === 404
          ? "inaccessible"
          : status === 409
            ? "conflict"
            : status === 400 || status === 413
              ? "invalid_input"
              : "dependency_unavailable"
      )
      throw error
    }
  }
  count(
    stage: DiagnosticStage,
    outcome: DiagnosticOutcome = "success",
    failure: DiagnosticFailure = "none"
  ) {
    if (!(stages as readonly string[]).includes(stage)) return
    this.operations.inc({
      stage,
      outcome: ["success", "failed", "ignored"].includes(outcome)
        ? outcome
        : "failed",
      failure_code: safeFailure(failure),
    })
  }
  connection(delta: 1 | -1) {
    this.sockets.inc(delta)
  }
  http(
    route: string | undefined,
    method: string,
    status: number,
    seconds: number
  ) {
    const labels = {
      route: normalizedRoute(route),
      method: normalizedMethod(method),
      status_class:
        status >= 100 && status <= 599
          ? Math.floor(status / 100) + "xx"
          : "other",
    }
    this.httpRequests.inc(labels)
    this.httpDuration.observe(labels, Math.max(0, seconds))
  }
  async shutdown() {
    if (this.closed) return
    this.closed = true
    this.active.disable()
    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        this.provider.shutdown().catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(
            resolve,
            Math.min(1000, Math.floor(this.config.SHUTDOWN_TIMEOUT_MS / 4))
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}
export type DiagnosticSpan = ReturnType<Diagnostics["start"]>
// Browser/public envelopes retain their existing shape, but never export trace state.
export function publicCorrelation<
  T extends { correlation?: RequestCorrelation },
>(event: T): T {
  if (!event.correlation) return event
  return { ...event, correlation: { requestId: event.correlation.requestId } }
}
