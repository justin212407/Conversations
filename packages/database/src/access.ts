import { and, eq, ne } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import * as schema from "./schema.js"
import { isUuid, ResourceNotFound } from "./errors.js"

export type Database = NodePgDatabase<typeof schema>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type Conversation = typeof schema.conversations.$inferSelect

export async function withOwnedConversation<T>(
  db: Database,
  accountId: string,
  conversationId: string,
  run: (tx: Transaction, conversation: Conversation) => Promise<T>
): Promise<T> {
  if (!isUuid(accountId) || !isUuid(conversationId))
    throw new ResourceNotFound()
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.accountId, accountId),
          ne(schema.conversations.status, "deleted")
        )
      )
      .for("update")
    if (!conversation) throw new ResourceNotFound()
    return run(tx, conversation)
  })
}
