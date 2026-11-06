import assert from "node:assert/strict"
import { test } from "node:test"
import { createRequire } from "node:module"
import { pathToFileURL, URL } from "node:url"
import process from "node:process"
import { run } from "../regression/runtime.mjs"

const runtime = createRequire(
  new URL("../../packages/service-runtime/package.json", import.meta.url)
)
const eslint = createRequire(runtime.resolve("eslint"))
const cache = createRequire(
  createRequire(eslint.resolve("file-entry-cache")).resolve("flat-cache")
)
const flatted = cache("flatted")
const fastify = createRequire(runtime.resolve("fastify"))
const uri = createRequire(fastify.resolve("ajv"))("fast-uri")
const backend = createRequire(
  new URL("../../packages/backend/package.json", import.meta.url)
)
const worker = createRequire(
  new URL("../../apps/worker/package.json", import.meta.url)
)

test("cache deserialization never exposes a mutable built-in prototype", () => {
  // https://github.com/advisories/GHSA-rf6f-7fwh-wjgh
  const parsed = flatted.parse('[{"x":"__proto__"}]')
  assert.equal(parsed.x, undefined)
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype)
  const circular = { title: "fixture" }
  circular.self = circular
  const roundtrip = flatted.parse(flatted.stringify(circular))
  assert.equal(roundtrip.self, roundtrip)
  assert.equal(roundtrip.title, "fixture")
})

test("cache deserialization handles a deep reference chain without stack exhaustion", () => {
  // https://github.com/advisories/GHSA-25h7-pfq9-p65f
  const depth = 20000
  const entries = Array.from({ length: depth }, (_, index) => ({
    next: String(index + 1),
  }))
  entries.push({ end: true })
  let value = flatted.parse(JSON.stringify(entries))
  for (let index = 0; index < depth; index++) value = value.next
  assert.equal(value.end, true)
})

test("Fastify URI validation rejects a backslash authority instead of trusting a different host", () => {
  // https://github.com/advisories/GHSA-v2hh-gcrm-f6hx
  assert.ok(uri.parse("http://evil.invalid\\@allowed.invalid").error)
  const valid = uri.parse("https://allowed.invalid:443/path")
  assert.equal(valid.error, undefined)
  assert.equal(valid.host, "allowed.invalid")
})

test("retained optional Hono middleware does not reflect arbitrary credentialed origins", async () => {
  const { Hono } = await import(pathToFileURL(backend.resolve("hono")).href)
  const { cors } = await import(
    pathToFileURL(backend.resolve("hono/cors")).href
  )
  const app = new Hono()
  app.use("*", cors({ credentials: true }))
  app.get("/", (context) => context.text("fixture"))
  const response = await app.request("https://fixture.invalid/", {
    headers: { origin: "https://untrusted.invalid" },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("access-control-allow-origin"), "*")
  assert.equal(await response.text(), "fixture")
})

test("retained optional MCP capability negotiates and lists tools entirely in memory", async () => {
  const load = (path) => import(pathToFileURL(worker.resolve(path)).href)
  const [
    { Client },
    { Server },
    { InMemoryTransport },
    { ListToolsRequestSchema },
  ] = await Promise.all([
    load("@modelcontextprotocol/sdk/client/index.js"),
    load("@modelcontextprotocol/sdk/server/index.js"),
    load("@modelcontextprotocol/sdk/inMemory.js"),
    load("@modelcontextprotocol/sdk/types.js"),
  ])
  const client = new Client({ name: "fixture-client", version: "1" })
  const server = new Server(
    { name: "fixture-server", version: "1" },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }))
  const [left, right] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(right)
    await client.connect(left)
    assert.deepEqual(await client.listTools(), { tools: [] })
  } finally {
    await Promise.all([client.close(), server.close()])
  }
})

test("glob expansion bounds repeated non-expanding braces in a memory and time limited child", async () => {
  const config = createRequire(
    new URL("../../packages/eslint-config/package.json", import.meta.url)
  )
  const reactLint = createRequire(config.resolve("eslint-plugin-react"))
  const minimatch = createRequire(reactLint.resolve("minimatch"))
  const entry = minimatch.resolve("brace-expansion")
  await run(
    process.execPath,
    [
      "--max-old-space-size=128",
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict';
       import {createRequire} from 'node:module';
       const expand=createRequire(import.meta.url)(${JSON.stringify(entry)});
       assert.deepEqual(expand('file-{a,b}.txt'), ['file-a.txt','file-b.txt']);
       assert.deepEqual(expand('{}' .repeat(40) + '{a,b}'), ['{}' .repeat(40)+'a','{}' .repeat(40)+'b']);`,
    ],
    { stage: "bounded-glob-expansion", timeoutMs: 5000 }
  )
})
