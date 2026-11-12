import assert from "node:assert/strict"
import { test } from "node:test"
import { setImmediate } from "node:timers"
import { browserOwner, bounded } from "../regression/browser.mjs"
import { privateRunDirectory } from "../regression/runtime.mjs"

test(
  "detached abort cleanup rejection stays handled until its owner observes failure",
  { timeout: 45000 },
  async () => {
    const owned = await privateRunDirectory()
    const abort = new AbortController()
    let owner, browser, originalConnected
    let observed
    const attempted = new Promise((resolve) => {
      observed = resolve
    })
    try {
      owner = await browserOwner(owned, abort.signal)
      browser = await owner.launch()
      originalConnected = browser.isConnected.bind(browser)
      browser.isConnected = () => {
        // Wait through the unhandled-rejection turn before the final owner joins.
        setImmediate(observed)
        throw new Error("Owned browser exit verification failed")
      }
      abort.abort()
      await bounded(() => attempted, 10000)
      await assert.rejects(owner.cleanup(), {
        message: "Owned browser exit verification failed",
      })
      assert.equal(originalConnected(), false)
    } finally {
      if (browser && originalConnected) browser.isConnected = originalConnected
      try {
        await owner?.cleanup()
      } catch {
        /* The original failure remains observable. */
      }
      await browser?.close().catch(() => {})
      await owned.remove()
    }
  }
)
