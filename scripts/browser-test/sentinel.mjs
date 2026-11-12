import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { browserOwner } from "../regression/browser.mjs"
import { privateRunDirectory, boundedFetch } from "../regression/runtime.mjs"

// Separate parent resources must survive every fault child. Never an owner profile.
export async function createSentinel() {
  const owned = await privateRunDirectory()
  let http, owner, runtime, page, origin, file
  const cleanup = async () => {
    let clean = true
    try {
      if (owner && !(await owner.cleanup())) clean = false
    } catch {
      clean = false
    }
    try {
      if (http) {
        http.closeAllConnections()
        await new Promise((resolve) => http.close(resolve))
      }
    } catch {
      clean = false
    }
    try {
      await owned.remove()
    } catch {
      clean = false
    }
    return clean
  }
  const verify = async () => {
    assert.equal(await readFile(file, "utf8"), "independent-owned-sentinel")
    assert.equal((await boundedFetch(origin)).status, 200)
    assert.equal(await page.title(), "Independent sentinel")
    runtime.verify()
  }
  try {
    file = await owned.write("sentinel", "independent-owned-sentinel")
    http = createServer((_req, res) =>
      res.end("<!doctype html><title>Independent sentinel</title>")
    )
    await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve))
    origin = "http://127.0.0.1:" + http.address().port
    owner = await browserOwner(owned, new AbortController().signal)
    await owner.launch()
    runtime = await owner.context([origin])
    page = await runtime.context.newPage()
    await page.goto(origin)
    await verify()
    return { verify, cleanup }
  } catch {
    await cleanup()
    throw Error("Independent fault sentinel setup failed")
  }
}
