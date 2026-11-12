import { z } from "zod"
import { uuidSchema, integerSchema, utcTimestampSchema } from "./validation.js"
export { uuidSchema, integerSchema, utcTimestampSchema } from "./validation.js"

export const serviceNameSchema = z.enum(["api", "worker", "realtime"])
export type ServiceName = z.infer<typeof serviceNameSchema>

export interface HealthReport {
  service: ServiceName
  status: "alive" | "ready" | "not_ready"
  checks?: Record<string, "up" | "down">
}

// Operational probe only. Conversation generation has its own queue/contract.
export const FOUNDATION_QUEUE = "conversations-foundation"
export const probeJobSchema = z
  .object({
    version: z.literal(1),
    probeId: uuidSchema,
    sentAt: utcTimestampSchema,
  })
  .strict()
export type ProbeJob = z.infer<typeof probeJobSchema>
export interface ProbeResult {
  probeId: string
  service: "worker"
}

// Common application envelope; concrete domain payloads are validated below.
export interface EventEnvelope<Type extends string, Payload> {
  version: 1
  eventId: string
  type: Type
  conversationId: string
  sequence: number
  occurredAt: string
  payload: Payload
}

export const TEXT_GENERATION_QUEUE = "conversations-text"
export const requestCorrelationSchema = z
  .object({
    requestId: z.string().min(1).max(255),
    traceparent: z
      .string()
      .regex(
        /^(?!ff)[0-9a-f]{2}-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/
      )
      .optional(),
    tracestate: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[\x20-\x7e]+$/)
      .optional(),
  })
  .strict()
export type RequestCorrelation = z.infer<typeof requestCorrelationSchema>
export const MAX_CONTEXT_MESSAGES = 100
export const MAX_CONTEXT_CHARACTERS = 64000
export const MAX_OUTPUT_CHARACTERS = 64000
export function contextWithinLimits(
  context: ReadonlyArray<{ content: string }>
): boolean {
  return (
    context.length <= MAX_CONTEXT_MESSAGES &&
    context.reduce(
      (total, message) => total + [...message.content].length,
      0
    ) <= MAX_CONTEXT_CHARACTERS
  )
}
export const generationFailureSchema = z.enum([
  "provider_unavailable",
  "provider_error",
  "timeout",
  "context_limit",
  "output_limit",
  "interrupted",
  "expired",
])
export type GenerationFailure = z.infer<typeof generationFailureSchema>
export const textGenerationJobSchema = z
  .object({
    version: z.literal(1),
    operationId: uuidSchema,
    accountId: uuidSchema,
    conversationId: uuidSchema,
    inputMessageId: uuidSchema,
    correlation: requestCorrelationSchema,
  })
  .strict()
export type TextGenerationJob = z.infer<typeof textGenerationJobSchema>

export const messageDataSchema = z
  .object({
    id: uuidSchema,
    conversationId: uuidSchema,
    sequence: integerSchema.positive(),
    role: z.enum(["user", "assistant"]),
    modality: z.enum(["text", "voice"]),
    content: z.string(),
    state: z.enum([
      "pending",
      "streaming",
      "completed",
      "failed",
      "interrupted",
    ]),
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    operationId: uuidSchema.nullable().optional(),
    failureCode: generationFailureSchema.nullable().optional(),
  })
  .strict()
export type MessageData = z.infer<typeof messageDataSchema>
export const operationAdmissionSchema = z
  .object({
    operationId: uuidSchema,
    conversationId: uuidSchema,
    userMessageId: uuidSchema.nullable(),
    assistantMessageId: uuidSchema.nullable(),
    status: z.enum([
      "pending",
      "running",
      "completed",
      "failed",
      "interrupted",
    ]),
    expiresAt: utcTimestampSchema,
    failureCode: generationFailureSchema.nullable().optional(),
  })
  .strict()
export type OperationAdmission = z.infer<typeof operationAdmissionSchema>

const envelope = z
  .object({
    version: z.literal(1),
    eventId: uuidSchema,
    conversationId: uuidSchema,
    sequence: integerSchema.positive(),
    occurredAt: utcTimestampSchema,
    correlation: requestCorrelationSchema.optional(),
  })
  .strict()
const conversationPayload = z
  .object({
    conversationId: uuidSchema,
    title: z.string().min(1),
    status: z.enum(["active", "archived", "deleted"]),
  })
  .strict()
const messagePayload = z.object({ message: messageDataSchema }).strict()
const operationPayload = z
  .object({ operation: operationAdmissionSchema })
  .strict()
