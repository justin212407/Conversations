import { ConversationStore } from "@conversations/database"
import {
  createHealthServer,
  type Resources,
  type ServiceConfig,
} from "@conversations/service-runtime"
import {
  authenticateBearer,
  AuthenticationError,
  AuthenticationUnavailable,
  type AuthConfig,
} from "./auth.js"

export function createApi(
  config: ServiceConfig,
  resources: Resources,
  store: ConversationStore,
  auth: AuthConfig | undefined,
  logStream?: { write: (message: string) => void }
): ReturnType<typeof createHealthServer> {
  const app = createHealthServer(config, resources, logStream)
  app.get("/v1/me", async (request, reply) => {
    reply.header("cache-control", "no-store")
    let subject: string
    try {
      subject = await authenticateBearer(request.headers.authorization, auth)
    } catch (error) {
      const unavailable = error instanceof AuthenticationUnavailable
      if (!(error instanceof AuthenticationError) && !unavailable) throw error
      if (!unavailable) reply.header("www-authenticate", "Bearer")
      return reply.code(unavailable ? 503 : 401).send({
        error: {
          code: unavailable ? "AUTH_UNAVAILABLE" : "UNAUTHORIZED",
          message: unavailable
            ? "Authentication unavailable"
            : "Authentication required",
        },
        requestId: request.id,
      })
    }
    try {
      const account = await store.provisionAccount(subject)
      return {
        id: account.id,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      }
    } catch {
      // Never send/log a raw driver error: parameters can contain identity data.
      return reply
        .code(503)
        .send({
          error: {
            code: "DEPENDENCY_UNAVAILABLE",
            message: "Account service unavailable",
          },
          requestId: request.id,
        })
    }
  })
  return app
}
