import { randomUUID } from "node:crypto"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"
import type { Database } from "./access.js"
import { alias } from "drizzle-orm/pg-core"
import { InvalidInput, isUuid } from "./errors.js"
import { handoffs } from "./schema.js"

/** Trusted server relay interface. Delivery remains at-least-once by stable ID. */
export class DurableHandoff {
  constructor(private readonly db: Database) {}

  async claim(
    kind: "job" | "event",
    options: { limit?: number; leaseMs?: number } = {}
  ) {
    const limit = options.limit ?? 50
    const leaseMs = options.leaseMs ?? 30000
    if (
      !["job", "event"].includes(kind) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(leaseMs) ||
      leaseMs < 1000 ||
      leaseMs > 60000
    )
      throw new InvalidInput()
    return this.db.transaction(async (tx) => {
      const earlier = alias(handoffs, "earlier_handoff")
      const firstEvent =
        kind === "event"
          ? sql`NOT EXISTS (SELECT 1 FROM ${handoffs} AS ${sql.identifier("earlier_handoff")} WHERE ${earlier.kind} = 'event' AND ${earlier.conversationId} = ${handoffs.conversationId} AND ${earlier.sequence} < ${handoffs.sequence} AND ${earlier.deliveredAt} IS NULL AND ${earlier.cancelledAt} IS NULL)`
          : undefined
      const pending = await tx
        .select()
        .from(handoffs)
        .where(
          and(
            eq(handoffs.kind, kind),
            isNull(handoffs.deliveredAt),
            isNull(handoffs.cancelledAt),
            firstEvent,
            or(
              isNull(handoffs.leaseExpiresAt),
              lte(handoffs.leaseExpiresAt, sql`clock_timestamp()`)
            )
          )
        )
        .orderBy(asc(handoffs.createdAt), asc(handoffs.id))
        .limit(limit)
        .for("update", { skipLocked: true })
      const claimed = []
      for (const item of pending) {
        const [row] = await tx
          .update(handoffs)
          .set({
            leaseToken: randomUUID(),
            leaseExpiresAt: sql`clock_timestamp() + ${leaseMs} * interval '1 millisecond'`,
          })
          .where(eq(handoffs.id, item.id))
          .returning()
        if (row) claimed.push(row)
      }
      return claimed
    })
  }

  async acknowledge(id: string, leaseToken: string): Promise<boolean> {
    if (!isUuid(id) || !isUuid(leaseToken)) throw new InvalidInput()
    const rows = await this.db
      .update(handoffs)
      .set({
        deliveredAt: sql`clock_timestamp()`,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(handoffs.id, id),
          eq(handoffs.leaseToken, leaseToken),
          sql`${handoffs.leaseExpiresAt} > clock_timestamp()`,
          isNull(handoffs.deliveredAt),
          isNull(handoffs.cancelledAt)
        )
      )
      .returning({ id: handoffs.id })
    return rows.length === 1
  }
}
