import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyBaseLogger,
  LogController,
} from "fastify"
import { randomUUID } from "node:crypto"
import type { HealthReport } from "@conversations/shared"
import type { ServiceConfig } from "./config.js"
import {
  Diagnostics,
  metricsAuthorized,
  normalizedRoute,
  normalizedMethod,
  type DiagnosticSpan,
} from "./diagnostics.js"
import {
  requestCorrelationSchema,
  type RequestCorrelation,
} from "@conversations/shared"
import type { FastifyRequest } from "fastify"
const requestSpans = new WeakMap<object, DiagnosticSpan>()
const diagnostics = new WeakMap<object, Diagnostics>()
export function serviceDiagnostics(app: FastifyInstance): Diagnostics {
  return diagnostics.get(app)!
}
export function requestCorrelation(
  request: FastifyRequest
): RequestCorrelation {
  return (
    requestSpans.get(request)?.correlation(request.id) ?? {
      requestId: request.id,
    }
  )
}

export interface Dependency {
  name: string
  check: () => Promise<unknown>
}
export interface Resources {
  dependencies: Dependency[]
  stopIntake?: () => Promise<void>
  close: () => Promise<void>
}

async function checkDependency(
  dependency: Dependency,
  timeoutMs: number
): Promise<"up" | "down"> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(dependency.check),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Dependency timeout")),
          timeoutMs
        )
      }),
    ])
    return "up"
  } catch {
    return "down"
  } finally {
    clearTimeout(timeout)
  }
}

