import {
  ConversationStore,
  DomainError,
  InvalidInput,
  type Conversation,
  type Message,
} from "@conversations/database"
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
import { object, pageQuery, text, uuid } from "./validation.js"
import { openapi } from "./openapi.js"
import cors from "@fastify/cors"
import {
  requestCorrelationSchema,
  type GenerationFailure,
} from "@conversations/shared"

function conversationProjection(conversation: Conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    status: conversation.status,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }
}
function messageProjection(
  message: Message & {
    operationId?: string | null
    failureCode?: GenerationFailure | null
  }
) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence,
    role: message.role,
    modality: message.modality,
    content: message.content,
    state: message.state,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    operationId: message.operationId ?? null,
    failureCode: message.failureCode ?? null,
  }
}
function correlation(requestId: string, headers: Record<string, unknown>) {
  const parsed = requestCorrelationSchema.safeParse({
    requestId,
    traceparent: headers.traceparent,
    tracestate: headers.tracestate,
  })
  return parsed.success ? parsed.data : { requestId }
}
export function createApi(
  config: ServiceConfig,
  resources: Resources,
  store: ConversationStore,
  auth: AuthConfig | undefined,
  logStream?: { write: (message: string) => void }
): ReturnType<typeof createHealthServer> {
  const app = createHealthServer(config, resources, logStream)
  // CORS sends its own plain-text error for malformed preflights. Validate
  // before that hook so these failures use the same safe JSON envelope.
  app.addHook("onRequest", async (request) => {
    if (
      request.method === "OPTIONS" &&
      (!request.headers.origin ||
        !request.headers["access-control-request-method"])
    )
      throw new InvalidInput()
  })
  app.register(cors, {
    origin: auth?.authorizedParties ?? [],
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Location"],
    credentials: false,
    strictPreflight: true,
    logLevel: "silent",
  })
  app.setErrorHandler((error, request, reply) => {
    let status = 503,
      code = "DEPENDENCY_UNAVAILABLE",
      message = "Service temporarily unavailable"
    const frameworkCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : ""
    if (error instanceof DomainError) {
      status = error.statusCode
      code = error.code
      message = error.message
    } else if (error instanceof AuthenticationError) {
      status = 401
      code = "UNAUTHORIZED"
      message = "Authentication required"
      reply.header("www-authenticate", "Bearer")
    } else if (error instanceof AuthenticationUnavailable) {
      code = "AUTH_UNAVAILABLE"
      message = "Authentication unavailable"
    } else if (frameworkCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
      status = 413
      code = "INPUT_LIMIT_EXCEEDED"
      message = "Input exceeds the configured limit"
    } else if (
      [
        "FST_ERR_CTP_INVALID_JSON_BODY",
        "FST_ERR_CTP_EMPTY_JSON_BODY",
        "FST_ERR_CTP_INVALID_MEDIA_TYPE",
      ].includes(frameworkCode)
    ) {
      status = 400
      code = "INVALID_INPUT"
      message = "Invalid request"
    }
    return reply
      .code(status)
      .send({ error: { code, message }, requestId: request.id })
  })
  app.get("/openapi.json", async () => openapi)
  app.register(async (user) => {
    const accounts = new WeakMap<
      object,
      Awaited<ReturnType<ConversationStore["provisionAccount"]>>
    >()
    user.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store")
      const subject = await authenticateBearer(
        request.headers.authorization,
        auth
      )
      accounts.set(request, await store.provisionAccount(subject))
    })
    const accountId = (request: object) => {
      const account = accounts.get(request)
      if (!account) throw new AuthenticationError()
      return account.id
    }
    user.get("/v1/me", async (request) => {
      const account = accounts.get(request)
      if (!account) throw new AuthenticationError()
      return {
        id: account.id,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      }
    })
    user.post("/v1/conversations", async (request, reply) => {
      object(request.query, [])
      const body = object(request.body === undefined ? {} : request.body, [
        "title",
      ])
      const conversation = await store.createConversation(
        accountId(request),
        body.title === undefined ? undefined : text(body.title, 120)
      )
      return reply
        .code(201)
        .header("location", `/v1/conversations/${conversation.id}`)
        .send(conversationProjection(conversation))
    })
    user.get("/v1/conversations", async (request) => {
      const page = await store.history.conversations(
        accountId(request),
        pageQuery(request.query, true)
      )
      return {
        items: page.items.map(conversationProjection),
        nextCursor: page.nextCursor,
      }
    })
    user.get("/v1/conversations/:id", async (request) => {
      object(request.query, [])
      const id = uuid(object(request.params, ["id"]).id)
      const conversation = await store.getConversation(accountId(request), id)
      return {
        ...conversationProjection(conversation),
        activeOperation: await store.commands.activeOperation(
          accountId(request),
          id
        ),
      }
    })
    user.patch("/v1/conversations/:id", async (request) => {
      object(request.query, [])
      const id = uuid(object(request.params, ["id"]).id)
      const body = object(request.body, ["title", "status"])
      if (
        !Object.keys(body).length ||
        (body.status !== undefined &&
          body.status !== "active" &&
          body.status !== "archived")
      )
        throw new InvalidInput()
      return conversationProjection(
        await store.updateConversation(accountId(request), id, {
          title: body.title === undefined ? undefined : text(body.title, 120),
          status: body.status as "active" | "archived" | undefined,
        })
      )
    })
    user.delete("/v1/conversations/:id", async (request, reply) => {
      object(request.query, [])
      if (request.body !== undefined) throw new InvalidInput()
      const id = uuid(object(request.params, ["id"]).id)
      await store.updateConversation(accountId(request), id, {
        status: "deleted",
      })
      return reply.code(204).send()
    })
    user.get("/v1/conversations/:id/messages", async (request) => {
      const id = uuid(object(request.params, ["id"]).id)
      const page = await store.history.messages(
        accountId(request),
        id,
        pageQuery(request.query)
      )
      return {
        items: page.items.map(messageProjection),
        nextCursor: page.nextCursor,
      }
    })
    user.post("/v1/conversations/:id/messages", async (request, reply) => {
      object(request.query, [])
      const id = uuid(object(request.params, ["id"]).id)
      const body = object(request.body, ["clientRequestId", "content"])
      return reply
        .code(202)
        .send(
          await store.commands.submitText(
            accountId(request),
            id,
            uuid(body.clientRequestId),
            text(body.content, 16000),
            correlation(request.id, request.headers)
          )
        )
    })
    user.post(
      "/v1/conversations/:id/operations/:operationId/retry",
      async (request, reply) => {
        object(request.query, [])
        const params = object(request.params, ["id", "operationId"])
        const body = object(request.body, ["clientRequestId"])
        return reply
          .code(202)
          .send(
            await store.commands.retry(
              accountId(request),
              uuid(params.id),
              uuid(params.operationId),
              uuid(body.clientRequestId),
              correlation(request.id, request.headers)
            )
          )
      }
    )
  })
  return app
}
