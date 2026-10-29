import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { readMigrationFiles } from "drizzle-orm/migrator"
import type { Pool } from "pg"

export const migrationsFolder = fileURLToPath(
  new URL("../migrations/", import.meta.url)
)

/** One explicit runner, serialized even when multiple release processes start. */
export async function migrateDatabase(
  pool: Pool,
  folder = migrationsFolder
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("SET lock_timeout = '10s'")
    await client.query("SET statement_timeout = '30s'")
    await client.query(
      "SELECT pg_advisory_lock(hashtext('conversations-schema-migrations'))"
    )
    try {
      await migrate(drizzle(client), { migrationsFolder: folder })
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('conversations-schema-migrations'))"
      )
    }
  } finally {
    try {
      await client.query("RESET lock_timeout; RESET statement_timeout")
    } finally {
      client.release()
    }
  }
}

export async function checkDatabaseSchema(pool: Pool): Promise<void> {
  const expected = readMigrationFiles({ migrationsFolder })
  const { rows } = await pool.query<{ hash: string; created_at: string }>(
    "SELECT hash, created_at FROM drizzle.__drizzle_migrations"
  )
  // A newer additive deployment may coexist with this version during rollout.
  // Every migration this version expects must still have its exact recorded hash.
  if (
    !expected.every((migration) =>
      rows.some(
        (row) =>
          row.hash === migration.hash &&
          Number(row.created_at) === migration.folderMillis
      )
    )
  )
    throw new Error("Database migrations are pending")
  await pool.query(
    "SELECT a.id, c.id, m.id, o.id, h.id, f.id FROM accounts a, conversations c, messages m, operations o, handoffs h, finalized_deliveries f LIMIT 0"
  )
}
