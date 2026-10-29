import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { randomUUID, randomBytes, generateKeyPairSync, sign } from "node:crypto"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { migrateDatabase } from "../packages/database/dist/index.js"
import { createTestDatabase } from "../packages/database/test/database-fixture.mjs"
import { redisConnectionOptions } from "../packages/service-runtime/dist/index.js"
import { TEXT_GENERATION_QUEUE } from "../packages/shared/dist/index.js"

const { Queue } = createRequire(
  new URL("../apps/worker/package.json", import.meta.url)
)("bullmq")
const textQueuePrefixes = []
const { WebSocket } = createRequire(
  new URL("../apps/realtime/package.json", import.meta.url)
)("ws")
const signing = generateKeyPairSync("rsa", { modulusLength: 2048 })
const issuer = "https://smoke.clerk.accounts.dev",
  origin = "http://localhost:3000"
const now = Math.floor(Date.now() / 1000)
const encoded = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")
const unsigned =
  encoded({ alg: "RS256", typ: "JWT", kid: "smoke-key" }) +
  "." +
  encoded({
    sub: "user_smoke",
    sid: "sess_smoke",
    sts: "active",
    azp: origin,
    iss: issuer,
    iat: now,
    nbf: now - 1,
    exp: now + 300,
  })
const session =
  unsigned +
  "." +
  sign("RSA-SHA256", Buffer.from(unsigned), signing.privateKey).toString(
    "base64url"
  )

const environment = {
  ...process.env,
  TEXT_PROVIDER: "deterministic",
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  LOG_LEVEL: "silent",
  CLERK_JWT_ISSUER_DOMAIN: issuer,
  CLERK_JWT_KEY: signing.publicKey.export({ type: "spki", format: "pem" }),
  CLERK_SECRET_KEY: "",
  CLERK_AUTHORIZED_PARTIES: origin,
  REALTIME_INTERNAL_SECRET: randomBytes(32).toString("base64url"),
  REALTIME_REDIS_PREFIX: "smoke_" + randomUUID(),
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://conversations:conversations_local@127.0.0.1:55432/conversations",
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:56379",
  HEALTH_TIMEOUT_MS: "500",
  SHUTDOWN_TIMEOUT_MS: "3000",
}

async function availablePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  return port
}

function start(file, overrides = {}) {
  // Every worker owns a different temporary database, so it must also own a
  // different queue even when the caller supplies a live TEXT_QUEUE_PREFIX.
  const workerEnvironment = {}
  if (file === "apps/worker/dist/index.js") {
    workerEnvironment.TEXT_QUEUE_PREFIX = "smoke_" + randomUUID()
    textQueuePrefixes.push(workerEnvironment.TEXT_QUEUE_PREFIX)
  }
  const child = spawn(process.execPath, [file], {
    env: { ...environment, ...overrides, ...workerEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", () => {}) // Never echo arbitrary driver credentials.
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal, output }))
  })
  return { child, exit, file }
}

