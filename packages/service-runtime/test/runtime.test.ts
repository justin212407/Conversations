import assert from "node:assert/strict"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { loadRealtimeConfig } from "../src/realtime-config.js"
import { loadConfig, redisConnectionOptions } from "../src/config.js"
import { createHealthServer } from "../src/health.js"

const environment = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  HEALTH_TIMEOUT_MS: "100",
}
test("unknown routes do not expose query tokens in logs or responses", async (t) => {
  const logs: string[] = []
  const secret = "SYNTHETIC_QUERY_TOKEN"
  const app = createHealthServer(
    loadConfig("api", { ...environment, LOG_LEVEL: "info" }),
    { dependencies: [], close: async () => {} },
    {
      write: (message) => {
        logs.push(message)
      },
    }
  )
  t.after(() => app.close())
  const response = await app.inject({
    url: `/unknown?ticket=${secret}`,
    headers: { authorization: `Bearer ${secret}`, cookie: `session=${secret}` },
  })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().error.code, "NOT_FOUND")
  assert.ok(logs.length > 0)
  assert.ok(!logs.join("").includes(secret))
  assert.ok(!response.body.includes(secret))
})
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

test("shutdown stops job intake before draining an active HTTP request", async () => {
  let enterCheck!: () => void
  let releaseCheck!: () => void
  let signalStopped!: () => void
  const entered = new Promise<void>((resolve) => {
    enterCheck = resolve
  })
  const pending = new Promise<void>((resolve) => {
    releaseCheck = resolve
  })
  const stopped = new Promise<void>((resolve) => {
    signalStopped = resolve
  })
  let resourcesClosed = false
  const app = createHealthServer(
    loadConfig("worker", { ...environment, HEALTH_TIMEOUT_MS: "2000" }),
    {
      dependencies: [
        {
          name: "queue",
          check: () => {
            enterCheck()
            return pending
          },
        },
      ],
      stopIntake: async () => {
        signalStopped()
      },
      close: async () => {
        resourcesClosed = true
      },
    }
  )
  const response = app.inject("/health/ready")
  await entered
  const closing = app.close()
  try {
    await Promise.race([
      stopped,
      delay(500).then(() => {
        throw new Error("Intake was not stopped before HTTP drain")
      }),
    ])
    assert.equal(resourcesClosed, false)
  } finally {
    releaseCheck()
    await closing
  }
  assert.equal((await response).statusCode, 503)
  assert.equal(resourcesClosed, true)
})

test("patched URL output normalization retains effective connection semantics and guards", () => {
  const ordinary = loadConfig("api", environment)
  const config = loadConfig("api", {
    ...environment,
    REDIS_URL: " \tredis://us\ner:p%40ss@cache.example:6380/2\r ",
    DATABASE_URL: " \npostgresql://test:test@db.example:5432/test\t ",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
      " \thttps://traces.example/v1/traces\r ",
  })
  assert.equal(ordinary.REDIS_URL, environment.REDIS_URL)
  assert.equal(config.REDIS_URL, "redis://user:p%40ss@cache.example:6380/2")
  assert.deepEqual(redisConnectionOptions(config.REDIS_URL), {
    host: "cache.example",
    port: 6380,
    username: "user",
    password: "p@ss",
    db: 2,
  })
  const database = new URL(config.DATABASE_URL!)
  assert.equal(database.hostname, "db.example")
  assert.equal(database.username, "test")
  assert.equal(database.password, "test")
  assert.equal(database.protocol, "postgresql:")
  assert.equal(
    config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    "https://traces.example/v1/traces"
  )
  for (const value of [
    " \thttps://cache.example/2 ",
    "redis://cache.example/not-a-db",
  ]) {
    assert.throws(
      () => loadConfig("api", { ...environment, REDIS_URL: value }),
      /REDIS_URL/
    )
  }
  for (const endpoint of [
    " \nhttp://traces.example/v1/traces ",
    "https://user:secret@traces.example/v1/traces",
    "https://traces.example/v1/traces?secret=token",
  ]) {
    assert.throws(
      () =>
        loadConfig("api", {
          ...environment,
          NODE_ENV: "production",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
        }),
      (error) =>
        error instanceof Error &&
        error.message ===
          "Invalid service configuration: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
    )
  }
  const realtime = loadRealtimeConfig({
    REALTIME_PUBLIC_URL: " \twss://socket.example/v1/connect\n ",
    REALTIME_API_URL: " \rhttps://api.example\t ",
  })
  assert.equal(new URL(realtime.REALTIME_PUBLIC_URL).hostname, "socket.example")
  assert.equal(realtime.REALTIME_PUBLIC_URL, "wss://socket.example/v1/connect")
  assert.equal(realtime.REALTIME_API_URL, "https://api.example")
  assert.throws(
    () =>
      loadRealtimeConfig({
        NODE_ENV: "production",
        REALTIME_INTERNAL_SECRET: "a".repeat(43),
        CLERK_AUTHORIZED_PARTIES: "https://workspace.example",
        REALTIME_PUBLIC_URL: " ws://socket.example/v1/connect ",
        REALTIME_API_URL: "https://api.example",
      }),
    /Invalid realtime service configuration/
  )
})
