import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import {
  createConversationApi,
  frontendOrigin,
} from "./conversation-fixture.mjs"

function error(result, status, code) {
  assert.equal(result.statusCode, status, result.body)
  assert.equal(result.json().error.code, code)
  assert.equal(typeof result.json().requestId, "string")
}

test("REST CRUD is personal-account owned, paginated and excludes soft-deleted conversations", async (t) => {
  const api = await createConversationApi(t)
  error(
    await api.request("GET", "/v1/conversations", undefined, null),
    401,
    "UNAUTHORIZED"
  )
  const created = await api.request("POST", "/v1/conversations")
  assert.equal(created.statusCode, 201)
  const first = created.json()
  assert.equal(first.title, "New conversation")
  assert.equal(created.headers.location, "/v1/conversations/" + first.id)
  assert.deepEqual(Object.keys(first).sort(), [
    "createdAt",
    "id",
    "status",
    "title",
    "updatedAt",
  ])
  const mine = await api.create("Mine"),
    foreign = await api.create("Other account", "bob")
  let list = await api.request("GET", "/v1/conversations?limit=1")
  assert.equal(list.statusCode, 200)
  assert.equal(list.json().items.length, 1)
  const older = await api.request(
    "GET",
    "/v1/conversations?limit=1&cursor=" + list.json().nextCursor
  )
  assert.equal(older.json().items.length, 1)
  assert.equal(older.json().nextCursor, null)
  assert.notEqual(older.json().items[0].id, list.json().items[0].id)
  const cross = await api.request("GET", "/v1/conversations/" + foreign.id)
  const missing = await api.request("GET", "/v1/conversations/" + randomUUID())
  error(cross, 404, "NOT_FOUND")
  error(missing, 404, "NOT_FOUND")
  assert.deepEqual(cross.json().error, missing.json().error)
  for (const [method, path, body] of [
    ["PATCH", "", { title: "Hijacked" }],
    ["DELETE", "", undefined],
    ["GET", "/messages", undefined],
    [
      "POST",
      "/messages",
      { clientRequestId: randomUUID(), content: "Private attempt" },
    ],
    [
      "POST",
      "/operations/" + randomUUID() + "/retry",
      { clientRequestId: randomUUID() },
    ],
  ])
    error(
      await api.request(method, "/v1/conversations/" + foreign.id + path, body),
      404,
      "NOT_FOUND"
    )
  assert.equal(
    (
      await api.request("PATCH", "/v1/conversations/" + mine.id, {
        title: "Renamed",
      })
    ).json().title,
    "Renamed"
  )
  assert.equal(
    (
      await api.request("PATCH", "/v1/conversations/" + mine.id, {
        status: "archived",
      })
    ).statusCode,
    200
  )
  assert.deepEqual(
    (await api.request("GET", "/v1/conversations?status=archived"))
      .json()
      .items.map((item) => item.id),
    [mine.id]
  )
  error(
    await api.request("POST", "/v1/conversations/" + mine.id + "/messages", {
      clientRequestId: randomUUID(),
      content: "Archived",
    }),
    409,
    "CONFLICT"
  )
  assert.equal(
    (
      await api.request("PATCH", "/v1/conversations/" + mine.id, {
        status: "active",
      })
    ).statusCode,
    200
  )
  const removed = await api.request("DELETE", "/v1/conversations/" + mine.id)
  assert.equal(removed.statusCode, 204)
  assert.equal(removed.body, "")
  for (const [method, path, body] of [
    ["GET", "", undefined],
    ["GET", "/messages", undefined],
    ["DELETE", "", undefined],
    ["PATCH", "", { title: "Gone" }],
  ])
    error(
      await api.request(method, "/v1/conversations/" + mine.id + path, body),
      404,
      "NOT_FOUND"
    )
  list = await api.request("GET", "/v1/conversations")
  assert.deepEqual(
    list.json().items.map((item) => item.id),
    [first.id]
  )
})

