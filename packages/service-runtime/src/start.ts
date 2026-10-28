import type { FastifyInstance } from "fastify"
import type { ServiceConfig } from "./config.js"

export async function startService(
  app: FastifyInstance,
  config: ServiceConfig
): Promise<void> {
  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    app.log.info("Service shutting down")
    const deadline = setTimeout(() => {
      app.log.error("Shutdown deadline exceeded")
      process.exit(1)
    }, config.SHUTDOWN_TIMEOUT_MS)
    deadline.unref()
    try {
      await app.close()
    } catch {
      app.log.error("Service shutdown failed")
      process.exitCode = 1
    } finally {
      clearTimeout(deadline)
      process.removeListener("SIGINT", signal)
      process.removeListener("SIGTERM", signal)
    }
  }
  const signal = () => {
    void shutdown()
  }
  process.on("SIGINT", signal)
  process.on("SIGTERM", signal)
  try {
    await app.listen({ host: config.HOST, port: config.PORT })
  } catch (error) {
    await shutdown()
    throw error
  }
}

// Startup failures must not print URLs, credentials, or driver error payloads.
export function reportStartupFailure(): void {
  console.error(
    "Service startup failed. Check required configuration and port availability."
  )
  process.exitCode = 1
}
