import assert from "node:assert/strict"
import { test } from "node:test"
import { loadConfig } from "../src/config.js"
import { loadRealtimeConfig } from "../src/realtime-config.js"

const secret = "S".repeat(43)
const canary = "TRANSPORT_CONFIGURATION_CANARY_24"
const service = {
  NODE_ENV: "production",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
}
const realtime = {
  NODE_ENV: "production",
  REALTIME_INTERNAL_SECRET: secret,
  REALTIME_PUBLIC_URL: "wss://realtime.example/v1/connect",
  REALTIME_API_URL: "https://api.example",
  CLERK_AUTHORIZED_PARTIES: "https://workspace.example",
}

const transports = [
  {
    field: "REALTIME_PUBLIC_URL",
    valid: realtime.REALTIME_PUBLIC_URL,
    load: (value: string) =>
      loadRealtimeConfig({ ...realtime, REALTIME_PUBLIC_URL: value }),
  },
  {
    field: "REALTIME_API_URL",
    valid: realtime.REALTIME_API_URL,
    load: (value: string) =>
      loadRealtimeConfig({ ...realtime, REALTIME_API_URL: value }),
  },
  {
    field: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    valid: "https://collector.example/v1/traces",
    load: (value: string) =>
      loadConfig("worker", {
        ...service,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: value,
      }),
  },
]

for (const transport of transports) {
  const url = new URL(transport.valid)
  const target = url.host + (url.pathname === "/" ? "" : url.pathname)
  const cases = [
    ["relative URL", "/v1/connect"],
    ["empty host", url.protocol + "//"],
    ["invalid IPv6 host", url.protocol + "//[invalid" + url.pathname],
    ["leading whitespace", " " + transport.valid],
    ["trailing whitespace", transport.valid + " "],
    ["authority tab", transport.valid.replace("://", "://\t")],
    ["authority newline", transport.valid.replace("://", "://\n")],
    ["path control", transport.valid + "/\u0085"],
    ["missing authority separator", url.protocol + target],
    ["single authority slash", url.protocol + "/" + target],
    ["backslash authority", url.protocol + "\\" + target],
    ["extra authority slash", url.protocol + "///" + target],
    ["empty userinfo", url.protocol + "//@" + target],
    ["credential userinfo", url.protocol + "//" + canary + "@" + target],
    ["empty query", transport.valid + "?"],
    ["query", transport.valid + "?token=" + canary],
    ["empty fragment", transport.valid + "#"],
    ["fragment", transport.valid + "#" + canary],
    [
      "empty explicit port",
      url.protocol + "//" + url.host + ":" + url.pathname,
    ],
  ]
  for (const [name, value] of cases) {
    test(`${transport.field} rejects ${name} without exposing supplied values`, () => {
      assert.throws(
        () => transport.load(value!),
        (error: unknown) =>
          error instanceof Error &&
          error.message.startsWith("Invalid ") &&
          !error.message.includes(value!) &&
          !error.message.includes(canary) &&
          !error.message.includes(secret)
      )
    })
  }
}

test("empty realtime URLs fail while absent or empty collector configuration disables export", () => {
  for (const field of ["REALTIME_PUBLIC_URL", "REALTIME_API_URL"])
    assert.throws(() => loadRealtimeConfig({ ...realtime, [field]: "" }))
  for (const endpoint of [undefined, ""])
    assert.equal(
      loadConfig("worker", {
        ...service,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
      }).OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      undefined
    )
})

test("valid production transport authorities preserve existing paths, ports and IPv6", () => {
  for (const [publicUrl, apiUrl] of [
    ["wss://realtime.example/v1/connect", "https://api.example"],
    ["WSS://realtime.example:443/v1/connect", "HTTPS://api.example:443/"],
    ["wss://[::1]:4301/v1/connect", "https://[::1]:4300/"],
  ]) {
    const config = loadRealtimeConfig({
      ...realtime,
      REALTIME_PUBLIC_URL: publicUrl,
      REALTIME_API_URL: apiUrl,
    })
    assert.equal(config.REALTIME_PUBLIC_URL, publicUrl)
    assert.equal(config.REALTIME_API_URL, apiUrl)
  }
  for (const endpoint of [
    "https://collector.example:4318/v1/traces",
    "HTTPS://collector.example/v1/traces",
    "https://[::1]:4318/v1/traces",
    "https://collector.example/trace%20receiver",
  ]) {
    assert.equal(
      loadConfig("worker", {
        ...service,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: endpoint,
      }).OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
      endpoint
    )
  }
})

