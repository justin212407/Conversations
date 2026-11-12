import assert from "node:assert/strict"
import { test, before, after } from "node:test"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { browserOwner } from "../regression/browser.mjs"
import { fileURLToPath, URL } from "node:url"
import {
  childEnvironment,
  run,
  privateRunDirectory,
  boundedFetch,
} from "../regression/runtime.mjs"

// This second owned browser/listener/file deliberately belongs to the parent
// test, never to a fault child project or process group. A broad cleanup would
// break these assertions even if the child's own down falsely reported success.
let sentinel
before(async () => {
  const owned = await privateRunDirectory()
  sentinel = { owned }
  let failed = false
  try {
    sentinel.file = await owned.write("sentinel", "independent-owned-sentinel")
    sentinel.http = createServer((_req, res) =>
      res.end("<!doctype html><title>Independent sentinel</title>")
    )
    await new Promise((resolve) =>
      sentinel.http.listen(0, "127.0.0.1", resolve)
    )
    sentinel.origin = "http://127.0.0.1:" + sentinel.http.address().port
    sentinel.owner = await browserOwner(owned, new AbortController().signal)
    await sentinel.owner.launch()
    sentinel.runtime = await sentinel.owner.context([sentinel.origin])
    sentinel.page = await sentinel.runtime.context.newPage()
    await sentinel.page.goto(sentinel.origin)
    await verifySentinel()
  } catch {
    failed = true
  }
  assert.equal(failed, false, "Independent fault sentinel setup failed")
})
async function verifySentinel() {
  assert.equal(
    await readFile(sentinel.file, "utf8"),
    "independent-owned-sentinel"
  )
  assert.equal((await boundedFetch(sentinel.origin)).status, 200)
  assert.equal(await sentinel.page.title(), "Independent sentinel")
  sentinel.runtime.verify()
}
after(async () => {
  let clean = true
  try {
    if (sentinel?.owner && !(await sentinel.owner.cleanup())) clean = false
  } catch {
    clean = false
  }
  try {
    if (sentinel?.http) {
      sentinel.http.closeAllConnections()
      await new Promise((resolve) => sentinel.http.close(resolve))
    }
  } catch {
    clean = false
  }
  try {
    await sentinel?.owned.remove()
  } catch {
    clean = false
  }
  assert.equal(clean, true, "Independent fault sentinel cleanup failed")
})

for (const [fault, stage, code] of [
  ["browser-after-launch", "browser-fault-assertion", "assertion"],
  ["browser-deadline", "browser-fault-deadline", "command_timeout"],
  ["browser-sigint", "browser-fault-signal", "interrupted"],
  ["browser-sigterm", "browser-fault-signal", "interrupted"],
])
  test(
    "actual owned browser/Docker cleanup: " + fault,
    { timeout: 720000 },
    async () => {
      // Inner fault setup stops after five minutes. The process runner grants its
      // idempotent browser/Docker finally a bounded extra three minutes before hard kill.
      const result = await run(
        process.execPath,
        [
          fileURLToPath(
            new URL("../check-workspace-browser.mjs", import.meta.url)
          ),
          "--fault=" + fault,
        ],
        {
          env: { ...childEnvironment(), TMPDIR: "/tmp" },
          stage: "browser-fault-child",
          timeoutMs: 480000,
          terminationGraceMs: 180000,
          maxBytes: 65536,
          acceptExitCodes: [1, 130],
        }
      )
      let report
      try {
        report = JSON.parse(result.output.trim())
      } catch {
        assert.fail("Missing safe browser fault summary")
      }
      assert.equal(report.status, "failed")
      assert.equal(report.stage, stage)
      assert.equal(report.code, code)
      assert.equal(report.cleanup, true)
      let preserved = false
      try {
        await verifySentinel()
        preserved = true
      } catch {
        preserved = false
      }
      assert.equal(
        preserved,
        true,
        "Independent browser/listener/file sentinel was changed"
      )
    }
  )
