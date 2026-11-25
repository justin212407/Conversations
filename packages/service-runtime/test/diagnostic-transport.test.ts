import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer, Agent, type AgentOptions } from "node:http"
import { createServer as secureServer, Agent as SecureAgent } from "node:https"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  TracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type SpanExporter,
} from "@opentelemetry/sdk-trace"
import { DiagnosticLookup, lookupFailure } from "../dist/diagnostic-lookup.js"
import { Socket } from "node:net"
import { createDiagnosticTransport } from "../dist/diagnostic-transport.js"
import { privateRunDirectory } from "../../../scripts/regression/runtime.mjs"

async function span() {
  const memory = new InMemorySpanExporter(),
    provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter: memory })],
    })
  provider.getTracer("transport-test").startSpan("http").end()
  await provider.forceFlush()
  const result = memory.getFinishedSpans()[0]
  if (!result) throw Error("Missing actual span")
  await provider.shutdown()
  return result
}
async function exported(exporter: SpanExporter) {
  const value = await span()
  return new Promise<number>((resolve) =>
    exporter.export([value], (result) => resolve(result.code))
  )
}

test("real HTTP export and cached close join the owned socket; late IP connections are denied", async () => {
  let requests = 0,
    connections = 0
  const server = createServer((request, response) => {
    requests++
    request.resume()
    response.end()
  })
  server.on("connection", () => connections++)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("Missing listener")
  class ObservedAgent extends Agent {
    static instances: Agent[] = []
    constructor(options: AgentOptions) {
      super(options)
      ObservedAgent.instances.push(this)
    }
  }
  const transport = createDiagnosticTransport(
    "http://127.0.0.1:" + address.port + "/v1/traces",
    { loadAgent: async () => ObservedAgent }
  )
  try {
    assert.equal(await exported(transport.exporter), 0)
    assert.equal(requests, 1)
    const close = transport.close()
    assert.equal(transport.close(), close)
    await close
    const count = connections
    const agent = ObservedAgent.instances[0]
    if (!agent) throw Error("Missing actual Agent")
    await new Promise<void>((resolve) =>
      agent!.createConnection(
        { host: "127.0.0.1", port: address.port },
        (error, socket) => {
          assert.equal(error?.message, "Diagnostic name resolution failed")
          assert.equal(socket.destroyed, true)
          resolve()
        }
      )
    )
    assert.equal(await exported(transport.exporter), 1)
    assert.equal(connections, count)
  } finally {
    await transport.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("close fences an awaited public Agent import before construction or IP I/O", async () => {
  let entered: () => void = () => {},
    release: (value: typeof Agent) => void = () => {},
    created = 0
  const loaded = new Promise<void>((resolve) => {
      entered = resolve
    }),
    held = new Promise<typeof Agent>((resolve) => {
      release = resolve
    })
  class ObservedAgent extends Agent {
    constructor(options?: AgentOptions) {
      super(options)
      created++
    }
  }
  const transport = createDiagnosticTransport("http://127.0.0.1:1/v1/traces", {
    loadAgent: () => {
      entered()
      return held
    },
  })
  const sending = exported(transport.exporter)
  await loaded
  const closing = transport.close()
  release(ObservedAgent)
  await closing
  assert.equal(await sending, 1)
  assert.equal(created, 0)
})

test("close rejects within its budget while an Agent import remains held", async () => {
  let entered: () => void = () => {},
    release: (value: typeof Agent) => void = () => {},
    created = 0,
    timer: NodeJS.Timeout | undefined
  const loaded = new Promise<void>((resolve) => {
      entered = resolve
    }),
    held = new Promise<typeof Agent>((resolve) => {
      release = resolve
    })
  class ObservedAgent extends Agent {
    constructor(options?: AgentOptions) {
      super(options)
      created++
    }
  }
  const transport = createDiagnosticTransport("http://127.0.0.1:1/v1/traces", {
    loadAgent: () => {
      entered()
      return held
    },
  })
  const sending = exported(transport.exporter)
  await loaded
  const closing = transport.close()
  try {
    const outcome = await Promise.race([
      closing.then(
        () => "closed",
        () => "failed"
      ),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("pending"), 1500)
      }),
    ])
    assert.equal(outcome, "failed")
    assert.equal(transport.close(), closing)
    assert.equal(created, 0)
  } finally {
    clearTimeout(timer)
    release(ObservedAgent)
    await closing.catch(() => {})
    assert.equal(await sending, 1)
    assert.equal(created, 0)
  }
})

