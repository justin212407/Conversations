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

// Common application envelope; concrete domain payloads arrive with their routes.
export interface EventEnvelope<Type extends string, Payload> {
  version: 1
  eventId: string
  type: Type
  conversationId: string
  sequence: number
  occurredAt: string
  payload: Payload
}
