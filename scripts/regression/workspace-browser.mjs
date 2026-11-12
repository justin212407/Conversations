import { URL } from "node:url"
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID, randomBytes } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { startFixtureServer } from "../../apps/web/test/browser-server.mjs"
import checkRenderer from "../../apps/web/test/browser-check.mjs"
import { browserOwner } from "./browser.mjs"
import { token, contextDigest } from "./lifecycle.mjs"
import { GateFailure, boundedFetch, until } from "./runtime.mjs"

const resources = new WeakMap()
export async function prepareWorkspaceBrowser(owned, context) {
  const rendererFolder = join(owned.directory, "renderer"),
    serviceFolder = join(owned.directory, "service")
  await mkdir(rendererFolder, { mode: 0o700 })
  await mkdir(serviceFolder, { mode: 0o700 })
  const renderer = await startFixtureServer({ directory: rendererFolder })
  context.own(() => renderer.close())
  await owned.releasePorts("browser")
  const service = await startFixtureServer({
    directory: serviceFolder,
    port: owned.ports.browser,
    service: true,
  })
  context.own(() => service.close())
  assert.equal(service.origin, "http://127.0.0.1:" + owned.ports.browser)
  const browser = await browserOwner(owned, context.signal)
  context.own(() => browser.cleanup())
  resources.set(owned, { renderer, service, browser })
}

