import pg from "pg"
import { migrateDatabase } from "./migrate.js"

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
  })
  pool.on("error", () => {})
  try {
    await migrateDatabase(pool)
    console.log("Database migrations applied")
  } finally {
    await pool.end()
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check database configuration and migration history."
  )
  process.exitCode = 1
})