export function createHealthServer(
  config: ServiceConfig,
  resources: Resources,
  logStream?: { write: (message: string) => void },
  telemetry?: Diagnostics,
  options: { customErrorHandler?: boolean } = {}
): FastifyInstance {
  const diag = telemetry ?? new Diagnostics(config, { stream: logStream })
  const logger: FastifyBaseLogger = diag.logger
  const app = Fastify({
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    loggerInstance: logger,
    // Router decoding failures occur before the application's error handler.
    // Never let the framework echo a malformed path or ticket-bearing query.
    frameworkErrors(error, request, reply: FastifyReply) {
      const invalid = error.code === "FST_ERR_BAD_URL",
        status = invalid ? 400 : 503,
        requestId = request.id || randomUUID(),
        durationMs = reply.elapsedTime
      diag.http("unmatched", request.method, status, durationMs / 1000)
      // Router failures bypass onResponse, so their returned ID needs its own
      // safe completion record. Never include the framework error or raw path.
      diag.logger.info(
        {
          requestId,
          route: "unmatched",
          method: normalizedMethod(request.method),
          statusCode: status,
          durationMs: Math.round(durationMs),
        },
        "http.completed"
      )
      reply.code(status).send({
        error: {
          code: invalid ? "INVALID_INPUT" : "DEPENDENCY_UNAVAILABLE",
          message: invalid
            ? "Invalid request"
            : "Service temporarily unavailable",
        },
        requestId,
      })
    },
    requestTimeout: 10000,
    bodyLimit: 64 * 1024,
  })
  if (!options.customErrorHandler)
    app.setErrorHandler((error, request, reply) => {
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined
      const status =
        error && typeof error === "object" && "statusCode" in error
          ? error.statusCode
          : undefined
      const limited = code === "FST_ERR_CTP_BODY_TOO_LARGE"
      const invalid =
        limited || (typeof status === "number" && status >= 400 && status < 500)
      reply.code(limited ? 413 : invalid ? 400 : 503).send({
        error: {
          code: limited
            ? "INPUT_LIMIT_EXCEEDED"
            : invalid
              ? "INVALID_INPUT"
              : "DEPENDENCY_UNAVAILABLE",
          message: limited
            ? "Input exceeds the configured limit"
            : invalid
              ? "Invalid request"
              : "Service temporarily unavailable",
        },
        requestId: request.id,
      })
    })
  diagnostics.set(app, diag)
  const started = new WeakMap<object, number>()
  app.addHook("onRequest", async (request) => {
    if (request.routeOptions.url === "/metrics") return
    started.set(request, performance.now())
    if (request.routeOptions.url?.startsWith("/health/")) return
    const carrier = requestCorrelationSchema.safeParse({
      requestId: request.id,
      traceparent: request.headers.traceparent,
    })
    requestSpans.set(
      request,
      diag.start(
        "http",
        { requestId: request.id },
        carrier.success ? carrier.data : { requestId: request.id }
      )
    )
  })
  app.addHook("onResponse", async (request, reply) => {
    if (request.routeOptions.url === "/metrics") return
    const route = normalizedRoute(request.routeOptions.url),
      method = normalizedMethod(request.method)
    const elapsed =
      (performance.now() - (started.get(request) ?? performance.now())) / 1000
    diag.http(route, method, reply.statusCode, elapsed)
    diag.logger.info(
      {
        requestId: request.id,
        route,
        method,
        statusCode: reply.statusCode,
        durationMs: Math.round(elapsed * 1000),
      },
      "http.completed"
    )
    requestSpans.get(request)?.http(route, method, reply.statusCode)
    requestSpans
      .get(request)
      ?.finish(
        reply.statusCode >= 400 ? "failed" : "success",
        reply.statusCode === 401
          ? "unauthorized"
          : reply.statusCode === 404
            ? "inaccessible"
            : reply.statusCode === 409
              ? "conflict"
              : reply.statusCode >= 500
                ? "dependency_unavailable"
                : reply.statusCode >= 400
                  ? "invalid_input"
                  : "none"
      )
  })
  app.get("/metrics", async (request, reply) => {
    if (!diag.metricsToken)
      return reply.code(404).send({
        error: { code: "NOT_FOUND", message: "Route not found" },
        requestId: request.id,
      })
    if (!metricsAuthorized(request.headers.authorization, diag.metricsToken))
      return reply.code(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        requestId: request.id,
      })
    reply.header("cache-control", "no-store").type(diag.registry.contentType)
    return diag.registry.metrics()
  })
  let closing = false
  app.addHook("preClose", async () => {
    closing = true
    await resources.stopIntake?.()
  })
  app.addHook("onClose", async () => {
    try {
      await resources.close()
    } finally {
      await diag.shutdown()
    }
  })
  // Fastify's default 404 message includes the raw URL independently of the
  // request serializer. A stale ticket-bearing path must remain secret too.
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" },
      requestId: request.id,
    })
  })
  app.get(
    "/health/live",
    async (): Promise<HealthReport> => ({
      service: config.service,
      status: "alive",
    })
  )
  const dependencyStates = new Map<string, "up" | "down">()
  app.get("/health/ready", async (_request, reply): Promise<HealthReport> => {
    const entries = await Promise.all(
      resources.dependencies.map(
        async (dependency) =>
          [
            dependency.name,
            await checkDependency(dependency, config.HEALTH_TIMEOUT_MS),
          ] as const
      )
    )
    for (const [name, state] of entries) {
      const previous = dependencyStates.get(name)
      if (previous !== state && (state === "down" || previous !== undefined)) {
        const dependency = [
          "postgres",
          "redis",
          "schema",
          "queue",
          "generation",
          "gateway",
        ].includes(name)
          ? name
          : "other"
        diag.logger[state === "up" ? "info" : "warn"](
          {
            dependency,
            stage: "runtime.recover",
            outcome: state === "up" ? "success" : "failed",
            failureCode: state === "up" ? "none" : "dependency_unavailable",
          },
          state === "up"
            ? "runtime.dependency.recovered"
            : "runtime.dependency.failed"
        )
      }
      dependencyStates.set(name, state)
    }
    const checks = Object.fromEntries(entries)
    const ready = !closing && entries.every(([, state]) => state === "up")
    reply.code(ready ? 200 : 503)
    return {
      service: config.service,
      status: ready ? "ready" : "not_ready",
      checks,
    }
  })
  return app
}
