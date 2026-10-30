import assert from "node:assert/strict"
import { test } from "node:test"
import process from "node:process"
import { exportSPKI, generateKeyPair, SignJWT } from "jose"
import { createApi } from "../dist/app.js"
import { authenticateBearer, loadAuthConfig } from "../dist/auth.js"
import { loadConfig } from "@conversations/service-runtime"
import {
  checkDatabaseSchema,
  ConversationStore,
  migrateDatabase,
} from "@conversations/database"
import { createTestDatabase } from "../../../packages/database/test/database-fixture.mjs"

const issuer = "https://fixture.clerk.accounts.dev"
const origin = "http://localhost:3000"

async function identityFixture() {
  const keys = await generateKeyPair("RS256")
  const config = {
    issuer,
    authorizedParties: [origin],
    jwtKey: await exportSPKI(keys.publicKey),
  }
  return {
    config,
    async token(overrides = {}, signingKey = keys.privateKey) {
      const now = Math.floor(Date.now() / 1000)
      return new SignJWT({
        sub: "user_fixture",
        sid: "sess_fixture",
        sts: "active",
        azp: origin,
        iss: issuer,
        iat: now,
        nbf: now - 1,
        exp: now + 60,
        ...overrides,
      })
        .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "fixture-key" })
        .sign(signingKey)
    },
  }
}

function serviceConfig() {
  return loadConfig("api", {
    DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
    REDIS_URL: "redis://localhost",
    LOG_LEVEL: "silent",
  })
}

test("auth configuration rejects partial/insecure production settings and permits health-only development", () => {
  assert.equal(loadAuthConfig({ NODE_ENV: "development" }), undefined)
  for (const env of [
    { NODE_ENV: "production" },
    { CLERK_SECRET_KEY: "synthetic-secret" },
    { CLERK_JWT_ISSUER_DOMAIN: issuer },
    {
      CLERK_JWT_ISSUER_DOMAIN: "http://unsafe.example",
      CLERK_SECRET_KEY: "synthetic-secret",
    },
    {
      CLERK_JWT_ISSUER_DOMAIN: issuer,
      CLERK_SECRET_KEY: "synthetic-secret",
      CLERK_AUTHORIZED_PARTIES: "*",
    },
    {
      NODE_ENV: "production",
      CLERK_JWT_ISSUER_DOMAIN: issuer,
      CLERK_SECRET_KEY: "synthetic-secret",
    },
  ])
    assert.throws(
      () => loadAuthConfig(env),
      /Invalid authentication configuration/
    )
  const production = loadAuthConfig({
    NODE_ENV: "production",
    CLERK_JWT_ISSUER_DOMAIN: issuer,
    CLERK_SECRET_KEY: "synthetic-secret",
    CLERK_AUTHORIZED_PARTIES: "https://app.example",
  })
  assert.deepEqual(production.authorizedParties, ["https://app.example"])
})

test("the API verifies real JWT signatures and only provisions valid completed user sessions", async (t) => {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const identity = await identityFixture()
  const foreignKeys = await generateKeyPair("RS256")
  await migrateDatabase(database.pool)
  const store = new ConversationStore(database.pool)
  const logs = []
  const config = { ...serviceConfig(), LOG_LEVEL: "info" }
  const app = createApi(
    config,
    {
      dependencies: [
        { name: "schema", check: () => checkDatabaseSchema(database.pool) },
      ],
      close: async () => {},
    },
    store,
    identity.config,
    { write: (message) => logs.push(message) }
  )
  try {
    const invalidHeaders = [
      undefined,
      "Basic synthetic",
      "Bearer",
      "Bearer token extra",
      "Bearer synthetic-invalid-credential",
      "Bearer " +
        (await identity.token({ exp: Math.floor(Date.now() / 1000) - 60 })),
      "Bearer " +
        (await identity.token({ nbf: Math.floor(Date.now() / 1000) + 60 })),
      "Bearer " +
        (await identity.token({ iss: "https://other.clerk.accounts.dev" })),
      "Bearer " + (await identity.token({ azp: "https://other.example" })),
      "Bearer " + (await identity.token({ sub: "machine_fixture" })),
      "Bearer " + (await identity.token({ sid: undefined })),
      "Bearer " + (await identity.token({ sts: "pending" })),
      "Bearer " + (await identity.token({ sts: "unknown" })),
      "Bearer " + (await identity.token({ exp: undefined })),
      "Bearer " + (await identity.token({}, foreignKeys.privateKey)),
    ]
    for (const authorization of invalidHeaders) {
      const response = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: authorization ? { authorization } : {},
      })
      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, "UNAUTHORIZED")
      assert.equal(typeof response.json().requestId, "string")
      assert.equal(response.headers["www-authenticate"], "Bearer")
      assert.equal(response.headers["cache-control"], "no-store")
      if (authorization) assert.ok(!response.body.includes(authorization))
    }
    assert.equal(
      (await database.pool.query("SELECT count(*)::int AS count FROM accounts"))
        .rows[0].count,
      0
    )
    const token = await identity.token()
    assert.equal(
      await authenticateBearer("Bearer " + token, identity.config),
      "user_fixture"
    )
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        app.inject({
          method: "GET",
          url: "/v1/me?accountId=caller-supplied",
          headers: {
            authorization: "Bearer " + token,
            "x-account-id": "caller-supplied",
          },
        })
      )
    )
    const ids = responses.map((response) => {
      assert.equal(response.statusCode, 200)
      assert.deepEqual(Object.keys(response.json()).sort(), [
        "createdAt",
        "id",
        "updatedAt",
      ])
      return response.json().id
    })
    assert.equal(new Set(ids).size, 1)
    const bob = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization:
          "Bearer " + (await identity.token({ sub: "user_other" })),
      },
    })
    assert.notEqual(bob.json().id, ids[0])
    assert.equal((await app.inject("/health/ready")).statusCode, 200)
    const output = logs.join("")
    for (const header of invalidHeaders.filter(Boolean))
      assert.ok(!output.includes(header))
    assert.ok(!output.includes(token))
    assert.ok(!output.includes("user_fixture"))
    await database.pool.query("DROP TABLE accounts CASCADE")
    assert.equal((await app.inject("/health/ready")).statusCode, 503)
    const failed = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer " + token },
    })
    assert.equal(failed.statusCode, 503)
    assert.equal(failed.json().error.code, "DEPENDENCY_UNAVAILABLE")
    assert.ok(!failed.body.includes("accounts"))
  } finally {
    await app.close()
  }
})

