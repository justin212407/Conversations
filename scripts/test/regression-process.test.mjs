import assert from "node:assert/strict"
import { test } from "node:test"
import { access, readFile, mkdir, symlink } from "node:fs/promises"
import { createServer } from "node:net"
import { URL } from "node:url"
import { join } from "node:path"
import { ownedProcess, groupQuiet } from "../regression/process.mjs"
import { privateRunDirectory } from "../regression/runtime.mjs"
import {
  serveFixture,
  startFixtureServer,
} from "../../apps/web/test/browser-server.mjs"
import { controlListenerClosed } from "../regression/browser.mjs"

test("concurrent cleanup during preparation preflight prevents a later writer spawn", async () => {
  const owned = await privateRunDirectory()
  const marker = join(owned.directory, "spawned")
  let release
  const leased = {
    ...owned,
    holdWriter() {
      release = owned.holdWriter()
      return release
    },
  }
  const child = ownedProcess(leased, { timeoutMs: 500 })
  const running = child.run(process.execPath, [
    "--eval",
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); process.disconnect?.()`,
  ])
  try {
    assert.equal(await child.cleanup(), true)
    await assert.rejects(running, { code: "interrupted" })
    await assert.rejects(access(marker), { code: "ENOENT" })
  } finally {
    await running.catch(() => {})
    await child.cleanup()
    if (release) {
      // The old implementation may have launched after cleanup returned. Join
      // that actual short-lived child before recovering this test's lease.
      const pid = Number(await readFile(marker, "utf8"))
      assert.equal(await groupQuiet(pid), true)
      release()
    }
    await owned.remove()
  }
})

test("private writer leases block removal until idempotent verified release", async () => {
  const owned = await privateRunDirectory()
  const release = owned.holdWriter()
  await owned.write("sentinel", "owned")
  await assert.rejects(owned.remove(), { code: "cleanup_failed" })
  assert.equal(
    await readFile(join(owned.directory, "sentinel"), "utf8"),
    "owned"
  )
  release()
  release()
  await owned.remove()
  await assert.rejects(access(owned.directory))
  assert.throws(() => owned.holdWriter())
})

test(
  "owned build deadline kills a TERM-resistant actual process group before removing its files",
  { timeout: 10000 },
  async () => {
    const owned = await privateRunDirectory()
    const file = await owned.write(
      "child.mjs",
      `import {writeFile,mkdir} from 'node:fs/promises';process.on('SIGTERM',()=>{});await writeFile(${JSON.stringify(join(owned.directory, "pid"))},String(process.pid));process.send('bundle-complete');setInterval(()=>{},1000);setTimeout(async()=>{await mkdir(${JSON.stringify(owned.directory)},{recursive:true});await writeFile(${JSON.stringify(join(owned.directory, "late"))},'late')},2500)`
    )
    let reached = false
    const child = ownedProcess(owned, {
      timeoutMs: 300,
      onStage: () => {
        reached = true
      },
    })
    try {
      await assert.rejects(child.run(process.execPath, [file]), {
        code: "command_timeout",
      })
      assert.equal(reached, true)
      const pid = Number(await readFile(join(owned.directory, "pid"), "utf8"))
      assert.equal(await groupQuiet(pid), true)
      assert.equal(await child.cleanup(), true)
      await owned.remove()
      await new Promise((resolve) => setTimeout(resolve, 2800))
      await assert.rejects(access(owned.directory))
    } finally {
      await child.cleanup()
      await owned.remove()
    }
  }
)

test("cancelled owned preparation joins exit without leaking private output to thrown failure", async () => {
  const owned = await privateRunDirectory(),
    controller = new AbortController()
  const file = await owned.write(
    "child.mjs",
    `process.stderr.write('PRIVATE_BUILD_ERROR');process.send('bundle-complete');setInterval(()=>{},1000)`
  )
  const child = ownedProcess(owned, {
    signal: controller.signal,
    onStage: () => controller.abort(),
  })
  try {
    await assert.rejects(
      child.run(process.execPath, [file]),
      (error) =>
        error.code === "interrupted" &&
        !error.message.includes("PRIVATE_BUILD_ERROR")
    )
    assert.equal(await child.cleanup(), true)
  } finally {
    await child.cleanup()
    await owned.remove()
  }
})

async function port() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const selected = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return selected
}
for (const when of ["starting", "listening"])
  test(
    "actual owned HTTP abort while " + when + " cannot leave a late listener",
    async () => {
      const owned = await privateRunDirectory(),
        controller = new AbortController(),
        selected = await port(),
        closures = []
      let server
      try {
        const starting = serveFixture({
          owned,
          directory: owned.directory,
          port: selected,
          signal: controller.signal,
          own: (close) => closures.push(close),
        })
        if (when === "starting") {
          controller.abort()
          await assert.rejects(starting, { code: "interrupted" })
        } else {
          server = await starting
          controller.abort()
        }
        for (const close of closures) assert.equal(await close(), true)
        assert.equal(
          await controlListenerClosed(
            "ws://127.0.0.1:" + selected + "/owned-http",
            200
          ),
          true
        )
      } finally {
        await server?.close()
        for (const close of closures) await close()
        await owned.remove()
      }
    }
  )

test("fixture child cannot escape its leased tree through outside, symlink or Git paths", async () => {
  const owned = await privateRunDirectory(),
    outside = await privateRunDirectory()
  try {
    const real = join(owned.directory, "actual")
    await mkdir(real)
    const alias = join(owned.directory, "alias")
    await symlink(real, alias)
    for (const directory of [
      outside.directory,
      alias,
      new URL("../../", import.meta.url).pathname,
    ]) {
      await assert.rejects(startFixtureServer({ owned, directory }), {
        code: "precondition",
      })
    }
    await assert.rejects(
      startFixtureServer({
        owned: {
          ...owned,
          directory: new URL("../../", import.meta.url).pathname,
        },
      }),
      { code: "precondition" }
    )
  } finally {
    await owned.remove()
    await outside.remove()
  }
})

test(
  "unavailable group verification retains the writer lease even after attempted termination",
  { timeout: 10000 },
  async () => {
    const owned = await privateRunDirectory()
    const file = await owned.write(
      "child.mjs",
      `import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify(join(owned.directory, "pid"))},String(process.pid));process.send('bundle-complete');setInterval(()=>{},1000)`
    )
    let release
    const leased = {
      ...owned,
      holdWriter() {
        release = owned.holdWriter()
        return release
      },
    }
    const child = ownedProcess(leased, {
      timeoutMs: 300,
      verifyGroup: async () => false,
    })
    try {
      await assert.rejects(child.run(process.execPath, [file]), {
        code: "cleanup_failed",
      })
      assert.equal(await child.cleanup(), false)
      await assert.rejects(owned.remove(), { code: "cleanup_failed" })
      // Test-only recovery uses the real verifier before manually releasing the
      // intentionally unverified lease. No gate supplies a successful verifier stub.
      const pid = Number(await readFile(join(owned.directory, "pid"), "utf8"))
      assert.equal(await groupQuiet(pid), true)
      release()
      await owned.remove()
    } finally {
      const pid = Number(
        await readFile(join(owned.directory, "pid"), "utf8").catch(() => "0")
      )
      if (await groupQuiet(pid)) release?.()
      await owned.remove()
    }
  }
)
