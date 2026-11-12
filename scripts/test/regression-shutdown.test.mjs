import assert from "node:assert/strict"
import { test } from "node:test"
import { composeController } from "../regression/compose.mjs"
import { runRegression } from "../regression/runner.mjs"
async function reported(work) {
  const output = [],
    original = console.log
  console.log = (value) => output.push(JSON.parse(value))
  try {
    return { exit: await work(), report: output[0] }
  } finally {
    console.log = original
  }
}
const owned = {
  directory: "/private/run",
  envFile: "/private/run/env",
  project: "conversations-regression-" + "c".repeat(32),
  image: "owned-image",
}

test("additional Compose files stay in the owned directory and retain local pinning", async () => {
  let observed
  const controller = composeController(
    owned,
    ["--host", "unix:///var/run/docker.sock"],
    {
      files: ["/private/run/overlay.json"],
      execute: async (_command, args) => {
        observed = args
        return { output: "" }
      },
    }
  )
  await controller.command(["config", "--quiet"], "config")
  assert.deepEqual(observed.slice(0, 2), [
    "--host",
    "unix:///var/run/docker.sock",
  ])
  assert.ok(observed.includes("/private/run/overlay.json"))
  assert.throws(
    () => composeController(owned, [], { files: ["/operator/compose.yml"] }),
    { code: "precondition" }
  )
})

test("owned service inspection validates label/id/network and exposes no container environment", async () => {
  let foreign = false
  const controller = composeController(owned, [], {
    execute: async (_command, args) => {
      if (args.includes("inspect"))
        return {
          output: JSON.stringify([
            {
              Config: {
                Labels: {
                  "com.docker.compose.project": foreign
                    ? "unrelated"
                    : owned.project,
                },
                Env: ["PRIVATE_CONFIG_CANARY"],
              },
              State: { Status: "running", ExitCode: 0, OOMKilled: false },
              NetworkSettings: {
                Networks: {
                  [owned.project + "_default"]: { IPAddress: "172.30.0.2" },
                },
              },
            },
          ]),
        }
      return { output: "a".repeat(64) }
    },
  })
  assert.deepEqual(await controller.inspect("shutdown-dns"), {
    state: "running",
    exitCode: 0,
    oomKilled: false,
    addresses: ["172.30.0.2"],
  })
  assert.ok(
    !JSON.stringify(await controller.inspect("shutdown-dns")).includes(
      "PRIVATE_CONFIG_CANARY"
    )
  )
  foreign = true
  await assert.rejects(controller.inspect("shutdown-dns"), {
    code: "invalid_result",
  })
  await assert.rejects(controller.inspect("--all"), { code: "precondition" })
})

test("before-up failure still joins owned controller cleanup and never starts application services", async () => {
  const steps = []
  const result = await reported(() =>
    runRegression([], async () => async () => ({}), {
      resolveDocker: async () => [],
      prepareRun: async () => ({
        releasePorts: async () => steps.push("ports"),
      }),
      makeCompose: () => ({
        command: async (args) => steps.push(args[0]),
        cleanup: async () => {
          steps.push("cleanup")
          return true
        },
      }),
      beforeUp: async () => {
        steps.push("before")
        throw Error("PRIVATE_PREPARATION_ERROR")
      },
    })
  )
  assert.deepEqual(steps, ["config", "build", "before", "cleanup"])
  assert.equal(result.exit, 1)
  assert.equal(result.report.cleanup, true)
  assert.equal(result.report.stage, "before-up")
  assert.ok(!JSON.stringify(result).includes("PRIVATE_PREPARATION_ERROR"))
})

test("subset startup is explicit while shared build/port/cleanup ownership remains", async () => {
  let up
  const result = await reported(() =>
    runRegression([], async () => async () => ({ done: true }), {
      services: ["postgres", "api"],
      resolveDocker: async () => [],
      prepareRun: async () => ({ releasePorts: async () => {} }),
      makeCompose: () => ({
        command: async (args) => {
          if (args[0] === "up") up = args
        },
        cleanup: async () => true,
      }),
    })
  )
  assert.equal(result.exit, 0)
  assert.deepEqual(up, ["up", "-d", "--no-build", "postgres", "api"])
})

test("unsafe subset options fail before Docker discovery or mutation", async () => {
  let touched = false
  const result = await reported(() =>
    runRegression([], async () => async () => ({}), {
      services: ["--all"],
      resolveDocker: async () => {
        touched = true
        return []
      },
    })
  )
  assert.equal(touched, false)
  assert.equal(result.exit, 1)
  assert.equal(result.report.stage, "arguments")
})
