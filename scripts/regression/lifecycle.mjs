import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID, sign } from "node:crypto"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"
import { URL } from "node:url"
import { boundedFetch, until, GateFailure, json } from "./runtime.mjs"
import { createConversationConnection } from "../../packages/shared/dist/index.js"

const { WebSocket } = createRequire(
  new URL("../../apps/realtime/package.json", import.meta.url)
)("ws")
const origin = "http://localhost:3000",
  issuer = "https://regression.clerk.accounts.dev"
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function contextDigest(messages) {
  return (
    "Context digest: " +
    createHash("sha256")
      .update(
        JSON.stringify(
          messages
            .filter((m) => m.state === undefined || m.state === "completed")
            .map(({ role, content }) => ({ role, content }))
        )
      )
      .digest("hex")
  )
}
function token(signing, actor, extra = {}) {
  const now = Math.floor(Date.now() / 1000),
    enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const unsigned =
    enc({ alg: "RS256", typ: "JWT", kid: "service-regression" }) +
    "." +
    enc({
      sub: "user_regression_" + actor,
      sid: "sess_regression_" + actor,
      sts: "active",
      iss: issuer,
      azp: origin,
      iat: now,
      nbf: now - 1,
      exp: now + 600,
      ...extra,
    })
  return (
    unsigned +
    "." +
    sign("RSA-SHA256", Buffer.from(unsigned), signing.privateKey).toString(
      "base64url"
    )
  )
}
export async function verifyLifecycle(owned, docker, { signal, setStage }) {
  const checks = {},
    canary = "PRIVATE_REGRESSION_TRANSCRIPT_" + randomUUID(),
    credentials = {
      alice: token(owned.signing, "alice"),
      bob: token(owned.signing, "bob"),
      expired: token(owned.signing, "alice", {
        exp: Math.floor(Date.now() / 1000) - 30,
      }),
      pending: token(owned.signing, "alice", { sts: "pending" }),
    }
  const address = (service) => "http://127.0.0.1:" + owned.ports[service]
  let connection,
    frames = []
  const allFrames = [],
    tickets = new Set()
  const stage = (name) => {
    setStage(name)
    if (signal?.aborted) throw new GateFailure(name, "interrupted")
  }
  async function request(
    method,
    path,
    expected = 200,
    body,
    actor = "alice",
    headers = {}
  ) {
    const response = await boundedFetch(address("api") + path, {
      method,
      headers: {
        ...(credentials[actor]
          ? { authorization: "Bearer " + credentials[actor] }
          : {}),
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response.status !== expected)
      throw new GateFailure("api-status", "invalid_result")
    return expected === 204 ? undefined : response.json()
  }
  async function ready(services = ["api", "worker", "realtime"]) {
    for (const service of services)
      await until(
        "service-readiness",
        async () => (await boundedFetch(address(service) + "/health/ready")).ok,
        { timeoutMs: 90000, signal }
      )
  }
  async function connect(id) {
    connection?.stop()
    frames = []
    connection = createConversationConnection({
      apiUrl: address("api"),
      conversationId: id,
      getToken: async () => credentials.alice,
      random: () => 0,
      onChange() {},
      createSocket(url) {
        const ticket = new URL(url).searchParams.get("ticket")
        if (ticket) tickets.add(ticket)
        const ws = new WebSocket(url, { origin })
        ws.on("error", () => {})
        ws.on("message", (raw) => {
          const frame = JSON.parse(raw.toString())
          frames.push(frame)
          allFrames.push(frame)
        })
        return ws
      },
      fetch: (url, init) =>
        boundedFetch(url, { ...init, headers: { ...init.headers, origin } }),
    })
    connection.start()
    await until(
      "socket-reconciliation",
      () => connection.current().phase === "live",
      { signal }
    )
  }
  async function history(id) {
    return (await request("GET", `/v1/conversations/${id}/messages?limit=100`))
      .items
  }
  async function terminal(id, admission, state) {
    await until(
      "durable-terminal",
      () =>
        connection
          .current()
          .state.messages.find(
            (m) => m.id === admission.assistantMessageId && m.state === state
          ),
      { signal }
    )
    const messages = await history(id),
      row = messages.find((m) => m.id === admission.assistantMessageId)
    assert.equal(row?.state, state)
    assert.equal(row.operationId, admission.operationId)
    return messages
  }
  const input = (content) => ({ clientRequestId: randomUUID(), content })
  const operations = []
  async function submit(id, body, correlation = {}) {
    const admitted = await request(
      "POST",
      `/v1/conversations/${id}/messages`,
      202,
      body,
      "alice",
      correlation
    )
    operations.push(admitted)
    return admitted
  }
  const assertDigest = (messages, admission, expected) =>
    assert.equal(
      messages.find((m) => m.id === admission.assistantMessageId)?.content,
      expected
    )
  function assertDiagnosticPrivacy(diagnostics, messages) {
    for (const privateValue of [
      canary,
      "PRIVATE_PROVIDER_EXCEPTION_CANARY",
      owned.credentials.metrics,
      owned.credentials.realtime,
      owned.credentials.database,
      ...messages
        .filter((message) => message.role === "assistant" && message.content)
        .map((message) => message.content),
      ...Object.values(credentials),
      ...tickets,
    ])
      assert.ok(!diagnostics.includes(privateValue))
    for (const frame of allFrames)
      if (frame.correlation)
        assert.deepEqual(Object.keys(frame.correlation), ["requestId"])
  }
  try {
    stage("authentication")
    await ready()
    for (const actor of ["missing", "expired", "pending"])
      await request("GET", "/v1/me", 401, undefined, actor)
    await request("GET", "/v1/me", 401, undefined, "missing", {
      authorization: "Bearer invalid",
    })
    const alice = await request("GET", "/v1/me"),
      bob = await request("GET", "/v1/me", 200, undefined, "bob")
    assert.notEqual(alice.id, bob.id)
    const conversation = await request("POST", "/v1/conversations", 201, {
      title: canary,
    })
    for (const path of [
      `/v1/conversations/${conversation.id}`,
      `/v1/conversations/${conversation.id}/snapshot`,
      `/v1/conversations/${conversation.id}/messages`,
    ])
      await request("GET", path, 404, undefined, "bob")
    await request(
      "PATCH",
      `/v1/conversations/${conversation.id}`,
      404,
      { title: "foreign" },
      "bob"
    )
    await request(
      "POST",
      "/v1/realtime-tickets",
      404,
      { conversationId: conversation.id },
      "bob"
    )
    checks.authIsolation = true
    stage("text-success")
    await connect(conversation.id)
    const firstBody = input(canary),
      first = await submit(conversation.id, firstBody)
    let messages = await terminal(conversation.id, first, "completed")
    assertDigest(
      messages,
      first,
      contextDigest([{ role: "user", content: firstBody.content }])
    )
    assert.ok(
      frames.some(
        (frame) =>
          frame.type === "message.snapshot" &&
          frame.payload.messageId === first.assistantMessageId
      )
    )
    const replay = await request(
      "POST",
      `/v1/conversations/${conversation.id}/messages`,
      202,
      firstBody
    )
    assert.equal(replay.operationId, first.operationId)
    await delay(350)
    const firstMetrics = await boundedFetch(address("worker") + "/metrics", {
      headers: { authorization: "Bearer " + owned.credentials.metrics },
    })
    const firstProviderLines = (await firstMetrics.text())
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("conversations_operations_total{") &&
          line.includes('stage="provider.generate"')
      )
    assert.equal(
      firstProviderLines.reduce(
        (n, line) => n + Number(line.split(" ").at(-1)),
        0
      ),
      1
    )
    checks.streamingAndReplay = true
    stage("reopen-context")
    connection.stop()
    await docker.command(
      ["restart", "api", "worker", "realtime"],
      "service-restart",
      60000
    )
    await ready()
    await connect(conversation.id)
    assert.equal(
      connection
        .current()
        .state.messages.filter((m) => m.id === first.assistantMessageId).length,
      1
    )
    const secondBody = input("Continue " + canary),
      expectedSecond = contextDigest([
        ...messages.filter((m) => m.state === "completed"),
        { role: "user", content: secondBody.content },
      ])
    const second = await submit(conversation.id, secondBody)
    messages = await terminal(conversation.id, second, "completed")
    assertDigest(messages, second, expectedSecond)
    checks.persistedContextAfterRestart = true
    stage("failure-retry")
    const traceId = randomBytes(16).toString("hex")
    const failureBody = input("REGRESSION_FAIL_ONCE:" + canary),
      expectedRetry = contextDigest([
        ...messages.filter((m) => m.state === "completed"),
        { role: "user", content: failureBody.content },
      ])
    const failed = await submit(conversation.id, failureBody, {
      traceparent:
        "00-" + traceId + "-" + randomBytes(8).toString("hex") + "-01",
      tracestate: "secret=" + canary,
      baggage: "secret=" + canary,
      "x-request-id": canary,
    })
    messages = await terminal(conversation.id, failed, "failed")
    assert.equal(
      messages.find((m) => m.id === failed.assistantMessageId).failureCode,
      "provider_error"
    )
    await connect(conversation.id)
    const discovered = connection
      .current()
      .state.messages.find((m) => m.id === failed.assistantMessageId)
    assert.equal(discovered.operationId, failed.operationId)
    const retryBody = { clientRequestId: randomUUID() },
      retry = await request(
        "POST",
        `/v1/conversations/${conversation.id}/operations/${discovered.operationId}/retry`,
        202,
        retryBody
      )
    operations.push(retry)
    assert.equal(retry.userMessageId, failed.userMessageId)
    assert.notEqual(retry.assistantMessageId, failed.assistantMessageId)
    messages = await terminal(conversation.id, retry, "completed")
    assertDigest(messages, retry, expectedRetry)
    const retryReplay = await request(
      "POST",
      `/v1/conversations/${conversation.id}/operations/${failed.operationId}/retry`,
      202,
      retryBody
    )
    assert.equal(retryReplay.operationId, retry.operationId)
    assert.equal(messages.filter((m) => m.role === "user").length, 3)
    checks.failureRetryWithoutDuplicateUser = true
    stage("socket-recovery")
    await docker.command(["stop", "realtime"], "socket-stop", 30000)
    await until(
      "socket-disconnect",
      () => connection.current().phase !== "live",
      { signal }
    )
    await request("PATCH", `/v1/conversations/${conversation.id}`, 200, {
      title: "Reconciled title",
    })
    await docker.command(["start", "realtime"], "socket-start", 30000)
    await ready(["realtime"])
    await until(
      "socket-recovery",
      () =>
        connection.current().phase === "live" &&
        connection.current().state.conversation?.title === "Reconciled title",
      { signal }
    )
    assert.equal(
      connection
        .current()
        .state.messages.filter((m) => m.id === retry.assistantMessageId).length,
      1
    )
    checks.socketRecovery = true
    stage("diagnostics")
    const trace = await until(
      "jaeger-causality",
      async () => {
        const response = await boundedFetch(
          address("jaeger") + "/api/v3/traces/" + traceId
        )
        if (!response.ok) return false
        const raw = await response.text(),
          packets = raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => json(line, "jaeger-format"))
        const resources = packets.flatMap(
            (packet) => (packet.result ?? packet).resourceSpans ?? []
          ),
          spans = resources.flatMap((resource) =>
            (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? [])
          )
        const finalize = spans.find(
          (span) => span.name === "operation.finalize"
        )
        const publish = spans.find(
          (span) =>
            span.name === "event.publish" &&
            span.parentSpanId === finalize?.spanId
        )
        const delivered =
          publish &&
          spans.some(
            (span) =>
              span.name === "event.deliver" &&
              span.parentSpanId === publish.spanId
          )
        return delivered &&
          [
            "http",
            "command.admit",
            "job.publish",
            "job.execute",
            "provider.generate",
            "operation.finalize",
            "event.publish",
            "event.deliver",
          ].every((name) => spans.some((s) => s.name === name))
          ? { raw, resources, spans }
          : false
      },
      { signal, timeoutMs: 60000 }
    )
    stage("trace-parent-edges")
    const named = (name) => trace.spans.find((span) => span.name === name)
    assert.equal(named("job.execute").parentSpanId, named("job.publish").spanId)
    assert.equal(
      named("provider.generate").parentSpanId,
      named("job.execute").spanId
    )
    assert.equal(
      named("operation.finalize").parentSpanId,
      named("provider.generate").spanId
    )
    stage("trace-failure-status")
    assert.ok(
      [2, "STATUS_CODE_ERROR"].includes(named("provider.generate").status.code)
    )
    stage("trace-terminal-delivery")
    const finalizedPublish = trace.spans.find(
      (span) =>
        span.name === "event.publish" &&
        span.parentSpanId === named("operation.finalize").spanId
    )
    assert.ok(finalizedPublish)
    assert.ok(
      trace.spans.some(
        (span) =>
          span.name === "event.deliver" &&
          span.parentSpanId === finalizedPublish.spanId
      )
    )
    stage("trace-service-resources")
    const names = trace.resources.map(
      (resource) =>
        resource.resource.attributes.find((a) => a.key === "service.name")
          ?.value?.stringValue
    )
    for (const name of [
      "conversations-api",
      "conversations-worker",
      "conversations-realtime",
    ])
      assert.ok(names.includes(name))
    const targets = await until(
      "prometheus-targets",
      async () => {
        const url = new URL("/api/v1/query", address("prom"))
        url.searchParams.set("query", 'up{job="conversations-services"}')
        const result = await (await boundedFetch(url)).json()
        return result.data?.result?.length === 3 &&
          result.data.result.every((row) => row.value[1] === "1")
          ? result.data.result
          : false
      },
      { signal }
    )
    assert.equal(targets.length, 3)
    const metricTexts = []
    for (const service of ["api", "worker", "realtime"]) {
      assert.equal(
        (await boundedFetch(address(service) + "/metrics")).status,
        401
      )
      const result = await boundedFetch(address(service) + "/metrics", {
        headers: { authorization: "Bearer " + owned.credentials.metrics },
      })
      assert.equal(result.status, 200)
      metricTexts.push(await result.text())
    }
    await request("GET", "/v1/me", 401, undefined, "missing", {
      authorization: "Bearer " + owned.credentials.metrics,
    })
    await request(
      "POST",
      "/internal/realtime/check",
      401,
      { connectionId: randomUUID() },
      "missing",
      { authorization: "Bearer " + owned.credentials.metrics }
    )
    stage("provider-counts")
    const providerLines = metricTexts[1]
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("conversations_operations_total{") &&
          line.includes('stage="provider.generate"')
      )
    assert.equal(
      providerLines.reduce((n, line) => n + Number(line.split(" ").at(-1)), 0),
      3
    )
    checks.jaegerStages = 8
    checks.prometheusTargets = 3
    for (const admission of operations)
      for (const id of [
        admission.operationId,
        admission.assistantMessageId,
        conversation.id,
      ])
        assert.match(id, uuid)
    const wanted = operations
      .map(
        (op) =>
          "('" +
          op.operationId +
          "'::uuid,'" +
          op.assistantMessageId +
          "'::uuid)"
      )
      .join(",")
    stage("sql-identities")
    const sql = `WITH wanted(operation_id,message_id) AS (VALUES ${wanted}) SELECT (SELECT count(*) FROM operations o WHERE o.id=w.operation_id AND o.assistant_message_id=w.message_id),(SELECT count(*) FROM handoffs h WHERE h.kind='job' AND h.operation_id=w.operation_id),(SELECT count(*) FROM handoffs h WHERE h.kind='event' AND h.conversation_id='${conversation.id}' AND h.type IN ('message.completed','message.failed') AND h.payload->'payload'->'message'->>'id'=w.message_id::text AND h.payload->'payload'->'message'->>'operationId'=w.operation_id::text) FROM wanted w;`
    const counts = await docker.command(
      [
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "conversations",
        "-d",
        "conversations",
        "-At",
        "-c",
        sql,
      ],
      "sql-identities"
    )
    assert.deepEqual(counts.output.trim().split("\n"), Array(4).fill("1|1|1"))
    checks.distinctOperations = 4
    stage("diagnostic-privacy")
    const logs = await docker.command(
      ["logs", "--no-color", "api", "worker", "realtime"],
      "diagnostic-privacy"
    )
    const diagnostics =
      logs.output + logs.errors + metricTexts.join("") + trace.raw
    assertDiagnosticPrivacy(diagnostics, messages)
    for (const id of [
      conversation.id,
      ...operations.map((op) => op.operationId),
    ])
      assert.ok(!metricTexts.join("").includes(id))
    checks.diagnosticPrivacy = true
    stage("collector-outage")
    await docker.command(
      ["stop", "jaeger", "prometheus"],
      "collector-stop",
      30000
    )
    await ready()
    const afterBody = input("After collector outage " + canary),
      expectedAfter = contextDigest([
        ...messages.filter((m) => m.state === "completed"),
        { role: "user", content: afterBody.content },
      ])
    const after = await submit(conversation.id, afterBody)
    messages = await terminal(conversation.id, after, "completed")
    assertDigest(messages, after, expectedAfter)
    checks.collectorOutagePreservesDomain = true
    connection.stop()
    await until(
      "socket-cleanup",
      async () => {
        const response = await boundedFetch(address("realtime") + "/metrics", {
          headers: { authorization: "Bearer " + owned.credentials.metrics },
        })
        return (await response.text()).includes(
          'conversations_active_connections{service="realtime"} 0'
        )
      },
      { signal }
    )
    stage("graceful-shutdown")
    await docker.command(
      ["stop", "api", "worker", "realtime"],
      "service-stop",
      30000
    )
    const rawState = (
      await docker.command(["ps", "-a", "--format", "json"], "service-exits")
    ).output
    let state
    try {
      const parsed = JSON.parse(rawState)
      state = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      state = rawState
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => json(line, "service-exits"))
    }
    for (const service of ["api", "worker", "realtime"]) {
      const row = state.find((row) => row.Service === service)
      assert.equal(row?.State, "exited")
      assert.equal(Number(row.ExitCode), 0)
    }
    stage("shutdown-diagnostic-privacy")
    const finalLogs = await docker.command(
      ["logs", "--no-color", "api", "worker", "realtime"],
      "shutdown-diagnostic-privacy"
    )
    assertDiagnosticPrivacy(
      finalLogs.output + finalLogs.errors + metricTexts.join("") + trace.raw,
      messages
    )
    checks.gracefulServiceExits = 3
    return checks
  } finally {
    connection?.stop()
    await delay(20)
  }
}