test("strict payload/query validation and input limits retain safe common errors", async (t) => {
  const api = await createConversationApi(t)
  const c = await api.create()
  error(
    await api.request("POST", "/v1/conversations", "null", "alice", {
      "content-type": "application/json",
    }),
    400,
    "INVALID_INPUT"
  )
  for (const payload of [
    [],
    { title: 4 },
    { title: "" },
    { title: "  " },
    { title: "bad\u0000title" },
    { title: "valid", accountId: randomUUID() },
  ])
    error(
      await api.request("POST", "/v1/conversations", payload),
      400,
      "INVALID_INPUT"
    )
  error(
    await api.request("POST", "/v1/conversations", { title: "x".repeat(121) }),
    413,
    "INPUT_LIMIT_EXCEEDED"
  )
  assert.equal(
    (
      await api.request("POST", "/v1/conversations", {
        title: "🧪".repeat(120),
      })
    ).statusCode,
    201
  )
  error(
    await api.request("POST", "/v1/conversations", "{", "alice", {
      "content-type": "application/json",
    }),
    400,
    "INVALID_INPUT"
  )
  error(
    await api.request("POST", "/v1/conversations", "x".repeat(70000), "alice", {
      "content-type": "application/json",
    }),
    413,
    "INPUT_LIMIT_EXCEEDED"
  )
  for (const payload of [
    {},
    { clientRequestId: randomUUID() },
    { clientRequestId: "bad", content: "x" },
    { clientRequestId: randomUUID(), content: 123 },
    { clientRequestId: randomUUID(), content: " " },
    { clientRequestId: randomUUID(), content: "x", role: "assistant" },
  ])
    error(
      await api.request(
        "POST",
        "/v1/conversations/" + c.id + "/messages",
        payload
      ),
      400,
      "INVALID_INPUT"
    )
  error(
    await api.request("POST", "/v1/conversations/" + c.id + "/messages", {
      clientRequestId: randomUUID(),
      content: "x".repeat(16001),
    }),
    413,
    "INPUT_LIMIT_EXCEEDED"
  )
  error(
    await api.request("PATCH", "/v1/conversations/" + c.id, {}),
    400,
    "INVALID_INPUT"
  )
  error(
    await api.request("PATCH", "/v1/conversations/" + c.id, {
      status: "deleted",
    }),
    400,
    "INVALID_INPUT"
  )
  error(
    await api.request("GET", "/v1/conversations/not-a-uuid"),
    400,
    "INVALID_INPUT"
  )
  for (const query of [
    "limit=0",
    "limit=101",
    "limit=1.5",
    "limit=1&limit=2",
    "status=deleted",
    "unexpected=1",
    "cursor=bad!",
  ])
    error(
      await api.request("GET", "/v1/conversations?" + query),
      400,
      "INVALID_INPUT"
    )
  error(
    await api.request(
      "GET",
      "/v1/conversations/" + c.id + "/messages?status=active"
    ),
    400,
    "INVALID_INPUT"
  )
  const unicode = await api.request(
    "POST",
    "/v1/conversations/" + c.id + "/messages",
    { clientRequestId: randomUUID(), content: "🧪".repeat(16000) }
  )
  assert.equal(unicode.statusCode, 202)
  const log = api.logs.join("")
  assert.ok(!log.includes(api.tokens.alice))
  assert.ok(!log.includes("🧪"))
})

