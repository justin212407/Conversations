import { and, asc, eq, ne, sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"
import * as schema from "./schema.js"

type Database = NodePgDatabase<typeof schema>
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type Account = typeof schema.accounts.$inferSelect
export type Conversation = typeof schema.conversations.$inferSelect
export type Message = typeof schema.messages.$inferSelect
export type NewMessage = Pick<
  Message,
  "role" | "modality" | "content" | "state"
> & { id?: string }

export class ResourceNotFound extends Error {
  constructor() {
    super("Resource not found")
  }
}
export class ConversationConflict extends Error {
  constructor() {
    super("Conversation is not active")
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** All public data methods scope resources to an internal, authenticated account. */
export class ConversationStore {
  private readonly db: Database
  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema })
  }

  async provisionAccount(clerkSubject: string): Promise<Account> {
    if (
      !/^user_[A-Za-z0-9_-]+$/.test(clerkSubject) ||
      clerkSubject.length > 255
    )
      throw new Error("Invalid verified subject")
    const [account] = await this.db
      .insert(schema.accounts)
      .values({ clerkSubject })
      .onConflictDoUpdate({
        target: schema.accounts.clerkSubject,
        set: { clerkSubject },
      })
      .returning()
    if (!account) throw new Error("Account provisioning failed")
    return account
  }

  async createConversation(
    accountId: string,
    title = "New conversation"
  ): Promise<Conversation> {
    if (!title.trim() || title.length > 120)
      throw new Error("Invalid conversation title")
    const [conversation] = await this.db
      .insert(schema.conversations)
      .values({ accountId, title })
      .returning()
    if (!conversation) throw new Error("Conversation creation failed")
    return conversation
  }

  private async withConversation<T>(
    accountId: string,
    conversationId: string,
    run: (tx: Transaction, conversation: Conversation) => Promise<T>
  ): Promise<T> {
    if (!uuid.test(accountId) || !uuid.test(conversationId))
      throw new ResourceNotFound()
    return this.db.transaction(async (tx) => {
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

  async getConversation(
    accountId: string,
    conversationId: string
  ): Promise<Conversation> {
    return this.withConversation(
      accountId,
      conversationId,
      async (_tx, conversation) => conversation
    )
  }

  /** Used by API ticket issuance; it is not a client-selected subscription scope. */
  async authorizeSubscription(accountId: string, conversationId: string) {
    const conversation = await this.getConversation(accountId, conversationId)
    return {
      accountId: conversation.accountId,
      conversationId: conversation.id,
    }
  }

  async updateConversation(
    accountId: string,
    conversationId: string,
    patch: { title?: string; status?: Conversation["status"] }
  ): Promise<Conversation> {
    if (
      patch.title !== undefined &&
      (!patch.title.trim() || patch.title.length > 120)
    )
      throw new Error("Invalid conversation title")
    return this.withConversation(accountId, conversationId, async (tx) => {
      const [updated] = await tx
        .update(schema.conversations)
        .set({
          title: patch.title,
          status: patch.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        )
        .returning()
      if (!updated) throw new ResourceNotFound()
      return updated
    })
  }

  async appendMessages(
    accountId: string,
    conversationId: string,
    input: NewMessage[]
  ): Promise<Message[]> {
    if (input.length < 1 || input.length > 100)
      throw new Error("Invalid message batch")
    return this.withConversation(
      accountId,
      conversationId,
      async (tx, conversation) => {
        if (conversation.status !== "active") throw new ConversationConflict()
        const [counter] = await tx
          .update(schema.conversations)
          .set({
            nextMessageSequence: sql`${schema.conversations.nextMessageSequence} + ${input.length}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.conversations.id, conversationId))
          .returning({ end: schema.conversations.nextMessageSequence })
        if (!counter) throw new ResourceNotFound()
        return tx
          .insert(schema.messages)
          .values(
            input.map((message, index) => ({
              id: message.id,
              role: message.role,
              modality: message.modality,
              content: message.content,
              state: message.state,
              conversationId,
              sequence: counter.end - input.length + index + 1,
            }))
          )
          .returning()
      }
    )
  }

  async getMessage(
    accountId: string,
    conversationId: string,
    messageId: string
  ): Promise<Message> {
    if (!uuid.test(messageId)) throw new ResourceNotFound()
    return this.withConversation(accountId, conversationId, async (tx) => {
      const [message] = await tx
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.id, messageId),
            eq(schema.messages.conversationId, conversationId)
          )
        )
      if (!message) throw new ResourceNotFound()
      return message
    })
  }

  async listMessages(
    accountId: string,
    conversationId: string
  ): Promise<Message[]> {
    return this.withConversation(accountId, conversationId, async (tx) =>
      tx
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(asc(schema.messages.sequence))
        .limit(100)
    )
  }

  async updateMessage(
    accountId: string,
    conversationId: string,
    messageId: string,
    patch: Pick<Message, "content" | "state">
  ): Promise<Message> {
    if (!uuid.test(messageId)) throw new ResourceNotFound()
    return this.withConversation(accountId, conversationId, async (tx) => {
      const [message] = await tx
        .update(schema.messages)
        .set({
          content: patch.content,
          state: patch.state,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.messages.id, messageId),
            eq(schema.messages.conversationId, conversationId)
          )
        )
        .returning()
      if (!message) throw new ResourceNotFound()
      return message
    })
  }
}
