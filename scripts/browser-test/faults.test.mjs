import assert from "node:assert/strict"
import { test, before, after } from "node:test"
import { fileURLToPath, URL } from "node:url"
import { childEnvironment, run } from "../regression/runtime.mjs"
import { createSentinel } from "./sentinel.mjs"

let sentinel
before(async () => {
  sentinel = await createSentinel()
})
after(async () => {
  assert.equal(
    await sentinel?.cleanup(),
    true,
    "Independent fault sentinel cleanup failed"
  )
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
        await sentinel.verify()
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