test("REST durable commands, retry/recovery and persisted message pagination survive replay", async (t) => {
  const api = await createConversationApi(t)
  const c = await api.create()
  const body = { clientRequestId: randomUUID(), content: "Durable question" }
  const copies = await Promise.all(
    Array.from({ length: 10 }, () =>
      api.request("POST", "/v1/conversations/" + c.id + "/messages", body)
    )
  )
  assert.ok(copies.every((result) => result.statusCode === 202))
  assert.equal(
    new Set(copies.map((result) => result.json().operationId)).size,
    1
  )
  const accepted = copies[0].json()
  const state = (await api.request("GET", "/v1/conversations/" + c.id)).json()
  assert.equal(state.activeOperation.operationId, accepted.operationId)
  error(
    await api.request("POST", "/v1/conversations/" + c.id + "/messages", {
      ...body,
      content: "Changed",
    }),
    409,
    "CONFLICT"
  )
  error(
    await api.request("PATCH", "/v1/conversations/" + c.id, {
      status: "archived",
    }),
    409,
    "CONFLICT"
  )
  error(
    await api.request("DELETE", "/v1/conversations/" + c.id),
    409,
    "CONFLICT"
  )
  error(
    await api.request(
      "POST",
      "/v1/conversations/" +
        c.id +
        "/operations/" +
        accepted.operationId +
        "/retry",
      { clientRequestId: randomUUID() }
    ),
    409,
    "CONFLICT"
  )
  const account = (await api.request("GET", "/v1/me")).json()
  await api.store.commands.finalize(account.id, c.id, accepted.operationId, {
    state: "failed",
    content: "",
  })
  const retryBody = { clientRequestId: randomUUID() }
  const retryPath =
    "/v1/conversations/" +
    c.id +
    "/operations/" +
    accepted.operationId +
    "/retry"
  const retried = await api.request("POST", retryPath, retryBody)
  assert.equal(retried.statusCode, 202)
  assert.equal(retried.json().userMessageId, accepted.userMessageId)
  assert.deepEqual(
    (await api.request("POST", retryPath, retryBody)).json(),
    retried.json()
  )
  const upper = await api.request(
    "POST",
    retryPath
      .toUpperCase()
      .replace("/V1/CONVERSATIONS/", "/v1/conversations/")
      .replace("/OPERATIONS/", "/operations/")
      .replace("/RETRY", "/retry"),
    { clientRequestId: retryBody.clientRequestId.toUpperCase() }
  )
  assert.equal(upper.statusCode, 202)
  await api.pool.query(
    "UPDATE operations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [retried.json().operationId]
  )
  const recovered = await api.request(
    "POST",
    "/v1/conversations/" +
      c.id +
      "/operations/" +
      retried.json().operationId +
      "/retry",
    { clientRequestId: randomUUID() }
  )
  assert.equal(recovered.statusCode, 202)
  assert.equal(recovered.json().userMessageId, accepted.userMessageId)
  await api.store.commands.finalize(
    account.id,
    c.id,
    recovered.json().operationId,
    { state: "completed", content: "Authoritative answer" }
  )
  const seen = []
  let cursor
  do {
    const page = (
      await api.request(
        "GET",
        "/v1/conversations/" +
          c.id +
          "/messages?limit=2" +
          (cursor ? "&cursor=" + cursor : "")
      )
    ).json()
    seen.unshift(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  assert.equal(seen.filter((message) => message.role === "user").length, 1)
  assert.deepEqual(
    seen.map((message) => message.state),
    ["completed", "failed", "interrupted", "completed"]
  )
  assert.equal(seen.at(-1).content, "Authoritative answer")
  assert.equal(
    (await api.request("GET", "/v1/conversations/" + c.id)).json()
      .activeOperation,
    null
  )
  const jobs = await api.pool.query(
    "SELECT operation_id FROM handoffs WHERE kind='job'"
  )
  assert.equal(jobs.rowCount, 3)
  assert.equal(
    (
      await api.request("POST", "/v1/conversations/" + c.id + "/messages", body)
    ).json().operationId,
    accepted.operationId
  )
})

test("OpenAPI describes actual routes and CORS permits only configured frontend origins", async (t) => {
  const api = await createConversationApi(t)
  const document = (
    await api.request("GET", "/openapi.json", undefined, null)
  ).json()
  assert.equal(document.openapi, "3.1.0")
  assert.ok(document.paths["/v1/me"].get)
  assert.ok(
    document.paths["/v1/conversations/{id}/messages"].post.responses["202"]
  )
  assert.ok(document.paths["/health/ready"].get.responses["503"])
  for (const path of Object.keys(document.paths))
    assert.ok(!/voice|providers/.test(path))
  assert.ok(document.paths["/v1/realtime-tickets"].post.responses["201"])
  assert.ok(
    document.paths["/v1/conversations/{id}/snapshot"].get.responses["200"]
  )
  assert.deepEqual(document.paths["/internal/realtime/redeem"].post.security, [
    { RealtimeService: [] },
  ])
  assert.equal(
    document.paths["/v1/conversations"].post.requestBody.content[
      "application/json"
    ].schema.additionalProperties,
    false
  )
  const preflight = await api.request(
    "OPTIONS",
    "/v1/conversations",
    undefined,
    null,
    {
      origin: frontendOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    }
  )
  assert.equal(preflight.statusCode, 204)
  assert.equal(preflight.headers["access-control-allow-origin"], frontendOrigin)
  assert.match(
    preflight.headers["access-control-allow-headers"],
    /Authorization/i
  )
  assert.match(preflight.headers["access-control-allow-methods"], /POST/)
  assert.equal(preflight.headers["access-control-allow-credentials"], undefined)
  const rejected = await api.request(
    "OPTIONS",
    "/v1/conversations",
    undefined,
    null,
    {
      origin: "https://untrusted.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization",
    }
  )
  assert.equal(rejected.headers["access-control-allow-origin"], undefined)
  const deniedActual = await api.request(
    "GET",
    "/v1/conversations",
    undefined,
    "alice",
    { origin: "https://untrusted.example" }
  )
  assert.equal(deniedActual.headers["access-control-allow-origin"], undefined)
  const allowedActual = await api.request(
    "GET",
    "/v1/conversations",
    undefined,
    "alice",
    { origin: frontendOrigin }
  )
  assert.equal(allowedActual.statusCode, 200)
  assert.equal(
    allowedActual.headers["access-control-allow-origin"],
    frontendOrigin
  )
})

test("HTTP acknowledgements fail safely and roll back when durable handoff is unavailable", async (t) => {
  const api = await createConversationApi(t)
  const c = await api.create()
  await api.pool.query(
    "CREATE FUNCTION reject_api_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private handoff failure'; END $$; CREATE TRIGGER reject_api_handoff BEFORE INSERT ON handoffs FOR EACH ROW EXECUTE FUNCTION reject_api_handoff()"
  )
  const payload = { clientRequestId: randomUUID(), content: "Should roll back" }
  const rejected = await api.request(
    "POST",
    "/v1/conversations/" + c.id + "/messages",
    payload
  )
  error(rejected, 503, "DEPENDENCY_UNAVAILABLE")
  assert.ok(!rejected.body.includes("synthetic"))
  assert.equal(
    (await api.pool.query("SELECT count(*)::int AS count FROM messages"))
      .rows[0].count,
    0
  )
  assert.equal(
    (await api.pool.query("SELECT count(*)::int AS count FROM operations"))
      .rows[0].count,
    0
  )
  error(
    await api.request("PATCH", "/v1/conversations/" + c.id, {
      title: "Uncommitted",
    }),
    503,
    "DEPENDENCY_UNAVAILABLE"
  )
  assert.equal(
    (await api.request("GET", "/v1/conversations/" + c.id)).json().title,
    c.title
  )
  error(
    await api.request("POST", "/v1/conversations", {
      title: "Uncommitted create",
    }),
    503,
    "DEPENDENCY_UNAVAILABLE"
  )
  assert.equal(
    (await api.pool.query("SELECT count(*)::int AS count FROM conversations"))
      .rows[0].count,
    1
  )
  await api.pool.query(
    "DROP TRIGGER reject_api_handoff ON handoffs; DROP FUNCTION reject_api_handoff()"
  )
  assert.equal(
    (
      await api.request(
        "POST",
        "/v1/conversations/" + c.id + "/messages",
        payload
      )
    ).statusCode,
    202
  )
})

test("router decoding and malformed preflight errors use safe JSON without query credentials", async (t) => {
  const api = await createConversationApi(t)
  const secret = "synthetic-sensitive-ticket"
  const malformed = await api.app.inject({
    method: "GET",
    url: "/v1/conversations/%XX?token=" + secret,
  })
  error(malformed, 400, "INVALID_INPUT")
  assert.ok(!malformed.body.includes(secret))
  for (const headers of [
    {},
    { origin: frontendOrigin },
    { "access-control-request-method": "GET" },
  ]) {
    const result = await api.app.inject({
      method: "OPTIONS",
      url: "/v1/conversations?token=" + secret,
      headers,
    })
    error(result, 400, "INVALID_INPUT")
    assert.ok(!result.body.includes(secret))
  }
  assert.ok(!api.logs.join("").includes(secret))
  assert.equal(
    (await api.pool.query("SELECT count(*)::int AS count FROM accounts"))
      .rows[0].count,
    0
  )
})
