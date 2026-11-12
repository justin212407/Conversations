import assert from "node:assert/strict"
import { test, before, after } from "node:test"
import { fileURLToPath, URL } from "node:url"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setTimeout as delay } from "node:timers/promises"
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
    "Independent setup sentinel cleanup failed"
  )
})
for (const [fault, stage, code] of [
  ["fixture-after-bundle", "fixture-fault-assertion", "assertion"],
  ["fixture-deadline", "fixture-build-deadline", "command_timeout"],
  ["fixture-sigint", "fixture-build", "interrupted"],
  ["fixture-sigterm", "fixture-build", "interrupted"],
])
  test(
    "actual bounded fixture preparation: " + fault,
    { timeout: 240000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "wbr-"))
      try {
        const result = await run(
          process.execPath,
          [
            fileURLToPath(
              new URL("../check-workspace-browser.mjs", import.meta.url)
            ),
            "--fault=" + fault,
          ],
          {
            env: { ...childEnvironment(), TMPDIR: root },
            stage: "fixture-setup-child",
            timeoutMs: 180000,
            terminationGraceMs: 30000,
            maxBytes: 65536,
            acceptExitCodes: [1, 130],
          }
        )
        let report
        try {
          report = JSON.parse(result.output.trim())
        } catch {
          assert.fail("Missing safe fixture setup summary")
        }
        assert.equal(report.status, "failed")
        assert.equal(report.stage, stage)
        assert.equal(report.code, code)
        assert.equal(report.cleanup, true)
        assert.deepEqual(await readdir(root), [])
        // Every fault child schedules a three-second recreate/write after bundling.
        // A merely abandoned compiler would repopulate this otherwise empty root.
        await delay(3500)
        assert.deepEqual(await readdir(root), [])
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
          "Independent setup browser/listener/file sentinel changed"
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  )
