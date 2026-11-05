import assert from "node:assert/strict"
import { test } from "node:test"
import process from "node:process"
import { readFile, stat } from "node:fs/promises"
import {
  childEnvironment,
  localDockerEndpoint,
  privateRunDirectory,
  run,
  summary,
  GateFailure,
} from "../regression/runtime.mjs"

test("child allowlist drops root/provider/Docker overrides and pins only local endpoints", () => {
  const env = childEnvironment({
    PATH: "/bin",
    HOME: "/test",
    GOOGLE_GENERATIVE_AI_API_KEY: "canary",
    CLERK_SECRET_KEY: "canary",
    DOCKER_HOST: "tcp://production:2375",
    DOCKER_CONTEXT: "production",
    NODE_OPTIONS: "--import=unsafe",
    COMPOSE_FILE: "foreign.yml",
    METRICS_BEARER_TOKEN: "canary",
  })
  assert.deepEqual(env, { PATH: "/bin", HOME: "/test", NO_COLOR: "1" })
  for (const endpoint of [
    "unix:///var/run/docker.sock",
    "npipe:////./pipe/docker_engine",
    "tcp://127.0.0.1:2375",
    "https://[::1]:2376",
  ])
    assert.equal(localDockerEndpoint(endpoint), endpoint)
  for (const endpoint of [
    "ssh://production",
    "tcp://example.com:2375",
    "tcp://localhost:2375",
    "https://user:secret@127.0.0.1:2376",
    "tcp://127.0.0.1:2375?secret=1",
    "unix:///var/run/docker.sock\n",
  ])
    assert.throws(() => localDockerEndpoint(endpoint), GateFailure)
})
test("private files are restrictive and cleanup only their own temporary directory", async () => {
  const owned = await privateRunDirectory(),
    sentinel = await privateRunDirectory()
  try {
    const secret = await owned.write("run.env", "SYNTHETIC_SECRET=private")
    const untouched = await sentinel.write("sentinel", "preserved")
    assert.equal((await stat(secret)).mode & 0o777, 0o600)
    assert.equal((await stat(owned.directory)).mode & 0o777, 0o700)
    await owned.remove()
    assert.equal(await readFile(untouched, "utf8"), "preserved")
  } finally {
    await owned.remove()
    await sentinel.remove()
  }
})
test("failed commands and bounded output do not serialize raw errors or private output", async () => {
  const canary = "PRIVATE_CHILD_CANARY"
  await assert.rejects(
    run(
      process.execPath,
      ["-e", `console.error('${canary}');process.exit(3)`],
      { stage: "owned-command" }
    ),
    (error) =>
      error instanceof GateFailure &&
      error.code === "command_failed" &&
      !JSON.stringify(error).includes(canary) &&
      !String(error).includes(canary)
  )
  await assert.rejects(
    run(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stage: "deadline",
      timeoutMs: 50,
    }),
    (error) => error.code === "command_timeout"
  )
  await assert.rejects(
    run(process.execPath, ["-e", "console.log('x'.repeat(10000))"], {
      stage: "bounded-output",
      maxBytes: 10,
    }),
    (error) => error.code === "output_limit"
  )
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(
    run(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stage: "aborted",
      signal: abort.signal,
    }),
    (error) => error.code === "interrupted"
  )
})
test("public summaries select only bounded diagnostic metadata", () => {
  const result = summary({
    status: "failed",
    stage: "verify",
    code: "command_failed",
    project: "conversations-regression-" + "a".repeat(32),
    checks: {
      succeeded: true,
      spans: 8,
      token: "PRIVATE_SECRET",
      "bad\nkey": 2,
    },
    cleanup: true,
    secret: "PRIVATE_SECRET",
    rawLogs: "PRIVATE_SECRET",
  })
  assert.deepEqual(result.checks, { succeeded: true, spans: 8 })
  assert.ok(!JSON.stringify(result).includes("PRIVATE_SECRET"))
})

