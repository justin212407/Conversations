import process from "node:process"
import { pathToFileURL } from "node:url"
import {
  verifyDocker,
  prepare,
  composeController,
} from "./regression/compose.mjs"
import { GateFailure, summary, until } from "./regression/runtime.mjs"

export async function main(args = process.argv.slice(2)) {
  const fault = args.find((value) => value.startsWith("--fault="))?.slice(8)
  if (
    args.some(
      (value) =>
        ![
          "--fault=after-up",
          "--fault=signal-after-up",
          "--fault=interrupt-after-up",
          "--fault=startup-timeout",
        ].includes(value)
    ) ||
    args.length > 1
  ) {
    console.log(
      JSON.stringify(
        summary({
          status: "failed",
          stage: "arguments",
          code: "precondition",
          cleanup: true,
        })
      )
    )
    return 1
  }
  const abort = new AbortController(),
    signal = () => abort.abort(),
    deadline = setTimeout(signal, 25 * 60 * 1000)
  process.on("SIGINT", signal)
  process.on("SIGTERM", signal)
  let owned,
    docker,
    stage = "runtime-build",
    checks = {},
    failure,
    clean = true
  try {
    const { verifyLifecycle } = await import("./regression/lifecycle.mjs")
    stage = "docker-target"
    const prefix = await verifyDocker()
    stage = "private-configuration"
    owned = await prepare()
    docker = composeController(owned, prefix, { signal: abort.signal })
    stage = "compose-validation"
    await docker.command(["config", "--quiet"], stage)
    stage = "image-build"
    await docker.command(["build", "api"], stage, 12 * 60 * 1000)
    await owned.releasePorts()
    stage = "compose-up"
    await docker.command(["up", "-d", "--no-build"], stage, 120000)
    if (fault === "after-up")
      throw new GateFailure("fault-after-up", "assertion")
    if (fault === "startup-timeout")
      await until("service-readiness", async () => false, {
        timeoutMs: 50,
        intervalMs: 10,
        signal: abort.signal,
      })
    if (["signal-after-up", "interrupt-after-up"].includes(fault)) {
      stage = "signal-after-up"
      process.kill(
        process.pid,
        fault === "interrupt-after-up" ? "SIGINT" : "SIGTERM"
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
      throw new GateFailure(stage, "interrupted")
    }
    checks = await verifyLifecycle(owned, docker, {
      signal: abort.signal,
      setStage(value) {
        stage = value
      },
    })
  } catch (error) {
    failure =
      error instanceof GateFailure ? error : new GateFailure(stage, "assertion")
  } finally {
    clearTimeout(deadline)
    if (docker) clean = await docker.cleanup()
    else if (owned) {
      await owned.releasePorts()
      await owned.remove()
    }
    process.removeListener("SIGINT", signal)
    process.removeListener("SIGTERM", signal)
  }
  if (!clean) failure = new GateFailure("cleanup", "cleanup_failed")
  console.log(
    JSON.stringify(
      summary({
        status: failure ? "failed" : "passed",
        stage: failure?.stage ?? "complete",
        code: failure?.code,
        project: owned?.project,
        checks,
        cleanup: clean,
      })
    )
  )
  return failure ? (failure.code === "interrupted" ? 130 : 1) : 0
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
