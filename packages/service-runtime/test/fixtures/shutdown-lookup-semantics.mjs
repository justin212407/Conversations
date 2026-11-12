import process from "node:process"
import assert from "node:assert/strict"
import {
  lookup,
  getDefaultResultOrder,
  setDefaultResultOrder,
  V4MAPPED,
} from "node:dns"
import { DiagnosticLookup } from "/app/packages/service-runtime/dist/diagnostic-lookup.js"
const owner = new DiagnosticLookup(),
  order = getDefaultResultOrder()
const direct = (hostname, options) =>
  new Promise((resolve, reject) =>
    lookup(hostname, options, (error, address, family) =>
      error
        ? reject(error)
        : resolve(Array.isArray(address) ? address : { address, family })
    )
  )
const owned = (hostname, options) =>
  new Promise((resolve, reject) =>
    owner.lookup(hostname, options, (error, address, family) =>
      error
        ? reject(error)
        : resolve(Array.isArray(address) ? address : { address, family })
    )
  )
let passed = 0
try {
  for (const [hostname, options] of [
    ["127.0.0.1", {}],
    ["::1", { family: 6 }],
    ["127.0.0.1", { family: 6, hints: V4MAPPED, all: true }],
    ["localhost", {}],
    ["localhost", { all: true, verbatim: false }],
    ["localhost", { all: true, order: "ipv6first" }],
    ["localhost", { family: "IPv6" }],
    ["lookup-hosts-fixture", { all: true }],
    ["jaeger", { all: true }],
  ]) {
    assert.deepEqual(
      await owned(hostname, options),
      await direct(hostname, options)
    )
    passed++
  }
  setDefaultResultOrder("ipv6first")
  assert.deepEqual(
    await owned("localhost", { all: true }),
    await direct("localhost", { all: true })
  )
  passed++
} catch {
  process.exitCode = 1
} finally {
  setDefaultResultOrder(order)
  await owner.close()
}
process.stdout.write(JSON.stringify({ shutdownLookupCases: passed }) + "\n")
