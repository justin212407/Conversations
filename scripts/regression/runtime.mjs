import { spawn } from "node:child_process"
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { URL } from "node:url"
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
      killTimer
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stop = (code) => {
      if (failed) return
      failed = code
      child.kill("SIGTERM")
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000)
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
    const finish = () => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener("abort", abort)
    }
    child.once("error", () => {
      finish()
      reject(new GateFailure(stage, "command_failed"))
    })
    child.once("close", (code) => {
      finish()
      if (failed || !acceptExitCodes.includes(code))
        reject(new GateFailure(stage, failed ?? "command_failed"))
      else resolve({ output, errors, code })
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
export async function privateRunDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "conversations-regression-"))
  await chmod(directory, 0o700)
  return {
    directory,
    project: "conversations-regression-" + randomUUID().replaceAll("-", ""),
    async write(name, contents, mode = 0o600) {
      if (!/^[a-z0-9.-]+$/.test(name))
        throw new GateFailure("private-files", "invalid_result")
      const path = join(directory, name)
      await writeFile(path, contents, { mode })
      await chmod(path, mode)
      return path
    },
    async remove() {
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