export const domainEventSchema = z
  .discriminatedUnion("type", [
    envelope.extend({
      type: z.literal("conversation.created"),
      payload: z.object({ conversationId: uuidSchema }).strict(),
    }),
    envelope.extend({
      type: z.literal("conversation.updated"),
      payload: conversationPayload,
    }),
    envelope.extend({
      type: z.literal("conversation.deleted"),
      payload: conversationPayload,
    }),
    envelope.extend({
      type: z.literal("message.created"),
      payload: messagePayload,
    }),
    envelope.extend({
      type: z.literal("message.completed"),
      payload: messagePayload,
    }),
    envelope.extend({
      type: z.literal("message.failed"),
      payload: messagePayload,
    }),
    envelope.extend({
      type: z.literal("message.interrupted"),
      payload: messagePayload,
    }),
    envelope.extend({
      type: z.literal("operation.accepted"),
      payload: operationPayload,
    }),
    envelope.extend({
      type: z.literal("operation.completed"),
      payload: operationPayload,
    }),
    envelope.extend({
      type: z.literal("operation.failed"),
      payload: operationPayload,
    }),
    envelope.extend({
      type: z.literal("operation.interrupted"),
      payload: operationPayload,
    }),
  ])
  .superRefine((event, context) => {
    const payload = event.payload
    const nestedConversationId =
      "message" in payload
        ? payload.message.conversationId
        : "operation" in payload
          ? payload.operation.conversationId
          : payload.conversationId
    if (nestedConversationId !== event.conversationId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Event conversation identity mismatch",
      })
    for (const state of ["completed", "failed", "interrupted"] as const) {
      if (
        event.type === `message.${state}` &&
        "message" in payload &&
        payload.message.state !== state
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message event state mismatch",
        })
      if (
        event.type === `operation.${state}` &&
        "operation" in payload &&
        payload.operation.status !== state
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Operation event state mismatch",
        })
    }
  })
export type DomainEvent = z.infer<typeof domainEventSchema>

// sequence is an observed durable checkpoint, NOT a new conversation event.
// revision orders replaceable content for this public stream/message identity.
export const provisionalMessageSnapshotSchema = z
  .object({
    version: z.literal(1),
    eventId: uuidSchema,
    type: z.literal("message.snapshot"),
    conversationId: uuidSchema,
    sequence: integerSchema.nonnegative(),
    occurredAt: utcTimestampSchema,
    correlation: requestCorrelationSchema.optional(),
    payload: z
      .object({
        messageId: uuidSchema,
        operationId: uuidSchema,
        streamId: uuidSchema,
        revision: integerSchema.positive(),
        state: z.literal("streaming"),
        content: z
          .string()
          .refine((value) => [...value].length <= MAX_OUTPUT_CHARACTERS),
      })
      .strict(),
  })
  .strict()
export type ProvisionalMessageSnapshot = z.infer<
  typeof provisionalMessageSnapshotSchema
>
export const provisionalChannel = (conversationId: string) => {
  if (!uuidSchema.safeParse(conversationId).success)
    throw new Error("Invalid conversation identity")
  return "conversations:snapshots:" + conversationId.toLowerCase()
}

export const durableChannel = (conversationId: string) => {
  if (!uuidSchema.safeParse(conversationId).success)
    throw new Error("Invalid conversation identity")
  return "conversations:events:" + conversationId.toLowerCase()
}
export const MAX_REALTIME_FRAME_BYTES = 512 * 1024
export const MAX_REALTIME_BUFFER_BYTES = 2 * 1024 * 1024
export const realtimeClientControlSchema = z
  .object({ version: z.literal(1), type: z.enum(["subscribe", "unsubscribe"]) })
  .strict()
export const realtimeServerControlSchema = z
  .object({
    version: z.literal(1),
    type: z.enum(["connection.ready", "connection.unsubscribed"]),
    connectionId: uuidSchema,
    conversationId: uuidSchema,
    expiresAt: utcTimestampSchema,
  })
  .strict()
export const realtimeGrantSchema = z
  .object({
    connectionId: uuidSchema,
    accountId: uuidSchema,
    conversationId: uuidSchema,
    expiresAt: utcTimestampSchema,
  })
  .strict()
export const conversationSnapshotSchema = z
  .object({
    conversation: z
      .object({
        id: uuidSchema,
        title: z.string(),
        status: z.enum(["active", "archived"]),
        createdAt: utcTimestampSchema,
        updatedAt: utcTimestampSchema,
      })
      .strict(),
    activeOperation: operationAdmissionSchema.nullable(),
    messages: z
      .object({
        items: z.array(messageDataSchema),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    checkpoint: integerSchema.nonnegative(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    if (
      snapshot.messages.items.some(
        (message) => message.conversationId !== snapshot.conversation.id
      ) ||
      (snapshot.activeOperation &&
        snapshot.activeOperation.conversationId !== snapshot.conversation.id)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Snapshot scope mismatch",
      })
  })
export type ConversationSnapshot = z.infer<typeof conversationSnapshotSchema>
export {
  initialConversationState,
  applyConversationEvent,
  applyProvisionalSnapshot,
  reconcileConversation,
  disconnectConversation,
  reconnectDelay,
  createConversationConnection,
  type ConversationState,
} from "./realtime-client.js"
