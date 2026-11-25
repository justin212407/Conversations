import { spawn } from "node:child_process"
import {
  mkdtemp,
  writeFile,
  chmod,
  rm,
  realpath,
  lstat,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, relative, isAbsolute, sep } from "node:path"
import { URL, fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

const { AbortSignal } = globalThis
const codes = new Set([
  "precondition",
  "command_failed",
  "command_timeout",
  "output_limit",
  "invalid_result",
  "assertion",
  "interrupted",
  "cleanup_failed",
])
export class GateFailure extends Error {
  constructor(stage, code = "assertion") {
    super("Service regression failed")
    this.stage = stage
    this.code = codes.has(code) ? code : "assertion"
  }
}
export function childEnvironment(source = process.env) {
  const output = {}
  for (const name of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "TMPDIR",
    "TMP",
    "TEMP",
  ])
    if (source[name]) output[name] = source[name]
  output.NO_COLOR = "1"
  return output
}
export function localDockerEndpoint(value) {
  if (typeof value !== "string" || value.length > 1024)
    throw new GateFailure("docker-target", "precondition")
  if (value.startsWith("unix:///") && !/[\r\n\0?#]/.test(value)) return value
  if (
    value.startsWith("npipe:////./pipe/") &&
    /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/.test(value)
  )
    return value
  try {
    const endpoint = new URL(value)
    if (
      !["tcp:", "http:", "https:"].includes(endpoint.protocol) ||
      !["127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
      !endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !["", "/"].includes(endpoint.pathname)
    )
      throw new Error()
    return value
  } catch {
    throw new GateFailure("docker-target", "precondition")
  }
}
export function run(
  command,
  args,
  {
    cwd,
    env = childEnvironment(),
    stage = "command",
    timeoutMs = 30000,
    maxBytes = 8 * 1024 * 1024,
    terminationGraceMs = 1000,
    signal,
    acceptExitCodes = [0],
  } = {}
) {
  return new Promise((resolve, reject) => {
    let output = "",
      errors = "",
      bytes = 0,
      failed,
      timer,
      killTimer,
      settled = false,
      treeKillStarted = false
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    const killOwned = (termination) => {
      if (!child.pid) return
      if (process.platform === "win32") {
        if (treeKillStarted) return
        treeKillStarted = true
        const killer = spawn(
          "taskkill",
          ["/PID", String(child.pid), "/T", "/F"],
          {
            env,
            stdio: "ignore",
            windowsHide: true,
          }
        )
        const deadline = setTimeout(() => {
          killer.kill()
          child.kill(termination)
        }, 1000)
        killer.once("error", () => {
          clearTimeout(deadline)
          child.kill(termination)
        })
        killer.once("close", (code) => {
          clearTimeout(deadline)
          if (code !== 0) child.kill(termination)
        })
        killer.unref()
        return
      }
      try {
        process.kill(-child.pid, termination)
      } catch {
        child.kill(termination)
      }
    }
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener("abort", abort)
      if (error) {
        killOwned("SIGKILL")
        child.stdout.destroy()
        child.stderr.destroy()
        child.unref()
        reject(error)
      } else resolve(result)
    }
    const stop = (code) => {
      if (failed || settled) return
      failed = code
      killOwned("SIGTERM")
      // Never wait indefinitely for a descendant holding an inherited pipe.
      killTimer = setTimeout(
        () => finish(new GateFailure(stage, failed)),
        terminationGraceMs
      )
    }
    const abort = () => stop("interrupted")
    const capture = (chunk, error) => {
      bytes += chunk.length
      if (bytes > maxBytes) {
        stop("output_limit")
        return
      }
      if (error) errors += chunk
      else output += chunk
    }
    child.stdout.on("data", (chunk) => capture(chunk, false))
    child.stderr.on("data", (chunk) => capture(chunk, true))
    child.once("error", () => {
      finish(new GateFailure(stage, "command_failed"))
    })
    child.once("close", (code) => {
      if (failed || !acceptExitCodes.includes(code))
        finish(new GateFailure(stage, failed ?? "command_failed"))
      else finish(undefined, { output, errors, code })
    })
    timer = setTimeout(() => stop("command_timeout"), timeoutMs)
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
  })
}
export async function until(
  stage,
  work,
  { timeoutMs = 45000, intervalMs = 250, signal } = {}
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new GateFailure(stage, "interrupted")
    try {
      const result = await work()
      if (result) return result
    } catch (error) {
      if (error instanceof GateFailure) throw error
    }
    await delay(intervalMs)
  }
  throw new GateFailure(stage, "command_timeout")
}
export async function validatePrivateDirectory(value) {
  const parent = await realpath(value)
  const repository = await realpath(
    fileURLToPath(new URL("../../", import.meta.url))
  )
  const fromRepository = relative(repository, parent)
  if (
    !fromRepository ||
    (!isAbsolute(fromRepository) &&
      fromRepository !== ".." &&
      !fromRepository.startsWith(".." + sep))
  )
    throw new GateFailure("private-files", "precondition")
  for (let cursor = parent; ; cursor = dirname(cursor)) {
    try {
      await lstat(join(cursor, ".git"))
      throw new GateFailure("private-files", "precondition")
    } catch (error) {
      if (error instanceof GateFailure) throw error
      if (error.code !== "ENOENT")
        throw new GateFailure("private-files", "precondition")
    }
    if (dirname(cursor) === cursor) break
  }
  return parent
}
export async function privateRunDirectory() {
  const parent = await validatePrivateDirectory(tmpdir())
  const directory = await mkdtemp(join(parent, "conversations-regression-"))
  await chmod(directory, 0o700)
  const writers = new Set()
  let removing = false
  return {
    directory,
    project: "conversations-regression-" + randomUUID().replaceAll("-", ""),
    holdWriter() {
      if (removing) throw new GateFailure("private-files", "precondition")
      const writer = Symbol("owned writer")
      writers.add(writer)
      return () => writers.delete(writer)
    },
    async write(name, contents, mode = 0o600) {
      if (!/^[a-z0-9.-]+$/.test(name))
        throw new GateFailure("private-files", "invalid_result")
      const path = join(directory, name)
      await writeFile(path, contents, { mode })
      await chmod(path, mode)
      return path
    },
    async remove() {
      if (writers.size) throw new GateFailure("private-files", "cleanup_failed")
      removing = true
      await rm(directory, { force: true, recursive: true })
    },
  }
}
export function json(value, stage) {
  try {
    return JSON.parse(value)
  } catch {
    throw new GateFailure(stage, "invalid_result")
  }
}
export async function boundedFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  })
}
export function summary({
  status,
  stage,
  code,
  project,
  checks = {},
  cleanup,
}) {
  const safeChecks = Object.fromEntries(
    Object.entries(checks).filter(
      ([key, value]) =>
        /^[a-z][A-Za-z0-9]{0,60}$/.test(key) &&
        (typeof value === "boolean" ||
          (typeof value === "number" && Number.isFinite(value) && value >= 0))
    )
  )
  return {
    status: status === "passed" ? "passed" : "failed",
    stage: /^[a-z0-9-]{1,80}$/.test(stage) ? stage : "verification",
    ...(codes.has(code) ? { code } : {}),
    ...(typeof project === "string" &&
    /^conversations-regression-[a-f0-9]{32}$/.test(project)
      ? { project }
      : {}),
    checks: safeChecks,
    cleanup: cleanup === true,
  }
}
