import { sql } from "drizzle-orm"
import {
  check,
  index,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkSubject: text("clerk_subject").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "accounts_subject_nonempty",
      sql`char_length(${table.clerkSubject}) between 1 and 255`
    ),
  ]
)

export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "archived",
  "deleted",
])
export const messageRole = pgEnum("message_role", ["user", "assistant"])
export const messageModality = pgEnum("message_modality", ["text", "voice"])
export const messageState = pgEnum("message_state", [
  "pending",
  "streaming",
  "completed",
  "failed",
  "interrupted",
])

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 120 }).notNull(),
    status: conversationStatus("status").notNull().default("active"),
    nextMessageSequence: integer("next_message_sequence").notNull().default(0),
    nextEventSequence: integer("next_event_sequence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_id_account_idx").on(table.id, table.accountId),
    index("conversations_account_updated_idx").on(
      table.accountId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("conversations_account_status_idx").on(table.accountId, table.status),
    check(
      "conversations_title_nonempty",
      sql`char_length(trim(${table.title})) > 0`
    ),
    check(
      "conversations_sequence_nonnegative",
      sql`${table.nextMessageSequence} >= 0`
    ),
    check(
      "conversations_event_sequence_nonnegative",
      sql`${table.nextEventSequence} >= 0`
    ),
  ]
)

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    role: messageRole("role").notNull(),
    modality: messageModality("modality").notNull(),
    content: text("content").notNull(),
    state: messageState("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("messages_id_conversation_idx").on(
      table.id,
      table.conversationId
    ),
    uniqueIndex("messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence
    ),
    check("messages_sequence_positive", sql`${table.sequence} > 0`),
  ]
)

export const operationState = pgEnum("operation_state", [
  "pending",
  "running",
  "completed",
  "failed",
  "interrupted",
])
export const operationKind = pgEnum("operation_kind", ["text", "voice"])
export const operations = pgTable(
  "operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    kind: operationKind("kind").notNull(),
    status: operationState("status").notNull().default("pending"),
    inputMessageId: uuid("input_message_id"),
    assistantMessageId: uuid("assistant_message_id"),
    retryOf: uuid("retry_of").references((): AnyPgColumn => operations.id, {
      onDelete: "restrict",
    }),
    executionToken: uuid("execution_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resultHash: text("result_hash"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("operations_account_request_idx").on(
      table.accountId,
      table.clientRequestId
    ),
    uniqueIndex("operations_one_active_idx")
      .on(table.conversationId)
      .where(sql`${table.status} in ('pending', 'running')`),
    foreignKey({
      columns: [table.conversationId, table.accountId],
      foreignColumns: [conversations.id, conversations.accountId],
    }),
    foreignKey({
      columns: [table.inputMessageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }),
    foreignKey({
      columns: [table.assistantMessageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }),
    check(
      "operations_text_messages",
      sql`${table.kind} <> 'text' OR (${table.inputMessageId} IS NOT NULL AND ${table.assistantMessageId} IS NOT NULL AND ${table.inputMessageId} <> ${table.assistantMessageId})`
    ),
  ]
)

export const handoffKind = pgEnum("handoff_kind", ["job", "event"])
export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "restrict" }),
    operationId: uuid("operation_id").references(() => operations.id, {
      onDelete: "restrict",
    }),
    kind: handoffKind("kind").notNull(),
    sequence: integer("sequence"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("handoffs_event_sequence_idx")
      .on(table.conversationId, table.sequence)
      .where(sql`${table.kind} = 'event'`),
    uniqueIndex("handoffs_operation_job_idx")
      .on(table.operationId)
      .where(sql`${table.kind} = 'job'`),
    index("handoffs_pending_idx")
      .on(table.kind, table.createdAt)
      .where(
        sql`${table.deliveredAt} IS NULL AND ${table.cancelledAt} IS NULL`
      ),
    check(
      "handoffs_kind_shape",
      sql`(${table.kind} = 'event' AND ${table.sequence} IS NOT NULL AND ${table.sequence} > 0) OR (${table.kind} = 'job' AND ${table.sequence} IS NULL AND ${table.operationId} IS NOT NULL)`
    ),
    check(
      "handoffs_lease_shape",
      sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`
    ),
  ]
)

export const finalizedDeliveries = pgTable(
  "finalized_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    messageId: uuid("message_id").notNull(),
  },
  (table) => [
    uniqueIndex("finalized_deliveries_identity_idx").on(
      table.conversationId,
      table.deliveryId
    ),
    foreignKey({
      columns: [table.messageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }),
  ]
)
