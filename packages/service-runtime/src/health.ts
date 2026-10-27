import Fastify, { type FastifyInstance } from "fastify"
import type { HealthReport } from "@conversations/shared"
import type { ServiceConfig } from "./config.js"

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
  logStream?: { write: (message: string) => void }
): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(logStream ? { stream: logStream } : {}),
      base: { service: config.service },
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-vapi-secret",
      ],
      // Do not log URL/query strings: later socket tickets must remain secret.
      serializers: {
        req: (req) => ({ method: req.method, requestId: req.id }),
      },
    },
    requestTimeout: 10000,
    bodyLimit: 64 * 1024,
  })
  let closing = false
  app.addHook("preClose", async () => {
    closing = true
    await resources.stopIntake?.()
  })
  app.addHook("onClose", async () => {
    await resources.close()
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
