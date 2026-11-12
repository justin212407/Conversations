import assert from "node:assert/strict"
import dns from "node:dns"
import net from "node:net"
import http from "node:http"
import { createRequire } from "node:module"

const originalLookup = dns.lookup,
  originalConnect = net.connect
let dnsCalls = 0,
  safeCallbacks = 0,
  requests = 0,
  hungPathReached = false
const modes = new Map()
const deniedHosts = new Set()
const sockets = new Set()
const server = http.createServer((req, res) => {
  requests++
  if (req.url === "/redirect-private") {
    res.writeHead(302, { location: "http://127.0.0.1/private" })
    res.end()
  } else if (req.url === "/redirect-public") {
    res.writeHead(302, {
      location: `http://second.fixture.test:${server.address().port}/ok`,
    })
    res.end()
  } else if (req.url === "/hang") {
    hungPathReached = true
  } else if (req.url === "/large") {
    res.writeHead(200)
    res.write("12345")
    res.end("67890")
  } else {
    res.writeHead(200, { "content-type": "application/octet-stream" })
    res.end("hello")
  }
})
server.on("connection", (s) => {
  sockets.add(s)
  s.on("close", () => sockets.delete(s))
})
const parentRequire = createRequire(
  import.meta.resolve("@ai-sdk/provider-utils")
)
assert.equal(parentRequire("undici/package.json").version, "6.29.1")
const undici = parentRequire("undici")
const OriginalAgent = undici.Agent
const agents = []
undici.Agent = class TrackedAgent extends OriginalAgent {
  constructor(options) {
    super(options)
    agents.push(this)
  }
}

await new Promise((r) => server.listen(0, "127.0.0.1", r))
// Only synthetic test hostnames resolve. All socket routes terminate on our
// owned loopback server AFTER the parent's real validating lookup succeeds.
dns.lookup = (hostname, options, callback) => {
  assert.ok(hostname.endsWith(".fixture.test"))
  dnsCalls++
  const addresses = modes.get(hostname) ?? [
    { address: "93.184.216.34", family: 4 },
  ]
  callback(null, addresses)
}
net.connect = function (options, ...args) {
  assert.equal(typeof options.lookup, "function")
  const safeLookup = options.lookup
  return originalConnect.call(
    this,
    {
      ...options,
      lookup(hostname, opts, callback) {
        safeLookup(hostname, opts, (error, address, family) => {
          safeCallbacks++
          if (error) {
            if (/resolved to disallowed IP address/.test(error.message))
              deniedHosts.add(hostname)
            return callback(error)
          }
          if (opts.all) {
            assert.deepEqual(address, [{ address: "93.184.216.34", family: 4 }])
          } else {
            assert.equal(address, "93.184.216.34")
            assert.equal(family, 4)
          }
          callback(
            null,
            opts.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1",
            4
          )
        })
      },
    },
    ...args
  )
}
const base = `http://public.fixture.test:${server.address().port}`
try {
  const { fetchWithValidatedRedirects, readResponseWithSizeLimit } =
    await import("@ai-sdk/provider-utils")

  let response = await fetchWithValidatedRedirects({ url: base + "/ok" })
  assert.equal(await response.text(), "hello")
  let before = requests
  for (const hostname of ["private.fixture.test", "mixed.fixture.test"]) {
    modes.set(
      hostname,
      hostname.startsWith("mixed")
        ? [
            { address: "93.184.216.34", family: 4 },
            { address: "10.0.0.1", family: 4 },
          ]
        : [{ address: "127.0.0.1", family: 4 }]
    )
    await assert.rejects(
      fetchWithValidatedRedirects({
        url: `http://${hostname}:${server.address().port}/ok`,
      })
    )
  }
  assert.equal(requests, before)
  assert.deepEqual([...deniedHosts].sort(), [
    "mixed.fixture.test",
    "private.fixture.test",
  ])
  before = requests
  await assert.rejects(
    fetchWithValidatedRedirects({ url: base + "/redirect-private" })
  )
  assert.equal(requests, before + 1)
  response = await fetchWithValidatedRedirects({
    url: base + "/redirect-public",
  })
  assert.equal(await response.text(), "hello")
  await assert.rejects(
    fetchWithValidatedRedirects({
      url: base + "/redirect-public",
      maxRedirects: 0,
    })
  )
  response = await fetchWithValidatedRedirects({ url: base + "/large" })
  await assert.rejects(
    readResponseWithSizeLimit({ response, url: base + "/large", maxBytes: 5 })
  )
  const abortSignal = AbortSignal.timeout(100)
  await assert.rejects(
    fetchWithValidatedRedirects({ url: base + "/hang", abortSignal })
  )
  assert.equal(hungPathReached, true)
  assert.equal(abortSignal.aborted, true)
  assert.ok(dnsCalls >= 5)
  assert.ok(safeCallbacks >= 5)
} finally {
  dns.lookup = originalLookup
  net.connect = originalConnect
  undici.Agent = OriginalAgent
  await Promise.all(agents.map((agent) => agent.destroy()))
  const closed = [...sockets].map(
    (socket) => new Promise((resolve) => socket.once("close", resolve))
  )
  for (const socket of sockets) socket.destroy()
  await new Promise((r) => server.close(r))
  await Promise.all(closed)
}
assert.equal(server.listening, false)
assert.equal(sockets.size, 0)
