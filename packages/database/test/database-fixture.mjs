import pg from "pg"
import { randomUUID } from "node:crypto"
import process from "node:process"
import { URL } from "node:url"

/** Fresh databases only; never truncates or migrates the configured base DB. */
export async function createTestDatabase() {
  const base =
    process.env.TEST_DATABASE_URL ??
    "postgresql://conversations:conversations_local@127.0.0.1:55432/conversations"
  const name = "slice1_test_" + randomUUID().replaceAll("-", "")
  const admin = new pg.Pool({
    connectionString: base,
    max: 1,
    connectionTimeoutMillis: 3000,
  })
  admin.on("error", () => {})
  let pool
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
    const url = new URL(base)
    url.pathname = "/" + name
    pool = new pg.Pool({
      connectionString: url.href,
      max: 8,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 1000,
    })
    pool.on("error", () => {})
  } catch {
    await admin.end()
    throw new Error(
      "Integration database setup failed; provide local PostgreSQL or TEST_DATABASE_URL with CREATE DATABASE permission"
    )
  }
  return {
    pool,
    connectionString: pool.options.connectionString,
    async close() {
      await pool.end()
      try {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)
      } finally {
        await admin.end()
      }
    },
  }
}
