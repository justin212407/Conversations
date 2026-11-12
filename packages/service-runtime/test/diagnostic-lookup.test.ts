import assert from "node:assert/strict"
import { test } from "node:test"
import { fork, type ChildProcess, type ForkOptions } from "node:child_process"
import {
  lookup as osLookup,
  getDefaultResultOrder,
  setDefaultResultOrder,
  V4MAPPED,
  ADDRCONFIG,
  type LookupOptions,
  type LookupAddress,
} from "node:dns"
import { setTimeout as delay } from "node:timers/promises"
import {
  DiagnosticLookup,
  resolverEnvironment,
  lookupMessage,
} from "../dist/diagnostic-lookup.js"
const fixture = new URL("./fixtures/lookup-behavior.mjs", import.meta.url)
const resolve = (
  owner: DiagnosticLookup,
  hostname: string,
  options: LookupOptions
) =>
  new Promise<LookupAddress | LookupAddress[]>((accept, reject) =>
    owner.lookup(hostname, options, (error, address, family) => {
      if (error) reject(error)
      else
        accept(Array.isArray(address) ? address : { address, family: family! })
    })
  )
const baseline = (hostname: string, options: LookupOptions) =>
  new Promise<LookupAddress | LookupAddress[]>((accept, reject) =>
    osLookup(hostname, options, (error, address, family) => {
      if (error) reject(error)
      else accept(Array.isArray(address) ? address : { address, family })
    })
  )
const configuration = (
  mode: string,
  onChild: (child: ChildProcess) => void = () => {}
) => ({
  worker: fixture,
  launch: (module: URL, options: ForkOptions) => {
    const child = fork(module, [mode], options)
    onChild(child)
    return child
  },
})

test("shipped child preserves OS IP/localhost/family/all/hints/verbatim and default order", async () => {
  const owner = new DiagnosticLookup(),
    original = getDefaultResultOrder()
  try {
    const cases: Array<[string, LookupOptions]> = [
      ["127.0.0.1", {}],
      ["::1", { family: 6 }],
      ["127.0.0.1", { family: 6, hints: V4MAPPED, all: true }],
      ["localhost", {}],
      ["localhost", { all: true }],
      ["localhost", { family: 4 }],
      ["localhost", { family: "IPv6" }],
      ["localhost", { all: true, hints: ADDRCONFIG }],
      ["localhost", { all: true, verbatim: false }],
      ["localhost", { all: true, order: "ipv6first" }],
    ]
    for (const [hostname, options] of cases)
      assert.deepEqual(
        await resolve(owner, hostname, options),
        await baseline(hostname, options)
      )
    setDefaultResultOrder("ipv6first")
    assert.deepEqual(
      await resolve(owner, "localhost", { all: true }),
      await baseline("localhost", { all: true })
    )
  } finally {
    setDefaultResultOrder(original)
    await owner.close()
  }
})

test("one active child, exit-before-callback and shared close fence new work", async () => {
  const children: ChildProcess[] = []
  const owner = new DiagnosticLookup(
    configuration("hold", (child) => children.push(child))
  )
  let callbacks = 0
  const first = new Promise<void>((accept) =>
    owner.lookup("localhost", {}, (error) => {
      assert.equal(
        children[0]?.exitCode !== null || children[0]?.signalCode !== null,
        true
      )
      assert.equal(error?.code, "ECANCELLED")
      callbacks++
      accept()
    })
  )
  await assert.rejects(resolve(owner, "localhost", {}), { code: "ECANCELLED" })
  assert.equal(children.length, 1)
  const close = owner.close()
  assert.equal(owner.close(), close)
  await close
  await first
  await assert.rejects(resolve(owner, "localhost", {}), { code: "ECANCELLED" })
  assert.equal(callbacks, 1)
  assert.equal(children.length, 1)
})

