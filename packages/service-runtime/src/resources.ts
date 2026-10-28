import { Redis } from "ioredis"
import pg from "pg"
import type { ServiceConfig } from "./config.js"
import { redisConnectionOptions } from "./config.js"
import type { Resources, Dependency } from "./health.js"

export function createResources(config: ServiceConfig): Resources {
  const redis = new Redis({
    ...redisConnectionOptions(config.REDIS_URL),
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: config.HEALTH_TIMEOUT_MS,
    commandTimeout: config.HEALTH_TIMEOUT_MS,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  })
  // Health reports failures without echoing sensitive connection information.
  redis.on("error", () => {})
  void redis.connect().catch(() => {})
  const dependencies: Dependency[] = [
    { name: "redis", check: () => redis.ping() },
  ]
  const pool =
    config.service !== "realtime"
      ? new pg.Pool({
          connectionString: config.DATABASE_URL,
          max: 5,
          connectionTimeoutMillis: config.HEALTH_TIMEOUT_MS,
          query_timeout: config.HEALTH_TIMEOUT_MS,
          idleTimeoutMillis: 10000,
        })
      : undefined
  pool?.on("error", () => {})
  if (pool)
    dependencies.push({ name: "postgres", check: () => pool.query("SELECT 1") })
  return {
    dependencies,
    async close() {
      redis.disconnect()
      if (pool) await pool.end()
    },
  }
}
