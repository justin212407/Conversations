const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const uuid = { type: "string", format: "uuid" }
const failureCode = {
  type: ["string", "null"],
  enum: [
    null,
    "provider_unavailable",
    "provider_error",
    "timeout",
    "context_limit",
    "output_limit",
    "interrupted",
    "expired",
  ],
}
const timestamp = { type: "string", format: "date-time" }
const exampleId = "a0000000-0000-4000-8000-000000000001"
const exampleConversation = {
  id: exampleId,
  title: "Debug the parser",
  status: "active",
  createdAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
}
const schemaExamples: Record<string, unknown> = {
  Account: {
    id: exampleId,
    createdAt: exampleConversation.createdAt,
    updatedAt: exampleConversation.updatedAt,
  },
  Conversation: exampleConversation,
  ConversationPage: { items: [exampleConversation], nextCursor: null },
  MessagePage: {
    items: [
      {
        id: "a0000000-0000-4000-8000-000000000003",
        conversationId: exampleId,
        sequence: 1,
        role: "user",
        modality: "text",
        content: "Explain this parser",
        state: "completed",
        createdAt: exampleConversation.createdAt,
        updatedAt: exampleConversation.updatedAt,
        operationId: null,
        failureCode: null,
      },
    ],
    nextCursor: null,
  },
  Admission: {
    operationId: "a0000000-0000-4000-8000-000000000002",
    conversationId: exampleId,
    userMessageId: "a0000000-0000-4000-8000-000000000003",
    assistantMessageId: "a0000000-0000-4000-8000-000000000004",
    status: "pending",
    expiresAt: "2026-10-29T00:05:00.000Z",
    failureCode: null,
  },
  Health: {
    service: "api",
    status: "ready",
    checks: { postgres: "up", redis: "up", schema: "up" },
  },
}
const json = (schema: unknown, example?: unknown) => ({
  "application/json": { schema, ...(example === undefined ? {} : { example }) },
})
const response = (description: string, schema: unknown, example?: unknown) => {
  const name =
    schema &&
    typeof schema === "object" &&
    "$ref" in schema &&
    typeof schema.$ref === "string"
      ? schema.$ref.split("/").at(-1)
      : undefined
  return {
    description,
    content: json(schema, example ?? (name ? schemaExamples[name] : undefined)),
  }
}
const errors = Object.fromEntries(
  [400, 401, 404, 409, 413, 503].map((code) => [
    String(code),
    response(
      (
        {
          400: "Invalid request or cursor",
          401: "Missing or invalid Clerk session",
          404: "Missing, deleted, or inaccessible resource",
          409: "State or idempotency conflict",
          413: "Input limit exceeded",
          503: "Authentication or persistence unavailable",
        } as Record<number, string>
      )[code]!,
      ref("Error"),
      {
        error: {
          code: (
            {
              400: "INVALID_INPUT",
              401: "UNAUTHORIZED",
              404: "NOT_FOUND",
              409: "CONFLICT",
              413: "INPUT_LIMIT_EXCEEDED",
              503: "DEPENDENCY_UNAVAILABLE",
            } as Record<number, string>
          )[code],
          message: "Request could not be completed",
        },
        requestId: "req-example",
      }
    ),
  ])
)
const parameter = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: uuid,
})
const pagination = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "cursor",
    in: "query",
    description:
      "Opaque cursor scoped to this resource/filter. Message pages return ascending items and a cursor for older history.",
    schema: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      pattern: "^[A-Za-z0-9_-]+$",
    },
  },
]
const secure = { security: [{ ClerkBearer: [] }] }
const request = (schema: unknown, example: unknown, required = true) => ({
  required,
  content: json(schema, example),
})
const closed = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
})
const title = {
  type: "string",
  minLength: 1,
  maxLength: 120,
  pattern: "\\S",
  not: { pattern: "\\u0000" },
}
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Conversations API",
    version: "1.0.0",
    description:
      "Durable personal conversations and asynchronous text generation. Accepted operations execute through the separate worker; sockets and voice orchestration remain planned.",
  },
  paths: {
    "/openapi.json": {
      get: {
        operationId: "getOpenApi",
        responses: { "200": response("This API document", { type: "object" }) },
      },
    },
    "/health/live": {
      get: {
        operationId: "getLiveness",
        responses: {
          "200": response("Process alive", ref("Health"), {
            service: "api",
            status: "alive",
          }),
        },
      },
    },
    "/health/ready": {
      get: {
        operationId: "getReadiness",
        responses: {
          "200": response(
            "Dependencies and migrations available",
            ref("Health")
          ),
          "503": response(
            "Dependency/schema unavailable or shutting down",
            ref("Health")
          ),
        },
      },
    },
    "/v1/me": {
      get: {
        ...secure,
        operationId: "getAccount",
        responses: {
          ...errors,
          "200": response("Internal account", ref("Account"), {
            id: exampleId,
            createdAt: "2026-10-29T00:00:00.000Z",
            updatedAt: "2026-10-29T00:00:00.000Z",
          }),
        },
      },
    },
    "/v1/conversations": {
      post: {
        ...secure,
        operationId: "createConversation",
        requestBody: request(
          closed({ title }, []),
          { title: "Debug the parser" },
          false
        ),
        responses: {
          ...errors,
          "201": response("Created", ref("Conversation"), exampleConversation),
        },
      },
      get: {
        ...secure,
        operationId: "listConversations",
        parameters: [
          ...pagination,
          {
            name: "status",
            in: "query",
            schema: { type: "string", enum: ["active", "archived"] },
          },
        ],
        responses: {
          ...errors,
          "200": response(
            "Updated timestamp and ID descending; deleted omitted",
            ref("ConversationPage"),
            { items: [exampleConversation], nextCursor: null }
          ),
        },
      },
    },
    "/v1/conversations/{id}": {
      parameters: [parameter("id")],
      get: {
        ...secure,
        operationId: "getConversation",
        responses: {
          ...errors,
          "200": response(
            "Owned conversation and active admission",
            ref("Conversation"),
            { ...exampleConversation, activeOperation: null }
          ),
        },
      },
      patch: {
        ...secure,
        operationId: "updateConversation",
        requestBody: request(
          {
            ...closed(
              {
                title,
                status: { type: "string", enum: ["active", "archived"] },
              },
              []
            ),
            minProperties: 1,
          },
          { status: "archived" }
        ),
        responses: {
          ...errors,
          "200": response(
            "Updated; active operations conflict",
            ref("Conversation")
          ),
        },
      },
      delete: {
        ...secure,
        operationId: "deleteConversation",
        responses: {
          ...errors,
          "204": {
            description:
              "Soft deleted; active operations conflict. No response body.",
          },
        },
      },
    },
    "/v1/conversations/{id}/messages": {
      parameters: [parameter("id")],
      get: {
        ...secure,
        operationId: "getMessages",
        parameters: pagination,
        responses: {
          ...errors,
          "200": response(
            "Latest page ascending by sequence; nextCursor retrieves older history",
            ref("MessagePage")
          ),
        },
      },
      post: {
        ...secure,
        operationId: "submitText",
        description:
          "Context includes all completed history through this input, including voice. More than100 messages or64000 Unicode code points returns413 before admission; history is never silently truncated.",
        requestBody: request(
          closed(
            {
              clientRequestId: uuid,
              content: {
                type: "string",
                minLength: 1,
                maxLength: 16000,
                not: { pattern: "\\u0000" },
                pattern: "\\S",
              },
            },
            ["clientRequestId", "content"]
          ),
          {
            clientRequestId: exampleId,
            content: "Why does this parser reject the second token?",
          }
        ),
        responses: {
          ...errors,
          "202": response(
            "Persisted operation/messages and durable handoff; exact replay returns original identities",
            ref("Admission"),
            {
              operationId: exampleId,
              conversationId: exampleId,
              userMessageId: exampleId,
              assistantMessageId: "a0000000-0000-4000-8000-000000000002",
              status: "pending",
              expiresAt: "2026-10-29T00:05:00.000Z",
              failureCode: null,
            }
          ),
        },
      },
    },
    "/v1/conversations/{id}/operations/{operationId}/retry": {
      parameters: [parameter("id"), parameter("operationId")],
      post: {
        ...secure,
        operationId: "retryOperation",
        description:
          "Retry failed/interrupted text operations with a new request ID and assistant message, reusing the user turn. Expired pending/running operations are interrupted atomically before retry; non-expired active operations conflict.",
        requestBody: request(
          closed({ clientRequestId: uuid }, ["clientRequestId"]),
          { clientRequestId: exampleId }
        ),
        responses: {
          ...errors,
          "202": response(
            "Durably accepted controlled retry",
            ref("Admission")
          ),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ClerkBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Clerk session JWT",
      },
    },
    schemas: {
      Error: closed(
        {
          error: closed(
            { code: { type: "string" }, message: { type: "string" } },
            ["code", "message"]
          ),
          requestId: { type: "string" },
        },
        ["error", "requestId"]
      ),
      Account: closed(
        { id: uuid, createdAt: timestamp, updatedAt: timestamp },
        ["id", "createdAt", "updatedAt"]
      ),
      Health: closed(
        {
          service: { type: "string", enum: ["api", "worker", "realtime"] },
          status: { type: "string", enum: ["alive", "ready", "not_ready"] },
          checks: {
            type: "object",
            additionalProperties: { type: "string", enum: ["up", "down"] },
          },
        },
        ["service", "status"]
      ),
      Conversation: closed(
        {
          id: uuid,
          title,
          status: { type: "string", enum: ["active", "archived"] },
          createdAt: timestamp,
          updatedAt: timestamp,
          activeOperation: { anyOf: [ref("Admission"), { type: "null" }] },
        },
        ["id", "title", "status", "createdAt", "updatedAt"]
      ),
      Message: closed(
        {
          id: uuid,
          conversationId: uuid,
          sequence: { type: "integer", minimum: 1 },
          role: { type: "string", enum: ["user", "assistant"] },
          modality: { type: "string", enum: ["text", "voice"] },
          content: { type: "string" },
          operationId: { anyOf: [uuid, { type: "null" }] },
          failureCode,
          state: {
            type: "string",
            enum: [
              "pending",
              "streaming",
              "completed",
              "failed",
              "interrupted",
            ],
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        [
          "id",
          "conversationId",
          "sequence",
          "role",
          "modality",
          "content",
          "state",
          "createdAt",
          "updatedAt",
          "operationId",
          "failureCode",
        ]
      ),
      Admission: closed(
        {
          operationId: uuid,
          conversationId: uuid,
          userMessageId: uuid,
          assistantMessageId: uuid,
          status: {
            type: "string",
            enum: ["pending", "running", "completed", "failed", "interrupted"],
          },
          expiresAt: timestamp,
          failureCode,
        },
        [
          "operationId",
          "conversationId",
          "userMessageId",
          "assistantMessageId",
          "status",
          "expiresAt",
          "failureCode",
        ]
      ),
      ConversationPage: closed(
        {
          items: { type: "array", items: ref("Conversation") },
          nextCursor: { type: ["string", "null"] },
        },
        ["items", "nextCursor"]
      ),
      MessagePage: closed(
        {
          items: { type: "array", items: ref("Message") },
          nextCursor: { type: ["string", "null"] },
        },
        ["items", "nextCursor"]
      ),
    },
  },
}
