import { z } from "zod"

// Application IDs historically accept the complete PostgreSQL hexadecimal
// spelling, independently of UUID version/variant bits. Keep that contract.
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

// Version 1 wire integers use Number.isInteger; their individual sign and
// cardinality bounds are applied by the owning schemas.
export const integerSchema = z.number().refine(Number.isInteger)

// Older accepted UTC timestamps may omit seconds. Both branches execute the
// patched v4 parser, including calendar validation.
export const utcTimestampSchema = z.union([
  z.iso.datetime(),
  z.iso.datetime({ precision: -1 }),
])
