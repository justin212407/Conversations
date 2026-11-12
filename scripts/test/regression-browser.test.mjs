import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:net"
import { join } from "node:path"
import { mkdir, access, readFile } from "node:fs/promises"
import { composeController } from "../regression/compose.mjs"
import { runRegression } from "../regression/runner.mjs"
import { closeBrowser, controlListenerClosed } from "../regression/browser.mjs"
import { privateRunDirectory } from "../regression/runtime.mjs"

async function reported(work) {
  const original = console.log,
    output = []
  console.log = (value) => output.push(JSON.parse(value))
  try {
    const exit = await work()
    return { exit, report: output[0] }
  } finally {
    console.log = original
  }
}
test("guarded verifier import failure emits only a safe stage before Docker work", async () => {
  let touched = false
  const result = await reported(() =>
    runRegression(
      [],
      async () => {
        throw Error("PRIVATE_MISSING_MODULE_PATH")
      },
      {
        resolveDocker: async () => {
          touched = true
        },
      }
    )
  )
  assert.equal(touched, false)
  assert.equal(result.exit, 1)
  assert.equal(result.report.stage, "runtime-build")
  assert.equal(result.report.cleanup, true)
  assert.ok(!JSON.stringify(result).includes("PRIVATE_MISSING_MODULE_PATH"))
})
test("early owned cleanup continues after browser, reservation and file failures", async () => {
  const steps = []
  const result = await reported(() =>
    runRegression([], async () => () => ({}), {
      resolveDocker: async () => [],
      prepareRun: async () => ({
        releasePorts: async () => {
          steps.push("ports")
          throw Error("failure")
        },
        remove: async () => {
          steps.push("files")
          throw Error("failure")
        },
      }),
      beforeStart: async (_owned, ctx) => {
        ctx.own(async () => {
          steps.push("server")
          return true
        })
        ctx.own(async () => {
          steps.push("browser")
          throw Error("failure")
        })
        throw Error("initialization")
      },
    })
  )
  assert.deepEqual(steps, ["browser", "server", "ports", "files"])
  assert.equal(result.report.cleanup, false)
  assert.equal(result.report.stage, "cleanup")
  assert.equal(result.exit, 1)
})
test("browser cleanup failure cannot be replaced by a successful Docker down", async () => {
  const steps = []
  const result = await reported(() =>
    runRegression([], async () => async () => ({ browser: true }), {
      resolveDocker: async () => [],
      prepareRun: async () => ({ releasePorts: async () => {} }),
      beforeStart: async (_owned, ctx) =>
        ctx.own(async () => {
          steps.push("browser")
          return false
        }),
      makeCompose: () => ({
        command: async () => ({}),
        cleanup: async () => {
          steps.push("docker")
          return true
        },
      }),
    })
  )
  assert.deepEqual(steps, ["browser", "docker"])
  assert.equal(result.report.cleanup, false)
  assert.equal(result.exit, 1)
})
test("failed graceful browser close falls back to owned kill and removes only its profile", async () => {
  const owned = await privateRunDirectory(),
    sentinel = await privateRunDirectory()
  const profile = join(owned.directory, "profile")
  await mkdir(profile)
  const safe = await sentinel.write("sentinel", "preserved")
  const child = { exitCode: null, signalCode: null }
  let killed = false
  try {
    const clean = await closeBrowser(
      {
        profile,
        browser: {
          close: async () => {
            throw Error("close")
          },
          isConnected: () => false,
        },
        server: {
          process: () => child,
          close: async () => {},
          kill: async () => {
            killed = true
            child.signalCode = "SIGKILL"
          },
        },
      },
      { timeout: 20, verifyControl: async () => true }
    )
    assert.equal(clean, true)
    assert.equal(killed, true)
    await assert.rejects(access(profile))
    assert.equal(await readFile(safe, "utf8"), "preserved")
  } finally {
    await owned.remove()
    await sentinel.remove()
  }
})
test("unverified browser exit stays false and retains profile for owned investigation", async () => {
  const owned = await privateRunDirectory(),
    profile = join(owned.directory, "profile")
  await mkdir(profile)
  try {
    const clean = await closeBrowser(
      {
        profile,
        browser: { close: async () => {}, isConnected: () => false },
        server: {
          process: () => ({ exitCode: null, signalCode: null }),
          close: async () => {},
          kill: async () => {},
        },
      },
      { timeout: 20, verifyControl: async () => true }
    )
    assert.equal(clean, false)
    await access(profile)
  } finally {
    await owned.remove()
  }
})