test("Docker validation pins the inspected local endpoint and fails before remote mutations", async () => {
  const { verifyDocker } = await import("../regression/compose.mjs")
  const calls = []
  const execute = async (_command, args) => {
    calls.push(args)
    return {
      output:
        args[0] === "context" && args[1] === "show"
          ? "local\n"
          : args[0] === "context"
            ? JSON.stringify([
                {
                  Endpoints: {
                    docker: { Host: "unix:///tmp/test-docker.sock" },
                  },
                },
              ])
            : args.includes("version")
              ? "2.40.0\n"
              : '"29.8.1"',
    }
  }
  assert.deepEqual(await verifyDocker(execute, {}), [
    "--host",
    "unix:///tmp/test-docker.sock",
  ])
  assert.ok(
    calls
      .slice(2)
      .every(
        (args) =>
          args[0] === "--host" && args[1] === "unix:///tmp/test-docker.sock"
      )
  )
  await assert.rejects(
    verifyDocker(
      async (_command, args) => ({
        output:
          args[1] === "show"
            ? "prod"
            : JSON.stringify([
                { Endpoints: { docker: { Host: "ssh://production" } } },
              ]),
      }),
      {}
    ),
    (error) => error.stage === "docker-target"
  )
})
test("cleanup is idempotent, ignores an aborted intake signal, and uses only owned labels/tags", async () => {
  const { composeController } = await import("../regression/compose.mjs")
  const commands = [],
    abort = new AbortController()
  abort.abort()
  const owned = {
    project: "conversations-regression-" + "b".repeat(32),
    image: "conversations-regression-" + "b".repeat(32) + ":local",
    envFile: "/private/run.env",
    releasePorts: async () => {},
    remove: async () => {},
  }
  const controller = composeController(
    owned,
    ["--host", "unix:///local.sock"],
    {
      signal: abort.signal,
      execute: async (_command, args, options) => {
        assert.ok(!options.signal?.aborted)
        commands.push(args)
        return { output: "" }
      },
    }
  )
  assert.ok(await controller.cleanup())
  assert.ok(await controller.cleanup())
  assert.equal(commands.filter((args) => args.includes("down")).length, 1)
  assert.ok(
    commands
      .filter((args) => args.includes("ls") && !args.includes("image"))
      .every((args) =>
        args.includes("label=com.docker.compose.project=" + owned.project)
      )
  )
  assert.ok(
    !commands.some((args) => args.includes("prune") || args.includes("kill"))
  )
})

test("cleanup reports remaining resources and private-file failures without raw errors", async () => {
  const { composeController } = await import("../regression/compose.mjs")
  const owned = {
    project: "conversations-regression-" + "c".repeat(32),
    image: "conversations-regression-" + "c".repeat(32) + ":local",
    envFile: "/private/run.env",
    releasePorts: async () => {},
    remove: async () => {
      throw new Error("PRIVATE_CLEANUP_CANARY")
    },
  }
  const controller = composeController(
    owned,
    ["--host", "unix:///local.sock"],
    { execute: async () => ({ output: "" }) }
  )
  assert.equal(await controller.cleanup(), false)
  let removed = false
  const lingering = composeController(
    {
      ...owned,
      remove: async () => {
        removed = true
      },
    },
    ["--host", "unix:///local.sock"],
    {
      execute: async (_command, args) => ({
        output: args.includes("ls") ? "owned-resource" : "",
      }),
    }
  )
  assert.equal(await lingering.cleanup(), false)
  assert.equal(removed, true)
})

test("loopback TCP targets require a verified Docker Desktop daemon and a full Compose version", async () => {
  const { verifyDocker } = await import("../regression/compose.mjs")
  const execute =
    (operatingSystem, version = "2.40.0") =>
    async (_command, args) => ({
      output:
        args[1] === "show"
          ? "desktop"
          : args[0] === "context"
            ? JSON.stringify([
                { Endpoints: { docker: { Host: "tcp://127.0.0.1:2375" } } },
              ])
            : args.includes("version")
              ? version
              : JSON.stringify(operatingSystem),
    })
  assert.deepEqual(await verifyDocker(execute("Docker Desktop"), {}), [
    "--host",
    "tcp://127.0.0.1:2375",
  ])
  await assert.rejects(
    verifyDocker(execute("Linux proxy"), {}),
    (error) => error.stage === "docker-target"
  )
  await assert.rejects(
    verifyDocker(execute("Docker Desktop", "2"), {}),
    (error) => error.stage === "compose-version"
  )
})
