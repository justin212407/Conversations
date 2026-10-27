import assert from "node:assert/strict"
import { test } from "node:test"
import { loadConfig, redisConnectionOptions } from "../src/config.js"
import { createHealthServer } from "../src/health.js"

const environment = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  HEALTH_TIMEOUT_MS: "100",
}
test("configuration rejects missing/unsafe values without disclosing secrets", () => {
  assert.throws(
    () => loadConfig("api", { REDIS_URL: environment.REDIS_URL }),
    /DATABASE_URL/
  )
  assert.throws(
    () => loadConfig("worker", { ...environment, PORT: "0" }),
    /PORT/
  )
  assert.throws(
    () =>
      loadConfig("api", {
        ...environment,
        REDIS_URL: "https://user:secret@localhost",
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes("REDIS_URL") &&
      !error.message.includes("secret")
  )
  assert.throws(
    () =>
      loadConfig("api", {
        ...environment,
        REDIS_URL: "redis://localhost/not-a-db",
      }),
    /REDIS_URL/
  )
  assert.throws(
    () => loadConfig("api", { ...environment, HEALTH_TIMEOUT_MS: "-1" }),
    /HEALTH_TIMEOUT_MS/
  )
})
test("realtime requires Redis but no conversation database", () => {
  const config = loadConfig("realtime", { REDIS_URL: environment.REDIS_URL })
  assert.equal(config.DATABASE_URL, undefined)
  assert.equal(config.PORT, 4301)
})
test("Redis options preserve encoded credentials, database selection, and TLS", () => {
  const options = redisConnectionOptions(
    "rediss://user:p%40ss@localhost:6380/2"
  )
  assert.deepEqual(options, {
    host: "localhost",
    port: 6380,
    username: "user",
    password: "p@ss",
    db: 2,
    tls: {},
  })
})
test("liveness stays available when readiness fails and does not leak driver errors", async (t) => {
  let attempts = 0
  const app = createHealthServer(loadConfig("api", environment), {
    dependencies: [
      {
        name: "postgres",
        check: async () => {
          attempts++
          throw new Error("postgresql://private:secret@host/database")
        },
      },
    ],
    close: async () => {},
  })
  t.after(() => app.close())
  assert.equal((await app.inject("/health/live")).statusCode, 200)
  assert.equal(attempts, 0)
  const response = await app.inject("/health/ready")
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), {
    service: "api",
    status: "not_ready",
    checks: { postgres: "down" },
  })
  assert.ok(!response.body.includes("secret"))
})
test("readiness recovers when a previously failed dependency becomes healthy", async (t) => {
  let healthy = false
  const app = createHealthServer(loadConfig("api", environment), {
    dependencies: [
      {
        name: "postgres",
        check: async () => {
          if (!healthy) throw new Error("offline")
        },
      },
    ],
    close: async () => {},
  })
  t.after(() => app.close())
  assert.equal((await app.inject("/health/ready")).statusCode, 503)
  healthy = true
  assert.equal((await app.inject("/health/ready")).statusCode, 200)
})
test("a stuck dependency cannot hang readiness indefinitely", async (t) => {
  const app = createHealthServer(loadConfig("worker", environment), {
    dependencies: [{ name: "queue", check: () => new Promise(() => {}) }],
    close: async () => {},
  })
  t.after(() => app.close())
  const response = await app.inject("/health/ready")
  assert.equal(response.statusCode, 503)
  assert.equal(response.json().checks.queue, "down")
})
test("closing the server releases the owned resources", async () => {
  let closed = 0
  const app = createHealthServer(loadConfig("api", environment), {
    dependencies: [],
    close: async () => {
      closed++
    },
  })
  await app.ready()
  await app.close()
  assert.equal(closed, 1)
})
