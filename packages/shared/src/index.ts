import { z } from "zod"

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
    probeId: z.string().uuid(),
    sentAt: z.string().datetime(),
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
export const textGenerationJobSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    accountId: z.string().uuid(),
    conversationId: z.string().uuid(),
    inputMessageId: z.string().uuid(),
    correlation: z.object({ requestId: z.string().min(1).max(255) }).strict(),
  })
  .strict()
export type TextGenerationJob = z.infer<typeof textGenerationJobSchema>

export const messageDataSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    sequence: z.number().int().positive(),
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
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type MessageData = z.infer<typeof messageDataSchema>
export const operationAdmissionSchema = z
  .object({
    operationId: z.string().uuid(),
    conversationId: z.string().uuid(),
    userMessageId: z.string().uuid().nullable(),
    assistantMessageId: z.string().uuid().nullable(),
    status: z.enum([
      "pending",
      "running",
      "completed",
      "failed",
      "interrupted",
    ]),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type OperationAdmission = z.infer<typeof operationAdmissionSchema>

const envelope = z
  .object({
    version: z.literal(1),
    eventId: z.string().uuid(),
    conversationId: z.string().uuid(),
    sequence: z.number().int().positive(),
    occurredAt: z.string().datetime(),
  })
  .strict()
const conversationPayload = z
  .object({
    conversationId: z.string().uuid(),
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
      payload: z.object({ conversationId: z.string().uuid() }).strict(),
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