async function waitForHealth(port, path, expectedStatus, processHandle) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null)
      throw new Error("Service exited before its health check succeeded")
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(2000),
      })
      if (response.status === expectedStatus) return await response.json()
    } catch {
      /* The listener may still be starting. */
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${path} status ${expectedStatus}`)
}

async function within(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Process deadline exceeded")),
          milliseconds
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const running = []
const database = await createTestDatabase()
try {
  await migrateDatabase(database.pool)
  environment.DATABASE_URL = database.connectionString
  const ports = {
    api: await availablePort(),
    worker: await availablePort(),
    realtime: await availablePort(),
  }
  environment.REALTIME_API_URL = `http://127.0.0.1:${ports.api}`
  environment.REALTIME_PUBLIC_URL = `ws://127.0.0.1:${ports.realtime}/v1/connect`
  for (const service of ["api", "worker", "realtime"]) {
    const port = ports[service]
    const handle = start(`apps/${service}/dist/index.js`, {
      PORT: String(port),
    })
    running.push(handle)
    const ready = await waitForHealth(port, "/health/ready", 200, handle)
    assert.equal(ready.service, service)
    assert.equal(ready.status, "ready")
    assert.equal(ready.checks.redis, "up")
    if (service === "realtime") assert.equal(ready.checks.postgres, undefined)
    else assert.equal(ready.checks.postgres, "up")
    if (service === "worker") assert.equal(ready.checks.queue, "up")
    if (service === "api") {
      assert.equal(ready.checks.schema, "up")
      assert.equal((await fetch(`http://127.0.0.1:${port}/v1/me`)).status, 401)
    }
    console.log(`${service}: ready against real dependencies`)
  }

  const probe = start("apps/worker/dist/probe.js")
  running.push(probe)
  const result = await within(probe.exit, 18000)
  assert.equal(result.code, 0, "Queue probe must complete")
  assert.equal(JSON.parse(result.output.trim()).status, "passed")
  console.log(
    "queue: producer → Redis/BullMQ → worker → correlated result passed"
  )

  const request = async (path, method = "GET", body) => {
    const response = await fetch(environment.REALTIME_API_URL + path, {
      method,
      headers: {
        authorization: "Bearer " + session,
        origin,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    assert.ok(response.ok, "Signed smoke API request failed")
    return response.status === 204 ? undefined : response.json()
  }
  const conversation = await request("/v1/conversations", "POST", {
    title: "Isolated socket smoke",
  })
  const issued = await request("/v1/realtime-tickets", "POST", {
    conversationId: conversation.id,
  })
  const ws = new WebSocket(issued.url, { origin }),
    frames = []
  ws.on("error", () => {})
  ws.on("message", (data) => frames.push(JSON.parse(data.toString())))
  await within(
    (async () => {
      while (!frames.some((frame) => frame.type === "connection.ready"))
        await delay(20)
    })(),
    5000
  )
  const snapshot = await request(
    `/v1/conversations/${conversation.id}/snapshot`
  )
  await request(`/v1/conversations/${conversation.id}`, "PATCH", {
    title: "Durable socket update",
  })
  await within(
    (async () => {
      while (
        !frames.some(
          (frame) =>
            frame.type === "conversation.updated" &&
            frame.sequence > snapshot.checkpoint
        )
      )
        await delay(20)
    })(),
    5000
  )
  const closed = once(ws, "close")
  ws.close()
  await within(closed, 3000)
  console.log(
    "realtime: signed API ticket → separate socket process → Redis event relay → checkpoint reconciliation passed"
  )

  const port = await availablePort()
  const unavailableRedisPort = await availablePort()
  const unavailable = start("apps/realtime/dist/index.js", {
    PORT: String(port),
    REDIS_URL: `redis://127.0.0.1:${unavailableRedisPort}`,
  })
  running.push(unavailable)
  assert.equal(
    (await waitForHealth(port, "/health/live", 200, unavailable)).status,
    "alive"
  )
  assert.equal(
    (await waitForHealth(port, "/health/ready", 503, unavailable)).checks.redis,
    "down"
  )
  console.log(
    "failure: unavailable Redis leaves liveness up and readiness down"
  )

  const workerPort = await availablePort()
  const unavailableWorker = start("apps/worker/dist/index.js", {
    PORT: String(workerPort),
    REDIS_URL: `redis://127.0.0.1:${unavailableRedisPort}`,
  })
  running.push(unavailableWorker)
  assert.equal(
    (await waitForHealth(workerPort, "/health/live", 200, unavailableWorker))
      .status,
    "alive"
  )
  assert.equal(
    (await waitForHealth(workerPort, "/health/ready", 503, unavailableWorker))
      .checks.redis,
    "down"
  )
  console.log(
    "worker failure: unavailable startup Redis retains HTTP liveness and clean shutdown ownership"
  )

  const unmigrated = await createTestDatabase()
  try {
    const schemaPort = await availablePort()
    const schemaWorker = start("apps/worker/dist/index.js", {
      PORT: String(schemaPort),
      DATABASE_URL: unmigrated.connectionString,
    })
    running.push(schemaWorker)
    assert.equal(
      (await waitForHealth(schemaPort, "/health/live", 200, schemaWorker))
        .status,
      "alive"
    )
    assert.equal(
      (await waitForHealth(schemaPort, "/health/ready", 503, schemaWorker))
        .checks.schema,
      "down"
    )
    await migrateDatabase(unmigrated.pool)
    assert.equal(
      (await waitForHealth(schemaPort, "/health/ready", 200, schemaWorker))
        .checks.generation,
      "up"
    )
    schemaWorker.child.kill("SIGTERM")
    assert.equal((await within(schemaWorker.exit, 6000)).code, 0)
    console.log(
      "worker schema: unmigrated startup remains unready, recovers after explicit migration, and exits cleanly"
    )
  } finally {
    await unmigrated.close()
  }

  for (const handle of running) {
    if (handle.child.exitCode !== null) continue
    handle.child.kill("SIGTERM")
    const result = await within(handle.exit, 6000)
    assert.equal(result.code, 0, handle.file + " must drain and exit cleanly")
    assert.equal(result.signal, null)
  }
  console.log("shutdown: every child service drained and exited with code 0")
} finally {
  for (const handle of running) {
    if (handle.child.exitCode === null && handle.child.signalCode === null) {
      handle.child.kill("SIGTERM")
      try {
        await within(handle.exit, 5000)
      } catch {
        handle.child.kill("SIGKILL")
      }
    }
  }
  try {
    for (const prefix of textQueuePrefixes) {
      const queue = new Queue(TEXT_GENERATION_QUEUE, {
        prefix,
        connection: {
          ...redisConnectionOptions(environment.REDIS_URL),
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 1500,
          commandTimeout: 1500,
        },
      })
      queue.on("error", () => {})
      try {
        await within(queue.obliterate({ force: true }), 3000)
      } finally {
        await queue.close()
      }
    }
  } finally {
    await database.close()
  }
}
