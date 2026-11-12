import process from "node:process"
import { verifyDocker, prepare, composeController } from "./compose.mjs"
import { GateFailure, summary, until } from "./runtime.mjs"

export async function runRegression(
  args,
  loadVerifier,
  {
    prepareRun = prepare,
    beforeStart,
    faults = [],
    resolveDocker = verifyDocker,
    makeCompose = composeController,
    timeoutMs = 25 * 60 * 1000,
  } = {}
) {
  const fault = args.find((value) => value.startsWith("--fault="))?.slice(8)
  if (
    args.some(
      (value) =>
        ![
          "--fault=after-up",
          "--fault=signal-after-up",
          "--fault=interrupt-after-up",
          "--fault=startup-timeout",
          ...faults.map((name) => "--fault=" + name),
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
    deadline = setTimeout(signal, timeoutMs)
  process.on("SIGINT", signal)
  process.on("SIGTERM", signal)
  let owned,
    docker,
    stage = "runtime-build",
    checks = {},
    failure,
    clean = true
  const cleanups = []
  const context = {
    signal: abort.signal,
    fault,
    setStage(value) {
      stage = value
    },
    own(cleanup) {
      cleanups.push(cleanup)
    },
  }
  try {
    const verify = await loadVerifier()
    stage = "docker-target"
    const prefix = await resolveDocker()
    stage = "private-configuration"
    owned = await prepareRun()
    await beforeStart?.(owned, context)
    docker = makeCompose(owned, prefix, { signal: abort.signal })
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
    checks = await verify(owned, docker, context)
  } catch (error) {
    failure =
      error instanceof GateFailure ? error : new GateFailure(stage, "assertion")
  } finally {
    clearTimeout(deadline)
    for (const cleanup of cleanups.reverse()) {
      try {
        if ((await cleanup()) !== true) clean = false
      } catch {
        clean = false
      }
    }
    if (docker) {
      try {
        clean = (await docker.cleanup()) && clean
      } catch {
        clean = false
      }
    } else if (owned) {
      try {
        await owned.releasePorts()
      } catch {
        clean = false
      }
      try {
        await owned.remove()
      } catch {
        clean = false
      }
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
