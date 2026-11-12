import { spawn } from "node:child_process"
import { readdir, readFile, access } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { childEnvironment, GateFailure } from "./runtime.mjs"

// Linux /proc distinguishes a live writer from a dead/zombie member whose
// original process group still exists. Never infer termination from a signal.
export async function groupQuiet(group) {
  if (process.platform !== "linux" || !Number.isInteger(group) || group <= 1)
    return false
  try {
    for (const name of await readdir("/proc")) {
      if (!/^\d+$/.test(name)) continue
      let stat
      try {
        stat = await readFile("/proc/" + name + "/stat", "utf8")
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ESRCH") continue
        return false
      }
      const end = stat.lastIndexOf(")")
      if (end < 0) return false
      const fields = stat.slice(end + 2).split(" ")
      if (Number(fields[2]) === group && !["Z", "X", "x"].includes(fields[0]))
        return false
    }
    return true
  } catch {
    return false
  }
}

export function ownedProcess(
  owned,
  {
    signal,
    stage = "fixture-build",
    timeoutMs = 60000,
    capture = "fixture-build.json",
    onStage,
    timeoutAfterStageMs,
    verifyGroup = groupQuiet,
  } = {}
) {
  let child,
    release,
    cleaning,
    resolveOutcome,
    timer,
    failure,
    resultCode,
    attempted = false,
    spawnFailed = false,
    output = "",
    errors = "",
    bytes = 0,
    stageSeen = false
  const exited = () =>
    spawnFailed ||
    (child &&
      (Number.isInteger(child.exitCode) ||
        typeof child.signalCode === "string"))
  const stop = (code) => {
    failure ??= new GateFailure(stage, code)
    resolveOutcome?.()
  }
  const abort = () => stop("interrupted")
  const send = (termination) => {
    if (!child?.pid) return
    try {
      process.kill(-child.pid, termination)
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
  async function quiet(timeout) {
    const deadline = Date.now() + timeout
    do {
      if (exited() && (spawnFailed || (await verifyGroup(child.pid))))
        return true
      await delay(20)
    } while (Date.now() < deadline)
    return false
  }
  const cleanup = () =>
    (cleaning ??= (async () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      if (!attempted) return true
      if (!exited()) stop("interrupted")
      let verified = false
      try {
        verified = await quiet(100)
        if (!verified) {
          send("SIGTERM")
          verified = await quiet(1000)
        }
        if (!verified) {
          send("SIGKILL")
          verified = await quiet(1000)
        }
      } catch {
        verified = false
      }
      // No verified exit means no lease release: outer cleanup must retain files.
      if (!verified) return false
      child?.stdout?.destroy()
      child?.stderr?.destroy()
      if (child?.connected) child.disconnect()
      let captured = true
      try {
        await owned.write(capture, JSON.stringify({ output, errors }))
      } catch {
        captured = false
      }
      release?.()
      return captured
    })())
  return {
    cleanup,
    async run(file, args = []) {
      if (attempted || cleaning || signal?.aborted)
        throw new GateFailure(stage, "interrupted")
      if (process.platform !== "linux")
        throw new GateFailure("fixture-platform", "precondition")
      await access("/proc/self/stat")
      if (attempted || cleaning || signal?.aborted)
        throw new GateFailure(stage, "interrupted")
      release = owned.holdWriter()
      attempted = true
      const outcome = new Promise((resolve) => {
        resolveOutcome = resolve
      })
      try {
        child = spawn(file, args, {
          env: childEnvironment(),
          detached: true,
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        })
        const receive = (chunk, isError) => {
          bytes += chunk.length
          if (bytes > 65536) return stop("output_limit")
          if (isError) errors += chunk
          else output += chunk
        }
        child.stdout.on("data", (chunk) => receive(chunk, false))
        child.stderr.on("data", (chunk) => receive(chunk, true))
        child.once("error", () => {
          spawnFailed = !child.pid
          stop("command_failed")
        })
        child.once("exit", (code) => {
          resultCode = code
          resolveOutcome()
        })
        child.on("message", (message) => {
          if (message !== "bundle-complete" || stageSeen)
            return stop("invalid_result")
          stageSeen = true
          if (timeoutAfterStageMs !== undefined) {
            clearTimeout(timer)
            timer = setTimeout(() => {
              failure ??= new GateFailure(
                stage + "-deadline",
                "command_timeout"
              )
              resolveOutcome()
            }, timeoutAfterStageMs)
          }
          try {
            onStage?.(message)
          } catch (error) {
            failure =
              error instanceof GateFailure
                ? error
                : new GateFailure(stage, "assertion")
            resolveOutcome()
          }
        })
        timer = setTimeout(() => stop("command_timeout"), timeoutMs)
        signal?.addEventListener("abort", abort, { once: true })
        if (signal?.aborted) abort()
        await outcome
      } catch {
        spawnFailed = !child?.pid
        failure ??= new GateFailure(stage, "command_failed")
      }
      const clean = await cleanup()
      if (!clean)
        throw new GateFailure("fixture-build-cleanup", "cleanup_failed")
      if (failure) throw failure
      if (resultCode !== 0) throw new GateFailure(stage, "command_failed")
    },
  }
}