export async function verifyWorkspaceBrowser(
  owned,
  docker,
  { signal, setStage, fault }
) {
  const { renderer, service, browser: owner } = resources.get(owned)
  const apiUrl = "http://127.0.0.1:" + owned.ports.api
  const rtUrl = "http://127.0.0.1:" + owned.ports.realtime
  const checks = {}
  const stage = (value) => {
    setStage(value)
    if (signal.aborted) throw new GateFailure(value, "interrupted")
  }
  stage("browser-launch")
  await owner.launch()
  if (fault === "browser-after-launch")
    throw new GateFailure("browser-fault-assertion", "assertion")
  if (fault === "browser-deadline")
    await until("browser-fault-deadline", () => false, {
      timeoutMs: 50,
      intervalMs: 10,
      signal,
    })
  if (fault === "browser-sigint" || fault === "browser-sigterm") {
    process.kill(process.pid, fault === "browser-sigint" ? "SIGINT" : "SIGTERM")
    await delay(20)
    throw new GateFailure("browser-fault-signal", "interrupted")
  }
  stage("browser-renderer")
  const rendered = await owner.context([renderer.origin])
  const rendererPage = await rendered.context.newPage()
  await rendererPage.goto(renderer.origin, { waitUntil: "networkidle" })
  await rendererPage
    .getByRole("button", { name: "New conversation", exact: true })
    .first()
    .waitFor()
  const rendererChecks = await checkRenderer(rendererPage, {
    capture: (page, name) => owner.capture(page, "renderer-" + name),
  })
  assert.equal(rendererChecks.checks.length, 8)
  rendered.verify()
  await rendered.context.close()
  checks.rendererFlows = 8
  stage("browser-service-readiness")
  for (const name of ["api", "worker", "realtime"])
    await until(
      "browser-service-readiness",
      async () =>
        (
          await boundedFetch(
            "http://127.0.0.1:" + owned.ports[name] + "/health/ready"
          )
        ).ok,
      { signal, timeoutMs: 90000 }
    )
  const runtime = await owner.context([service.origin, apiUrl, rtUrl])
  const traceId = randomBytes(16).toString("hex")
  await runtime.context.setExtraHTTPHeaders({
    traceparent: "00-" + traceId + "-" + randomBytes(8).toString("hex") + "-01",
  })
  let bobGate,
    bobResolve,
    refreshed = false
  const privateValues = new Set([
    owned.credentials.metrics,
    owned.credentials.database,
    owned.credentials.realtime,
    "PRIVATE_PROVIDER_EXCEPTION_CANARY",
  ])
  const sockets = [],
    closedSockets = new Set(),
    frames = []
  const canary = "PRIVATE_BROWSER_TRANSCRIPT_" + randomUUID()
  privateValues.add(canary)
  const titleCanary = "PRIVATE_BROWSER_TITLE_" + randomUUID()
  privateValues.add(titleCanary)
  await runtime.context.exposeBinding(
    "regressionToken",
    async (_source, actor, revision) => {
      assert.ok(
        [
          "alice",
          "bob",
          "expired",
          "pending",
          "wrongazp",
          "invalid",
          "missing",
        ].includes(actor)
      )
      if (actor === "bob" && bobGate) await bobGate
      if (revision > 0) refreshed = true
      if (actor === "missing") return null
      if (actor === "invalid") return "invalid"
      const extra = {
        jti: randomUUID(),
        ...(actor === "expired"
          ? { exp: Math.floor(Date.now() / 1000) - 60 }
          : {}),
        ...(actor === "pending" ? { sts: "pending" } : {}),
      }
      const jwt = token(
        owned.signing,
        "browser_" + actor,
        extra,
        actor === "wrongazp" ? "http://untrusted.invalid" : service.origin
      )
      privateValues.add(jwt)
      return jwt
    }
  )
  await runtime.context.addInitScript(
    ({ apiUrl }) => {
      globalThis.regressionConfig = { apiUrl }
    },
    { apiUrl }
  )
  await runtime.context.addInitScript(() => {
    const original = globalThis.fetch.bind(globalThis)
    const delayed = {
      armed: false,
      held: false,
      delivered: false,
      text: "",
      release: () => {},
    }
    globalThis.regressionDelay = delayed
    globalThis.fetch = async (...args) => {
      const response = await original(...args)
      const url = new URL(String(args[0]), globalThis.location.href)
      if (
        delayed.armed &&
        url.pathname === "/v1/conversations" &&
        (!args[1]?.method || args[1].method === "GET")
      ) {
        delayed.armed = false
        delayed.text = await response.clone().text()
        await new Promise((resolve) => {
          delayed.release = resolve
          delayed.held = true
        })
        delayed.delivered = true
      }
      return response
    }
  })
  const page = await runtime.context.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })
  page.on("websocket", (socket) => {
    sockets.push(socket)
    const ticket = new URL(socket.url()).searchParams.get("ticket")
    if (ticket) privateValues.add(ticket)
    socket.on("close", () => closedSockets.add(socket))
    socket.on("framereceived", (event) => {
      try {
        frames.push(JSON.parse(String(event.payload)))
      } catch {
        owner.captureRaw("frame-parse", "Invalid frame")
      }
    })
  })
  const state = () =>
    page.evaluate(() => globalThis.serviceFixture.store.snapshot())
  async function fresh(path) {
    const previous = await page
      .evaluate(() => globalThis.serviceFixture?.documentId)
      .catch(() => null)
    if (path)
      await page.goto(service.origin + path, { waitUntil: "domcontentloaded" })
    else await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForFunction(
      (previous) =>
        globalThis.serviceFixture &&
        globalThis.serviceFixture.documentId !== previous,
      previous
    )
    await page.waitForFunction(
      () => globalThis.serviceFixture.store.snapshot().account === "ready"
    )
  }
  async function settled() {
    await page.waitForFunction(() => {
      const s = globalThis.serviceFixture.store.snapshot()
      return (
        s.phase === "live" && !s.sending && !s.conversation?.activeOperation
      )
    })
  }
  async function rows() {
    return page.evaluate(() => globalThis.serviceFixture.displayed())
  }
  async function send(content) {
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill(content)
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .press("Control+Enter")
  }
  async function native(method, path, body, actor = "alice") {
    return page.evaluate(
      async ({ method, path, body, actor }) => {
        const jwt = await globalThis.regressionToken(actor, 0)
        const response = await fetch(
          globalThis.regressionConfig.apiUrl + path,
          {
            method,
            headers: {
              ...(jwt ? { authorization: "Bearer " + jwt } : {}),
              ...(body ? { "content-type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }
        )
        return { status: response.status, body: await response.json() }
      },
      { method, path, body, actor }
    )
  }
  async function providerCount() {
    const text = await (
      await boundedFetch(
        "http://127.0.0.1:" + owned.ports.worker + "/metrics",
        { headers: { authorization: "Bearer " + owned.credentials.metrics } }
      )
    ).text()
    return text
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("conversations_operations_total{") &&
          line.includes('stage="provider.generate"')
      )
      .reduce((n, line) => n + Number(line.split(" ").at(-1)), 0)
  }
  function assertAnswer(messages, content) {
    const last = messages.filter((row) => row.role === "assistant").at(-1)
    assert.equal(last.state, "completed")
    assert.equal(
      last.content,
      contextDigest([
        ...messages.filter(
          (row) => row.state === "completed" && row.id !== last.id
        ),
      ])
    )
    assert.equal(
      messages.filter((row) => row.role === "user" && row.content === content)
        .length,
      1
    )
    privateValues.add(last.content)
  }
  await fresh("/conversations")
  stage("browser-text-stream")
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .first()
    .click()
  await page.waitForFunction(
    () => globalThis.serviceFixture.store.snapshot().phase === "live"
  )
  const id = (await state()).selectedId
  await page
    .getByRole("button", { name: "Conversation actions", exact: true })
    .click()
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill(titleCanary)
  await page.getByRole("button", { name: "Save title", exact: true }).click()
  await page.getByRole("heading", { name: titleCanary, exact: true }).waitFor()
  await send(canary)
  await page.waitForFunction(() =>
    globalThis.serviceFixture
      .displayed()
      .some((row) => row.role === "assistant" && row.state === "streaming")
  )
  await settled()
  let messages = await rows()
  assertAnswer(messages, canary)
  assert.ok(frames.some((frame) => frame.type === "message.snapshot"))
  const first = messages.map((row) => ({
    id: row.id,
    content: row.content,
    sequence: row.sequence,
  }))
  checks.provisionalAndDurable = true
  stage("browser-reload-context")
  await fresh()
  await settled()
  assert.deepEqual(
    (await rows()).map((row) => ({
      id: row.id,
      content: row.content,
      sequence: row.sequence,
    })),
    first
  )
  await fresh("/conversations")
  await page.getByRole("link", { name: titleCanary, exact: true }).click()
  await settled()
  assert.deepEqual(
    (await rows()).map((row) => row.id),
    first.map((row) => row.id)
  )
  await send("Continue " + canary)
  await settled()
  messages = await rows()
  assert.equal(messages.length, 4)
  assertAnswer(messages, "Continue " + canary)
  checks.reloadReopenExactContext = true
  stage("browser-failure-retry")
  await send("REGRESSION_FAIL_ONCE:" + canary)
  await page
    .getByText("The response could not be completed.", { exact: true })
    .waitFor()
  await fresh()
  await settled()
  const beforeRetry = await rows(),
    failed = beforeRetry.find((row) => row.state === "failed")
  assert.ok(failed.operationId)
  privateValues.add(failed.content)
  await page
    .getByRole("button", { name: "Retry response", exact: true })
    .click()
  await settled()
  messages = await rows()
  assertAnswer(messages, "REGRESSION_FAIL_ONCE:" + canary)
  assert.equal(messages.filter((row) => row.role === "user").length, 3)
  assert.equal(messages.find((row) => row.id === failed.id).state, "failed")
  checks.failedReloadRetry = true
  async function assertStoredAdmission(admission, request, terminal = false) {
    for (const value of [
      id,
      request.clientRequestId,
      admission.operationId,
      admission.userMessageId,
      admission.assistantMessageId,
    ])
      assert.match(value, /^[a-f0-9-]{36}$/)
    const op = admission.operationId,
      user = admission.userMessageId,
      assistant = admission.assistantMessageId
    const sql = `SELECT (SELECT count(*) FROM operations WHERE id='${op}'::uuid AND conversation_id='${id}'::uuid AND client_request_id='${request.clientRequestId}'::uuid AND input_message_id='${user}'::uuid AND assistant_message_id='${assistant}'::uuid),(SELECT count(*) FROM messages WHERE id='${user}'::uuid AND conversation_id='${id}'::uuid AND role='user'),(SELECT count(*) FROM messages WHERE id='${assistant}'::uuid AND conversation_id='${id}'::uuid AND role='assistant'),(SELECT count(*) FROM handoffs WHERE kind='job' AND operation_id='${op}'::uuid),(SELECT count(*) FROM handoffs WHERE kind='event' AND conversation_id='${id}'::uuid AND type IN ('message.completed','message.failed') AND payload->'payload'->'message'->>'id'='${assistant}' AND payload->'payload'->'message'->>'operationId'='${op}');`
    const persisted = await docker.command(
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
      "browser-admission-identities"
    )
    const counts = persisted.output.trim().split("|")
    assert.deepEqual(counts.slice(0, 4), ["1", "1", "1", "1"])
    assert.ok(terminal ? counts[4] === "1" : ["0", "1"].includes(counts[4]))
  }
  async function loseAcknowledgement(content) {
    let admission, request, routeError
    const pattern = "**/v1/conversations/" + id + "/messages"
    const handler = async (route) => {
      if (admission) return route.continue()
      try {
        request = route.request().postDataJSON()
        assert.equal(
          (await route.request().allHeaders()).origin,
          service.origin
        )
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 })
        assert.equal(response.status(), 202)
        admission = await response.json()
        await assertStoredAdmission(admission, request)
      } catch (error) {
        routeError = error
        owner.captureRaw("lost-ack", error.stack)
      }
      await route.abort("failed").catch(() => {})
    }
    await runtime.context.route(pattern, handler)
    await send(content)
    await page.waitForFunction(() => {
      const s = globalThis.serviceFixture.store.snapshot()
      return s.intent && !s.sending
    })
    if (routeError)
      throw new GateFailure("browser-committed-admission", "assertion")
    assert.ok(admission)
    assert.equal(
      (await state()).intent.clientRequestId,
      request.clientRequestId
    )
    return {
      admission,
      request,
      remove: () => runtime.context.unroute(pattern, handler),
    }
  }
  stage("browser-lost-ack-refresh")
  const beforeLost = await providerCount()
  const lost = await loseAcknowledgement("Lost acknowledgement " + canary)
  await page.evaluate(() => {
    globalThis.retainedStore = globalThis.serviceFixture.store
    globalThis.serviceFixture.refresh()
  })
  await page.evaluate(() => globalThis.serviceFixture.store.refreshList())
  assert.ok(refreshed)
  assert.equal(
    await page.evaluate(
      () => globalThis.retainedStore === globalThis.serviceFixture.store
    ),
    true
  )
  assert.equal(
    (await state()).intent.clientRequestId,
    lost.request.clientRequestId
  )
  await fresh()
  await settled()
  assert.equal(
    (await state()).intent.clientRequestId,
    lost.request.clientRequestId
  )
  const completedLost = (await rows()).find(
    (row) => row.id === lost.admission.assistantMessageId
  )
  assert.equal(completedLost.state, "completed")
  let replay
  const observe = async (response) => {
    if (
      response.request().method() === "POST" &&
      response.url().endsWith("/messages") &&
      response.status() === 202
    )
      replay = await response.json()
  }
  page.on("response", observe)
  await page
    .getByRole("button", { name: "Check delivery", exact: true })
    .click()
  await page.waitForFunction(
    () => !globalThis.serviceFixture.store.snapshot().intent
  )
  page.off("response", observe)
  await lost.remove()
  await until("browser-replay-identities", () => replay, { signal })
  for (const key of [
    "operationId",
    "conversationId",
    "userMessageId",
    "assistantMessageId",
  ])
    assert.equal(replay[key], lost.admission[key])
  await until(
    "browser-provider-count",
    async () => (await providerCount()) === beforeLost + 1,
    { signal }
  )
  messages = await rows()
  assert.equal(
    messages.filter((row) => row.content === lost.request.content).length,
    1
  )
  await assertStoredAdmission(lost.admission, lost.request, true)
  privateValues.add(completedLost.content)
  checks.committedAckReloadReplay = true
  checks.sameUserRefreshPreservesIntent = true
  stage("browser-real-reconnect")
  await docker.command(["stop", "realtime"], "browser-realtime-stop", 30000)
  await page.waitForFunction(
    () => globalThis.serviceFixture.store.snapshot().phase !== "live"
  )
  const rename = await native("PATCH", "/v1/conversations/" + id, {
    title: "Browser reconciled title",
  })
  assert.equal(rename.status, 200)
  await docker.command(["start", "realtime"], "browser-realtime-start", 30000)
  await until(
    "browser-reconnect",
    async () => {
      const s = await state()
      return (
        s.phase === "live" &&
        s.conversation.conversation.title === "Browser reconciled title"
      )
    },
    { signal }
  )
  assert.ok(sockets.length >= 2)
  assert.equal(
    new Set((await rows()).map((row) => row.id)).size,
    (await rows()).length
  )
  checks.actualSocketRecovery = true
  stage("browser-ownership-sessions")
  for (const actor of ["missing", "invalid", "expired", "pending", "wrongazp"])
    assert.equal((await native("GET", "/v1/me", undefined, actor)).status, 401)
  for (const path of [
    "/v1/conversations/" + id,
    "/v1/conversations/" + id + "/snapshot",
    "/v1/conversations/" + id + "/messages",
  ])
    assert.equal((await native("GET", path, undefined, "bob")).status, 404)
  assert.equal(
    (
      await native(
        "POST",
        "/v1/realtime-tickets",
        { conversationId: id },
        "bob"
      )
    ).status,
    404
  )
  assert.equal(
    (
      await native(
        "PATCH",
        "/v1/conversations/" + id,
        { title: "foreign" },
        "bob"
      )
    ).status,
    404
  )
  const unresolved = await loseAcknowledgement("Scoped unresolved " + canary)
  await page.evaluate(() => {
    globalThis.retainedStore = globalThis.serviceFixture.store
  })
  await page.evaluate(() => {
    globalThis.regressionDelay.armed = true
    void globalThis.serviceFixture.store.refreshList()
  })
  await page.waitForFunction(() => globalThis.regressionDelay.held)
  assert.ok(
    await page.evaluate(
      (title) => globalThis.regressionDelay.text.includes(title),
      "Browser reconciled title"
    )
  )
  bobGate = new Promise((resolve) => {
    bobResolve = resolve
  })
  const priorSockets = [...sockets]
  await page.evaluate(() => globalThis.serviceFixture.identity("bob"))
  await page.waitForFunction(
    () => globalThis.serviceFixture.store !== globalThis.retainedStore
  )
  assert.equal((await state()).accountId, null)
  assert.equal((await state()).draft, "")
  assert.equal((await state()).intent, null)
  assert.equal((await rows()).length, 0)
  assert.equal(
    await page.evaluate(() => globalThis.retainedStore.snapshot().accountId),
    null
  )
  bobResolve()
  bobGate = null
  await page.waitForFunction(
    () => globalThis.serviceFixture.store.snapshot().phase === "unavailable"
  )
  assert.equal((await rows()).length, 0)
  assert.equal((await state()).draft, "")
  await page.evaluate(() => globalThis.regressionDelay.release())
  await page.waitForFunction(() => globalThis.regressionDelay.delivered)
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.requestAnimationFrame(() =>
          globalThis.requestAnimationFrame(resolve)
        )
      )
  )
  assert.equal((await rows()).length, 0)
  assert.ok((await state()).conversations.every((item) => item.id !== id))
  assert.equal(
    await page.evaluate(() => globalThis.retainedStore.snapshot().accountId),
    null
  )
  await until(
    "browser-old-socket-stopped",
    () => priorSockets.every((socket) => closedSockets.has(socket)),
    { signal }
  )
  await unresolved.remove()
  await page.evaluate(() => globalThis.serviceFixture.identity("expired"))
  await page.waitForFunction(
    () => globalThis.serviceFixture.store.snapshot().account === "error"
  )
  assert.equal((await rows()).length, 0)
  await page.evaluate(() => globalThis.serviceFixture.identity("alice"))
  await settled()
  assert.equal(
    (await state()).intent.clientRequestId,
    unresolved.request.clientRequestId
  )
  await page
    .getByRole("button", { name: "Check delivery", exact: true })
    .click()
  await page.waitForFunction(
    () => !globalThis.serviceFixture.store.snapshot().intent
  )
  checks.ownershipAndSessionScope = true
  stage("browser-diagnostics")
  messages = await rows()
  for (const row of messages) if (row.content) privateValues.add(row.content)
  const browserDiagnostics = await page.evaluate(
    ({ canary, privateValues }) =>
      globalThis.serviceFixture.diagnostics(canary, privateValues),
    { canary, privateValues: [...privateValues] }
  )
  assert.equal(browserDiagnostics.enabledEnvelopes, 4)
  assert.equal(browserDiagnostics.disabledEnvelopes, 0)
  const logs = await docker.command(
    ["logs", "--no-color", "api", "worker", "realtime"],
    "browser-diagnostic-privacy"
  )
  let diagnostics = logs.output + logs.errors
  for (const name of ["api", "worker", "realtime"]) {
    const response = await boundedFetch(
      "http://127.0.0.1:" + owned.ports[name] + "/metrics",
      { headers: { authorization: "Bearer " + owned.credentials.metrics } }
    )
    assert.equal(response.status, 200)
    diagnostics += await response.text()
  }
  const trace = await until(
    "browser-exported-trace",
    async () => {
      const response = await boundedFetch(
        "http://127.0.0.1:" + owned.ports.jaeger + "/api/v3/traces/" + traceId
      )
      if (!response.ok) return false
      const raw = await response.text()
      return raw.includes("provider.generate") ? raw : false
    },
    { signal, timeoutMs: 60000 }
  )
  diagnostics += trace
  for (const value of privateValues) assert.ok(!diagnostics.includes(value))
  await assertStoredAdmission(unresolved.admission, unresolved.request, true)
  assert.equal(await providerCount(), 6)
  checks.providerCalls = 6
  const width = await page.evaluate(() => ({
    width: globalThis.innerWidth,
    scroll: globalThis.document.documentElement.scrollWidth,
  }))
  assert.ok(width.scroll <= width.width + 1)
  assert.equal(runtime.counts().microphoneRequests, 0)
  runtime.verify()
  await runtime.context.close()
  checks.browserDiagnosticPrivacy = true
  checks.microphoneRequests = 0
  return checks
}