test(
  "lookup deadline escalates actual TERM-resistant child to KILL before callback",
  { timeout: 5000 },
  async () => {
    let child: ChildProcess | undefined
    const owner = new DiagnosticLookup(
      configuration("term-resistant", (value) => {
        child = value
      })
    )
    try {
      await assert.rejects(resolve(owner, "localhost", {}), {
        code: "ECANCELLED",
      })
      assert.equal(child?.signalCode, "SIGKILL")
    } finally {
      await owner.close()
    }
  }
)

for (const mode of ["bad", "oversized", "exit"])
  test(
    "invalid IPC/failed exit cannot resolve a collector address: " + mode,
    async () => {
      const owner = new DiagnosticLookup(configuration(mode))
      try {
        await assert.rejects(
          resolve(owner, "localhost", {}),
          (error) =>
            error instanceof Error &&
            error.message === "Diagnostic name resolution failed"
        )
      } finally {
        await owner.close()
      }
    }
  )

test("late response cannot duplicate callback or spawn after close", async () => {
  const owner = new DiagnosticLookup(configuration("late"))
  let calls = 0
  await new Promise<void>((accept, reject) =>
    owner.lookup("localhost", {}, (error) => {
      calls++
      if (error) reject(error)
      else accept()
    })
  )
  await owner.close()
  await delay(250)
  assert.equal(calls, 1)
})

test("spawn failure is a safe callback and verified empty ownership", async () => {
  const owner = new DiagnosticLookup({
    launch: (module, options) =>
      fork(module, [], { ...options, execPath: "/missing-conversations-node" }),
  })
  await assert.rejects(resolve(owner, "localhost", {}), { code: "ECANCELLED" })
  await owner.close()
})

test(
  "unverified termination rejects close and never reports a completed lookup",
  { timeout: 5000 },
  async () => {
    let child: ChildProcess | undefined, kill: ChildProcess["kill"] | undefined
    const owner = new DiagnosticLookup(
      configuration("hold", (value) => {
        child = value
        kill = value.kill.bind(value)
        value.kill = () => false
      })
    )
    let calls = 0
    owner.lookup("localhost", {}, () => {
      calls++
    })
    try {
      await delay(800)
      await assert.rejects(owner.close(), { code: "ECANCELLED" })
      assert.equal(calls, 0)
    } finally {
      if (child && kill) {
        const exit = new Promise<void>((accept) =>
          child!.once("exit", () => accept())
        )
        kill("SIGKILL")
        await exit
      }
    }
  }
)

test("lookup child receives minimal NSS environment and no app/import credentials", async () => {
  let inspected = false
  const owner = new DiagnosticLookup({
    environment: {
      HOME: "/tmp",
      LOCALDOMAIN: "example.test",
      NODE_OPTIONS: "--import PRIVATE_LOOKUP_CANARY",
      GOOGLE_GENERATIVE_AI_API_KEY: "PRIVATE_LOOKUP_CANARY",
    },
    launch: (module, options) => {
      assert.deepEqual(options.execArgv, [])
      assert.deepEqual(options.env, {
        HOME: "/tmp",
        LOCALDOMAIN: "example.test",
      })
      inspected = true
      return fork(module, [], options)
    },
  })
  try {
    assert.deepEqual(await resolve(owner, "127.0.0.1", {}), {
      address: "127.0.0.1",
      family: 4,
    })
    assert.equal(inspected, true)
  } finally {
    await owner.close()
  }
  assert.deepEqual(
    resolverEnvironment({ NODE_OPTIONS: "secret", PATH: "public" }),
    { PATH: "public" }
  )
})

test("strict bounded IPC rejects mixed/error/address and oversized invalid payloads", () => {
  for (const value of [
    { ok: true, result: { address: "invalid", family: 4 } },
    { ok: true, result: { address: "::1", family: 4 } },
    { ok: false, code: "EFAIL", result: {} },
    { ok: false, code: "PRIVATE_LOOKUP_CANARY" },
    { ok: true, results: Array(257).fill({ address: "127.0.0.1", family: 4 }) },
    "x".repeat(70000),
  ])
    assert.equal(lookupMessage(value), undefined)
})
