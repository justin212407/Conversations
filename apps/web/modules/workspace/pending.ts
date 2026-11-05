import { z } from "zod"

export const pendingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      clientRequestId: z.string().uuid(),
      content: z
        .string()
        .refine(
          (value) =>
            !!value.trim() &&
            !value.includes("\u0000") &&
            [...value].length <= 16000
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("retry"),
      clientRequestId: z.string().uuid(),
      operationId: z.string().uuid(),
    })
    .strict(),
])
export type PendingIntent = z.infer<typeof pendingSchema>
const recordSchema = z
  .object({
    accountId: z.string().uuid(),
    conversationId: z.string().uuid(),
    intent: pendingSchema,
  })
  .strict()
const savedSchema = z
  .object({ version: z.literal(1), records: z.array(recordSchema).max(20) })
  .strict()
  .refine(
    (value) =>
      new Set(
        value.records.map(
          (record) => record.accountId + ":" + record.conversationId
        )
      ).size === value.records.length
  )
const KEY = "conversations:pending:v1",
  MAX_BYTES = 512 * 1024
type Record = z.infer<typeof recordSchema>
export function pendingRequests(
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">
) {
  function read(): Record[] {
    const raw = storage().getItem(KEY)
    if (raw === null) return []
    if (
      raw.length > MAX_BYTES ||
      new TextEncoder().encode(raw).byteLength > MAX_BYTES
    )
      throw new Error("Pending request storage unavailable")
    const parsed = savedSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) throw new Error("Pending request storage unavailable")
    return parsed.data.records
  }
  function write(records: Record[]) {
    const raw = JSON.stringify({ version: 1, records })
    if (
      records.length > 20 ||
      new TextEncoder().encode(raw).byteLength > MAX_BYTES
    )
      throw new Error("Pending request storage is full")
    storage().setItem(KEY, raw)
  }
  return {
    get(accountId: string, conversationId: string) {
      return (
        read().find(
          (record) =>
            record.accountId === accountId &&
            record.conversationId === conversationId
        )?.intent ?? null
      )
    },
    save(accountId: string, conversationId: string, intent: PendingIntent) {
      const records = read(),
        previous = records.find(
          (record) =>
            record.accountId === accountId &&
            record.conversationId === conversationId
        )
      if (
        previous &&
        previous.intent.clientRequestId !== intent.clientRequestId
      )
        throw new Error("A pending request is unconfirmed")
      write([
        ...records.filter((record) => record !== previous),
        { accountId, conversationId, intent: pendingSchema.parse(intent) },
      ])
    },
    clear(accountId: string, conversationId: string, clientRequestId: string) {
      const records = read(),
        matching = records.find(
          (record) =>
            record.accountId === accountId &&
            record.conversationId === conversationId &&
            record.intent.clientRequestId === clientRequestId
        )
      if (!matching) return false
      write(records.filter((record) => record !== matching))
      return true
    },
  }
}
