import {
  InvalidInput,
  InputLimitExceeded,
  isUuid,
} from "@conversations/database"
export function object(
  value: unknown,
  fields: string[]
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw new InvalidInput()
  return value as Record<string, unknown>
}
export function uuid(value: unknown): string {
  if (!isUuid(value)) throw new InvalidInput()
  return value.toLowerCase()
}
export function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\u0000"))
    throw new InvalidInput()
  if ([...value].length > maximum) throw new InputLimitExceeded()
  return value
}
export function pageQuery(value: unknown, allowStatus = false) {
  const query = object(
    value,
    allowStatus ? ["cursor", "limit", "status"] : ["cursor", "limit"]
  )
  let limit: number | undefined
  if (query.limit !== undefined) {
    if (typeof query.limit !== "string" || !/^\d{1,3}$/.test(query.limit))
      throw new InvalidInput()
    limit = Number(query.limit)
    if (limit < 1 || limit > 100) throw new InvalidInput()
  }
  if (
    query.cursor !== undefined &&
    (typeof query.cursor !== "string" ||
      query.cursor.length > 1024 ||
      !query.cursor)
  )
    throw new InvalidInput()
  if (
    query.status !== undefined &&
    query.status !== "active" &&
    query.status !== "archived"
  )
    throw new InvalidInput()
  return {
    limit,
    cursor: query.cursor as string | undefined,
    status: query.status as "active" | "archived" | undefined,
  }
}
