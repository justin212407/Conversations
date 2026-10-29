import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import type { Transaction } from "./access.js"
import { conversations, handoffs } from "./schema.js"
import {
  domainEventSchema,
  type DomainEvent,
  type MessageData,
  type RequestCorrelation,
} from "@conversations/shared"
import type { Message } from "./store.js"

export function messageData(message: Message): MessageData {
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
  }
}

/** Called only inside the same transaction as its authoritative mutation. */
export async function appendEvent<Type extends DomainEvent["type"]>(
  tx: Transaction,
  conversationId: string,
  type: Type,
  payload: Extract<DomainEvent, { type: Type }>["payload"],
  correlation?: RequestCorrelation
) {
  const [counter] = await tx
    .update(conversations)
    .set({ nextEventSequence: sql`${conversations.nextEventSequence} + 1` })
    .where(eq(conversations.id, conversationId))
    .returning({ sequence: conversations.nextEventSequence })
  if (!counter) throw new Error("Event sequence allocation failed")
  const id = randomUUID()
  const occurredAt = new Date().toISOString()
  const event = domainEventSchema.parse({
    version: 1,
    eventId: id,
    type,
    conversationId,
    sequence: counter.sequence,
    occurredAt,
    payload,
    ...(correlation ? { correlation } : {}),
  })
  await tx.insert(handoffs).values({
    id,
    conversationId,
    kind: "event",
    sequence: counter.sequence,
    type,
    payload: event,
  })
}