test("unconfigured development retains health but cannot authenticate or provision an account", async (t) => {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const app = createApi(
    serviceConfig(),
    { dependencies: [], close: async () => {} },
    new ConversationStore(database.pool),
    undefined
  )
  try {
    assert.equal((await app.inject("/health/live")).statusCode, 200)
    assert.equal((await app.inject("/v1/me")).statusCode, 401)
    const result = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer synthetic" },
    })
    assert.equal(result.statusCode, 503)
    assert.equal(result.json().error.code, "AUTH_UNAVAILABLE")
  } finally {
    await app.close()
  }
})

test("Clerk JWKS outages return 503 through the SDK network seam without provisioning", async (t) => {
  const database = await createTestDatabase()
  t.after(() => database.close())
  const identity = await identityFixture()
  const savedFetch = globalThis.fetch
  const savedMode = process.env.NODE_ENV
  process.env.NODE_ENV = "test" // Clerk's supported runtime seam uses global fetch in tests.
  const auth = {
    issuer,
    authorizedParties: [origin],
    secretKey: "sk_test_fixture_outage",
  }
  const app = createApi(
    serviceConfig(),
    { dependencies: [], close: async () => {} },
    new ConversationStore(database.pool),
    auth
  )
  try {
    const token = await identity.token()
    let requests = 0
    for (const failure of [
      () =>
        new globalThis.Response(JSON.stringify({ errors: [] }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      () =>
        new globalThis.Response(
          JSON.stringify({
            errors: [
              {
                code: "clerk_key_invalid",
                message: "synthetic private provider diagnostic",
              },
            ],
          }),
          { status: 401, headers: { "content-type": "application/json" } }
        ),
      () => {
        throw new TypeError("synthetic network outage")
      },
    ]) {
      globalThis.fetch = async () => {
        requests++
        return failure()
      }
      const result = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { authorization: "Bearer " + token },
      })
      assert.equal(result.statusCode, 503)
      assert.equal(result.json().error.code, "AUTH_UNAVAILABLE")
      assert.ok(!result.body.includes("synthetic"))
      assert.ok(!result.body.includes(token))
    }
    assert.ok(requests >= 3)
    assert.equal(
      (
        await database.pool.query(
          "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_name='accounts'"
        )
      ).rows[0].count,
      0
    )
  } finally {
    globalThis.fetch = savedFetch
    if (savedMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedMode
    await app.close()
  }
})

test("production authorized parties require explicit HTTPS origins", () => {
  const base = {
    NODE_ENV: "production",
    CLERK_JWT_ISSUER_DOMAIN: issuer,
    CLERK_SECRET_KEY: "fixture-only-secret",
  }
  assert.throws(() =>
    loadAuthConfig({
      ...base,
      CLERK_AUTHORIZED_PARTIES: "http://workspace.example",
    })
  )
  assert.ok(
    loadAuthConfig({
      ...base,
      CLERK_AUTHORIZED_PARTIES: "https://workspace.example",
    })
  )
})
