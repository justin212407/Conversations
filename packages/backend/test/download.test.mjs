import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { test } from "node:test"

test(
  "real parent download path preserves guarded DNS, redirects, abort and bounds",
  { timeout: 15000 },
  async () => {
    const child = spawn(
      process.execPath,
      [new URL("./download-child.mjs", import.meta.url).pathname],
      {
        env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
        stdio: ["ignore", "ignore", "ignore"],
      }
    )
    let timedOut = false
    const deadline = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, 10000)
    try {
      const [code, signal] = await once(child, "exit")
      assert.equal(timedOut, false, "download child exceeded its deadline")
      assert.equal(signal, null)
      assert.equal(
        code,
        0,
        "download child failed its actual parent-path assertions"
      )
    } finally {
      clearTimeout(deadline)
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
        await once(child, "exit")
      }
    }
  }
)