test("stalled real HTTP response is cancelled and its connection closes before return", async () => {
  let reached: () => void = () => {}
  const intake = new Promise<void>((resolve) => {
    reached = resolve
  })
  let peerClosed: () => void = () => {}
  const peer = new Promise<void>((resolve) => {
    peerClosed = resolve
  })
  const server = createServer((request) => {
    request.resume()
    reached()
  })
  server.once("connection", (socket) => socket.once("close", peerClosed))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("Missing listener")
  const transport = createDiagnosticTransport(
    "http://127.0.0.1:" + address.port + "/v1/traces"
  )
  try {
    const sending = exported(transport.exporter)
    await intake
    await transport.close()
    assert.equal(await sending, 1)
    await peer
    assert.equal(
      await new Promise<number>((resolve, reject) =>
        server.getConnections((error, count) =>
          error ? reject(error) : resolve(count)
        )
      ),
      0
    )
  } finally {
    await transport.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test("HTTPS uses normal certificate verification and preserves a trusted configured Agent", async () => {
  const owned = await privateRunDirectory(),
    keyPath = join(owned.directory, "key.pem"),
    certPath = join(owned.directory, "cert.pem")
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: "ignore" }
  )
  const cert = await readFile(certPath),
    key = await readFile(keyPath)
  let requests = 0
  const server = secureServer({ cert, key }, (request, response) => {
    requests++
    request.resume()
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw Error("Missing listener")
  const endpoint = "https://localhost:" + address.port + "/v1/traces",
    untrusted = createDiagnosticTransport(endpoint)
  class TrustedAgent extends SecureAgent {
    constructor(options: AgentOptions) {
      super({ ...options, ca: cert })
    }
  }
  const trusted = createDiagnosticTransport(endpoint, {
    loadAgent: async () => TrustedAgent,
  })
  try {
    assert.equal(await exported(untrusted.exporter), 1)
    assert.equal(requests, 0)
    assert.equal(await exported(trusted.exporter), 0)
    assert.equal(requests, 1)
  } finally {
    await untrusted.close()
    await trusted.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await owned.remove()
  }
})

test("unverified lookup closure cannot be hidden by successful exporter shutdown", async () => {
  class UnknownLookup extends DiagnosticLookup {
    override close(): Promise<void> {
      return Promise.reject(lookupFailure())
    }
  }
  const transport = createDiagnosticTransport("http://127.0.0.1:1/v1/traces", {
    lookup: new UnknownLookup(),
  })
  const closing = transport.close()
  assert.equal(transport.close(), closing)
  await assert.rejects(closing, { code: "ECANCELLED" })
})

test(
  "unverified actual socket close stays rejected until explicit test recovery",
  { timeout: 5000 },
  async () => {
    let socket: Socket | undefined, original: Socket["destroy"] | undefined
    class HeldAgent extends Agent {
      override createConnection(
        ...args: Parameters<Agent["createConnection"]>
      ) {
        const stream = super.createConnection(...args)
        if (stream instanceof Socket) {
          socket = stream
          original = stream.destroy.bind(stream)
        }
        return stream
      }
    }
    const server = createServer((request, response) => {
      request.resume()
      response.end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw Error("Missing listener")
    const transport = createDiagnosticTransport(
      "http://127.0.0.1:" + address.port + "/v1/traces",
      { loadAgent: async () => HeldAgent }
    )
    try {
      assert.equal(await exported(transport.exporter), 0)
      if (!socket) throw Error("Missing actual socket")
      socket.destroy = function () {
        return this
      }
      await assert.rejects(transport.close(), { code: "ECANCELLED" })
    } finally {
      original?.()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
)