test("development retains explicit local HTTP and WS without private-network overrides", () => {
  const config = loadRealtimeConfig({ NODE_ENV: "development" })
  assert.equal(config.REALTIME_PUBLIC_URL, "ws://localhost:4301/v1/connect")
  assert.equal(config.REALTIME_API_URL, "http://127.0.0.1:4300")
  assert.equal(config.REALTIME_ALLOW_PRIVATE_HTTP, "false")
  assert.equal(
    loadConfig("worker", {
      ...service,
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://localhost:4318/v1/traces",
    }).OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    "http://localhost:4318/v1/traces"
  )
})

test("production private-network allowances are distinct and do not relax URL syntax or public WSS", () => {
  const api = "http://api:4300"
  const collector = "http://collector:4318/v1/traces"
  assert.throws(() =>
    loadRealtimeConfig({ ...realtime, REALTIME_API_URL: api })
  )
  assert.throws(() =>
    loadConfig("worker", {
      ...service,
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector,
    })
  )
  assert.equal(
    loadRealtimeConfig({
      ...realtime,
      REALTIME_API_URL: api,
      REALTIME_ALLOW_PRIVATE_HTTP: "true",
    }).REALTIME_API_URL,
    api
  )
  assert.equal(
    loadConfig("worker", {
      ...service,
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector,
      OBSERVABILITY_ALLOW_PRIVATE_HTTP: "true",
    }).OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    collector
  )
  assert.throws(() =>
    loadRealtimeConfig({
      ...realtime,
      REALTIME_API_URL: api,
      OBSERVABILITY_ALLOW_PRIVATE_HTTP: "true",
    })
  )
  assert.throws(() =>
    loadConfig("worker", {
      ...service,
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: collector,
      REALTIME_ALLOW_PRIVATE_HTTP: "true",
    })
  )
  for (const value of [
    "http://@api:4300",
    "http://api:4300?",
    "http:\\api:4300",
  ]) {
    assert.throws(() =>
      loadRealtimeConfig({
        ...realtime,
        REALTIME_API_URL: value,
        REALTIME_ALLOW_PRIVATE_HTTP: "true",
      })
    )
  }
  for (const value of ["http://@collector:4318/v1/traces", collector + "#"]) {
    assert.throws(() =>
      loadConfig("worker", {
        ...service,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: value,
        OBSERVABILITY_ALLOW_PRIVATE_HTTP: "true",
      })
    )
  }
  assert.throws(() =>
    loadRealtimeConfig({
      ...realtime,
      REALTIME_PUBLIC_URL: "ws://realtime.example/v1/connect",
      REALTIME_ALLOW_PRIVATE_HTTP: "true",
      OBSERVABILITY_ALLOW_PRIVATE_HTTP: "true",
    })
  )
})

test("backend transport policies still require the correct protocols and paths", () => {
  for (const publicUrl of [
    "https://realtime.example/v1/connect",
    "wss://realtime.example/other",
    "wss://realtime.example/v1/connect/",
  ])
    assert.throws(() =>
      loadRealtimeConfig({ ...realtime, REALTIME_PUBLIC_URL: publicUrl })
    )
  for (const apiUrl of ["wss://api.example", "https://api.example/v1"])
    assert.throws(() =>
      loadRealtimeConfig({ ...realtime, REALTIME_API_URL: apiUrl })
    )
  assert.throws(() =>
    loadConfig("worker", {
      ...service,
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "wss://collector.example/v1/traces",
    })
  )
})
