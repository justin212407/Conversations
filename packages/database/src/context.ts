import { and, asc, eq, lte } from "drizzle-orm"
import {
  contextWithinLimits,
  MAX_CONTEXT_MESSAGES,
} from "@conversations/shared"
import type { Transaction } from "./access.js"
import { InputLimitExceeded } from "./errors.js"
import { messages } from "./schema.js"

export async function completedContext(
  tx: Transaction,
  conversationId: string,
  cutoff?: number,
  additionalInput?: string
) {
  const context = await tx
    .select({
      id: messages.id,
      sequence: messages.sequence,
      role: messages.role,
      modality: messages.modality,
      content: messages.content,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.state, "completed"),
        cutoff === undefined ? undefined : lte(messages.sequence, cutoff)
      )
    )
    .orderBy(asc(messages.sequence))
    .limit(MAX_CONTEXT_MESSAGES + 1)
  const bounded =
    additionalInput === undefined
      ? context
      : [...context, { content: additionalInput }]
  if (!contextWithinLimits(bounded)) throw new InputLimitExceeded()
  return context
}
