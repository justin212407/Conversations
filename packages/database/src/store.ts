import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"
import * as schema from "./schema.js"
import { withOwnedConversation } from "./access.js"
import {
  ConversationCommands,
  appendMessages as insertMessages,
} from "./commands.js"
import { ConversationHistory } from "./history.js"
import { DurableHandoff } from "./handoff.js"
import { appendEvent, messageData } from "./events.js"
import {
  ResourceNotFound,
  ConversationConflict,
  InvalidInput,
  InputLimitExceeded,
  isUuid,
} from "./errors.js"
export { ResourceNotFound, ConversationConflict } from "./errors.js"

type Database = NodePgDatabase<typeof schema>
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type Account = typeof schema.accounts.$inferSelect
export type Conversation = typeof schema.conversations.$inferSelect
export type Message = typeof schema.messages.$inferSelect
export type NewMessage = Pick<
  Message,
  "role" | "modality" | "content" | "state"
> & { id?: string }

/** All public data methods scope resources to an internal, authenticated account. */
export class ConversationStore {
  private readonly db: Database
  readonly commands: ConversationCommands
  readonly history: ConversationHistory
  readonly handoff: DurableHandoff
  constructor(pool: Pool) {
    this.db = drizzle(pool, { schema })
    this.commands = new ConversationCommands(this.db)
    this.history = new ConversationHistory(this.db)
    this.handoff = new DurableHandoff(this.db)
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
    if (typeof title !== "string" || !title.trim() || title.includes("\u0000"))
      throw new InvalidInput()
    if ([...title].length > 120) throw new InputLimitExceeded()
    return this.db.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(schema.conversations)
        .values({ accountId, title })
        .returning()
      if (!conversation) throw new Error("Conversation creation failed")
      await appendEvent(tx, conversation.id, "conversation.created", {
        conversationId: conversation.id,
      })
      return conversation
    })
  }

  private async withConversation<T>(
    accountId: string,
    conversationId: string,
    run: (tx: Transaction, conversation: Conversation) => Promise<T>
  ): Promise<T> {
    return withOwnedConversation(this.db, accountId, conversationId, run)
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
    if (patch.title !== undefined) {
      if (
        typeof patch.title !== "string" ||
        !patch.title.trim() ||
        patch.title.includes("\u0000")
      )
        throw new InvalidInput()
      if ([...patch.title].length > 120) throw new InputLimitExceeded()
    }
    if (
      patch.status !== undefined &&
      !["active", "archived", "deleted"].includes(patch.status)
    )
      throw new InvalidInput()
    return this.withConversation(accountId, conversationId, async (tx) => {
      const busy = await tx
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.conversationId, conversationId),
            inArray(schema.operations.status, ["pending", "running"])
          )
        )
        .limit(1)
      if (busy.length) throw new ConversationConflict()
      const [updated] = await tx
        .update(schema.conversations)
        .set({
          title: patch.title,
          status: patch.status,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(schema.conversations.id, conversationId),
            eq(schema.conversations.accountId, accountId)
          )
        )
        .returning()
      if (!updated) throw new ResourceNotFound()
      await appendEvent(
        tx,
        conversationId,
        updated.status === "deleted"
          ? "conversation.deleted"
          : "conversation.updated",
        { conversationId, title: updated.title, status: updated.status }
      )
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
        const busy = await tx
          .select({ id: schema.operations.id })
          .from(schema.operations)
          .where(
            and(
              eq(schema.operations.conversationId, conversationId),
              inArray(schema.operations.status, ["pending", "running"])
            )
          )
          .limit(1)
        if (busy.length) throw new ConversationConflict()
        return insertMessages(tx, conversationId, input)
      }
    )
  }

  async getMessage(
    accountId: string,
    conversationId: string,
    messageId: string
  ): Promise<Message> {
    if (!isUuid(messageId)) throw new ResourceNotFound()
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
    if (!isUuid(messageId)) throw new ResourceNotFound()
    return this.withConversation(accountId, conversationId, async (tx) => {
      const managed = await tx
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.conversationId, conversationId),
            or(
              eq(schema.operations.inputMessageId, messageId),
              eq(schema.operations.assistantMessageId, messageId)
            )
          )
        )
        .limit(1)
      const finalized = await tx
        .select({ id: schema.finalizedDeliveries.id })
        .from(schema.finalizedDeliveries)
        .where(
          and(
            eq(schema.finalizedDeliveries.conversationId, conversationId),
            eq(schema.finalizedDeliveries.messageId, messageId)
          )
        )
        .limit(1)
      if (managed.length || finalized.length) throw new ConversationConflict()
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
      const type =
        message.state === "pending" || message.state === "streaming"
          ? "message.created"
          : (`message.${message.state}` as const)
      await appendEvent(tx, conversationId, type, {
        message: messageData(message),
      })
      return message
    })
  }
}
