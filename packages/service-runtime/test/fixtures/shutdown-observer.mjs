// Test-only public lifecycle observation, never imported by a product entry.
import process from "node:process"
import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
const original = childProcess.fork,
  active = new Set()
let spawned = 0,
  exited = 0,
  peak = 0
childProcess.fork = function (...args) {
  const child = Reflect.apply(original, childProcess, args)
  child.once("spawn", () => {
    spawned++
    active.add(child)
    peak = Math.max(peak, active.size)
  })
  child.once("exit", () => {
    exited++
    active.delete(child)
  })
  return child
}
syncBuiltinESMExports()
process.once("beforeExit", () => {
  const resources = {}
  for (const name of process.getActiveResourcesInfo()) {
    const known = [
      "PipeWrap",
      "ProcessWrap",
      "GetAddrInfoReqWrap",
      "TCPSocketWrap",
      "TCPServerWrap",
      "Timeout",
    ].includes(name)
      ? name
      : "other"
    resources[known] = (resources[known] ?? 0) + 1
  }
  process.stdout.write(
    JSON.stringify({
      shutdownObserved: true,
      spawned,
      exited,
      active: active.size,
      peak,
      resources,
    }) + "\n"
  )
})
