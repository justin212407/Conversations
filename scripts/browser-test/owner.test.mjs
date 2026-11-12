import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:http"
import { browserOwner } from "../regression/browser.mjs"
import { startFixtureServer } from "../../apps/web/test/browser-server.mjs"
import { privateRunDirectory } from "../regression/runtime.mjs"

test("context microphone accounting includes startup and every fresh document without owner audio", async () => {
  const owned = await privateRunDirectory(),
    abort = new AbortController()
  const server = createServer((_req, res) =>
    res.end("<!doctype html><title>Owned browser boundary</title>")
  )
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = "http://127.0.0.1:" + server.address().port
  let owner,
    failed = false
  try {
    owner = await browserOwner(owned, abort.signal)
    await owner.launch()
    const runtime = await owner.context([origin])
    const page = await runtime.context.newPage()
    await page.goto(origin)
    await page.evaluate(() =>
      globalThis.navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => {})
    )
    assert.equal(runtime.counts().microphoneRequests, 1)
    await page.reload()
    await page.evaluate(() =>
      globalThis.navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => {})
    )
    assert.equal(runtime.counts().microphoneRequests, 2)
    assert.throws(runtime.verify)
    await runtime.context.close()
  } catch {
    failed = true
  } finally {
    let clean = false
    try {
      clean = await owner?.cleanup()
    } catch {
      clean = false
    }
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await owned.remove()
    assert.equal(clean, true)
  }
  assert.equal(failed, false, "Owned browser microphone verification failed")
})

test("standalone fixture uses real Next browser SDK with Next client runtime/process semantics", async () => {
  const owned = await privateRunDirectory(),
    abort = new AbortController()
  let server,
    owner,
    failed = false
  try {
    server = await startFixtureServer({
      directory: owned.directory,
      service: true,
    })
    owner = await browserOwner(owned, abort.signal)
    await owner.launch()
    const runtime = await owner.context([server.origin])
    await runtime.context.exposeBinding("regressionToken", () => null)
    await runtime.context.addInitScript(() => {
      globalThis.regressionConfig = { apiUrl: "http://127.0.0.1:1" }
    })
    const page = await runtime.context.newPage()
    await page.goto(server.origin)
    await page.waitForFunction(() => globalThis.serviceFixture?.documentId)
    await page.waitForFunction(
      () => globalThis.serviceFixture.store.snapshot().account === "error"
    )
    const result = await page.evaluate(() =>
      globalThis.serviceFixture.diagnostics()
    )
    assert.equal(result.enabledEnvelopes, 4)
    assert.equal(result.disabledEnvelopes, 0)
    runtime.verify()
    await runtime.context.close()
  } catch {
    failed = true
  } finally {
    let browserClean = false,
      serverClean = false
    try {
      browserClean = await owner?.cleanup()
    } catch {
      browserClean = false
    }
    try {
      serverClean = await server?.close()
    } catch {
      serverClean = false
    }
    await owned.remove()
    assert.equal(browserClean, true)
    assert.equal(serverClean, true)
  }
  assert.equal(failed, false, "Standalone browser/SDK verification failed")
})
