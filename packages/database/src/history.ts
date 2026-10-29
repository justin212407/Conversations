import { createHash } from "node:crypto"
import { and, desc, eq, lt, ne, sql } from "drizzle-orm"
import { getTableColumns } from "drizzle-orm"
import type { Database } from "./access.js"
import { withOwnedConversation } from "./access.js"
import { InvalidInput, isUuid } from "./errors.js"
import { conversations, messages, operations } from "./schema.js"

const encode = (value: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")
const scope = (accountId: string) =>
  createHash("sha256").update(accountId.toLowerCase()).digest("hex")
function decode(value: string): Record<string, unknown> {
  try {
    if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error()
    const text = Buffer.from(value, "base64url").toString("utf8")
    const result = JSON.parse(text)
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      result.v !== 1 ||
      encode(result) !== value
    )
      throw new Error()
    return result
  } catch {
    throw new InvalidInput()
  }
}
function limit(value: number | undefined) {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < 1 || value > 100)
  )
    throw new InvalidInput()
  return value ?? 50
}

export class ConversationHistory {
  constructor(private readonly db: Database) {}

  async conversations(
    accountId: string,
    options: {
      limit?: number
      cursor?: string
      status?: "active" | "archived"
    } = {}
  ) {
    const count = limit(options.limit)
    if (
      options.status !== undefined &&
      !["active", "archived"].includes(options.status)
    )
      throw new InvalidInput()
    const filter = options.status ?? "all"
    let boundary
    if (options.cursor !== undefined) {
      const cursor = decode(options.cursor)
      if (
        Object.keys(cursor).sort().join() !== "filter,id,kind,scope,ts,v" ||
        cursor.kind !== "conversations" ||
        cursor.scope !== scope(accountId) ||
        cursor.filter !== filter ||
        !isUuid(cursor.id) ||
        typeof cursor.ts !== "string" ||
        !/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.ts) ||
        !Number.isFinite(Date.parse(cursor.ts)) ||
        new Date(Date.parse(cursor.ts)).toISOString() !==
          cursor.ts.slice(0, 23) + "Z"
      )
        throw new InvalidInput()
      boundary = sql`(${conversations.updatedAt}, ${conversations.id}) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`
    }
    const rows = await this.db
      .select({
        ...getTableColumns(conversations),
        cursorTimestamp: sql<string>`to_char(${conversations.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.accountId, accountId),
          ne(conversations.status, "deleted"),
          options.status ? eq(conversations.status, options.status) : undefined,
          boundary
        )
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(count + 1)
    const hasMore = rows.length > count
    const selected = rows.slice(0, count)
    const last = selected.at(-1)
    const nextCursor =
      hasMore && last
        ? encode({
            v: 1,
            kind: "conversations",
            scope: scope(accountId),
            filter,
            ts: last.cursorTimestamp,
            id: last.id,
          })
        : null
    return {
      items: selected.map(({ cursorTimestamp, ...conversation }) => {
        void cursorTimestamp
        return conversation
      }),
      nextCursor,
    }
  }

  async messages(
    accountId: string,
    conversationId: string,
    options: { limit?: number; cursor?: string } = {}
  ) {
    const count = limit(options.limit)
    let before: number | undefined
    if (options.cursor !== undefined) {
      const cursor = decode(options.cursor)
      if (
        Object.keys(cursor).sort().join() !==
          "before,conversationId,kind,scope,v" ||
        cursor.kind !== "messages" ||
        cursor.scope !== scope(accountId) ||
        cursor.conversationId !== conversationId.toLowerCase() ||
        typeof cursor.before !== "number" ||
        !Number.isInteger(cursor.before) ||
        cursor.before < 1 ||
        cursor.before > 2147483647
      )
        throw new InvalidInput()
      before = cursor.before
    }
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx) => {
        const rows = await tx
          .select({
            ...getTableColumns(messages),
            operationId: operations.id,
            failureCode: operations.failureCode,
          })
          .from(messages)
          .leftJoin(
            operations,
            and(
              eq(operations.conversationId, messages.conversationId),
              eq(operations.assistantMessageId, messages.id)
            )
          )
          .where(
            and(
              eq(messages.conversationId, conversationId),
              before ? lt(messages.sequence, before) : undefined
            )
          )
          .orderBy(desc(messages.sequence))
          .limit(count + 1)
        const selected = rows.slice(0, count)
        const last = selected.at(-1)
        const nextCursor =
          rows.length > count && last
            ? encode({
                v: 1,
                kind: "messages",
                scope: scope(accountId),
                conversationId: conversationId.toLowerCase(),
                before: last.sequence,
              })
            : null
        return { items: selected.reverse(), nextCursor }
      }
    )
  }
}