test("owned control listener is checked over TCP rather than inferred from child exit", async () => {
  const server = createServer((socket) => socket.destroy())
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const endpoint =
    "ws://127.0.0.1:" + server.address().port + "/private-control"
  try {
    assert.equal(await controlListenerClosed(endpoint, 50), false)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  assert.equal(await controlListenerClosed(endpoint, 100), true)
  assert.equal(
    await controlListenerClosed("ws://remote.invalid:3000/private", 20),
    false
  )
})

test("reservation release failure still attempts exact Docker down/inventory/image and files", async () => {
  const steps = []
  const owned = {
    project: "conversations-regression-" + "a".repeat(32),
    image: "conversations-regression-" + "a".repeat(32) + ":local",
    envFile: "/private/run.env",
    releasePorts: async () => {
      steps.push("ports")
      throw Error("release failed")
    },
    remove: async () => {
      steps.push("files")
    },
  }
  const controller = composeController(
    owned,
    ["--host", "unix:///var/run/docker.sock"],
    {
      execute: async (_cmd, args) => {
        if (args.includes("down")) steps.push("down")
        else if (args.includes("image")) steps.push("image")
        else steps.push("inventory")
        return { output: "" }
      },
    }
  )
  assert.equal(await controller.cleanup(), false)
  assert.equal(steps[0], "ports")
  assert.ok(steps.includes("down"))
  assert.equal(steps.filter((step) => step === "inventory").length, 3)
  assert.ok(steps.includes("image"))
  assert.equal(steps.at(-1), "files")
})

test("failed Docker down and one inventory cannot skip other inventories, image or private files", async () => {
  const steps = []
  const owned = {
    project: "conversations-regression-" + "b".repeat(32),
    image: "conversations-regression-" + "b".repeat(32) + ":local",
    envFile: "/private/run.env",
    releasePorts: async () => steps.push("ports"),
    remove: async () => steps.push("files"),
  }
  const controller = composeController(owned, [], {
    execute: async (_cmd, args) => {
      if (args.includes("down")) {
        steps.push("down")
        throw Error("down failed")
      }
      if (args.includes("image")) {
        steps.push(args.includes("rm") ? "image-remove" : "image-inspect")
        return { output: args.includes("rm") ? "" : "owned-image" }
      }
      const kind = ["container", "network", "volume"].find((kind) =>
        args.includes(kind)
      )
      steps.push(kind)
      if (kind === "container") throw Error("inventory failed")
      return { output: "" }
    },
  })
  assert.equal(await controller.cleanup(), false)
  assert.deepEqual(steps, [
    "ports",
    "down",
    "container",
    "network",
    "volume",
    "image-inspect",
    "image-remove",
    "files",
  ])
})

test("hung graceful browser close reaches owned kill within its deadline", async () => {
  const owned = await privateRunDirectory(),
    profile = join(owned.directory, "profile")
  await mkdir(profile)
  const child = { exitCode: null, signalCode: null }
  let killed = false
  try {
    assert.equal(
      await closeBrowser(
        {
          profile,
          browser: {
            close: () => new Promise(() => {}),
            isConnected: () => false,
          },
          server: {
            process: () => child,
            close: async () => {},
            kill: async () => {
              killed = true
              child.signalCode = "SIGKILL"
            },
          },
        },
        { timeout: 20, verifyControl: async () => true }
      ),
      true
    )
    assert.equal(killed, true)
    await assert.rejects(access(profile))
  } finally {
    await owned.remove()
  }
})
