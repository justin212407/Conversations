import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
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
    uniqueIndex("messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence
    ),
    check("messages_sequence_positive", sql`${table.sequence} > 0`),
  ]
)
