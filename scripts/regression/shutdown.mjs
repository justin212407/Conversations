import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { URL } from "node:url"
import { composeController } from "./compose.mjs"
import { GateFailure, boundedFetch, until } from "./runtime.mjs"
import { token } from "./lifecycle.mjs"
import { decodeTrace, serviceSpans } from "./trace.mjs"

const configurations = new WeakMap()
export async function configureShutdown(owned, context, scenario) {
  if (!["outage", "healthy", "disabled"].includes(scenario))
    throw new GateFailure("shutdown-scenario", "precondition")
  context.setStage("shutdown-private-configuration")
  const fixture = async (name, target) => {
    const file = await owned.write(
      name,
      await readFile(
        new URL(
          "../../packages/service-runtime/test/fixtures/" + name,
          import.meta.url
        )
      ),
      0o644
    )
    return file + ":" + target + ":ro,Z"
  }
  const dns = await fixture("shutdown-dns.mjs", "/shutdown-dns.mjs")
  const observer = await fixture(
    "shutdown-observer.mjs",
    "/shutdown-observer.mjs"
  )
  const semantics = await fixture(
    "shutdown-lookup-semantics.mjs",
    "/shutdown-lookup-semantics.mjs"
  )
  const overlay = {
    services: {
      api: {
        command: [
          "node",
          "--import",
          "/shutdown-observer.mjs",
          "apps/api/dist/index.js",
        ],
        volumes: [observer, semantics],
        extra_hosts: ["lookup-hosts-fixture:127.0.0.42"],
        environment:
          scenario === "disabled"
            ? { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "" }
            : {},
      },
      "shutdown-dns": {
        image: owned.image,
        init: true,
        command: ["node", "/shutdown-dns.mjs"],
        restart: "no",
        sysctls: { "net.ipv4.ip_unprivileged_port_start": "0" },
        volumes: [dns],
        stop_grace_period: "3s",
      },
    },
  }
  const file = await owned.write(
    "shutdown-compose.json",
    JSON.stringify(overlay)
  )
  configurations.set(owned, { scenario, overlay, file })
}
export function shutdownCompose(owned, prefix, options) {
  const data = configurations.get(owned)
  if (!data)
    throw new GateFailure("shutdown-private-configuration", "invalid_result")
  return composeController(owned, prefix, { ...options, files: [data.file] })
}
function records(text) {
  return text.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}
export async function startShutdownDns(owned, docker, { signal, setStage }) {
  const data = configurations.get(owned)
  setStage("shutdown-dns-start")
  await docker.command(
    ["up", "-d", "--no-build", "shutdown-dns"],
    "shutdown-dns-start",
    30000
  )
  await until(
    "shutdown-dns-ready",
    async () =>
      records(
        (
          await docker.command(
            ["logs", "--no-color", "--no-log-prefix", "shutdown-dns"],
            "shutdown-dns-ready"
          )
        ).output
      ).some((value) => value.shutdownDns === "ready"),
    { signal, timeoutMs: 10000 }
  )
  const dns = await docker.inspect("shutdown-dns")
  if (dns.state !== "running" || dns.addresses.length !== 1)
    throw new GateFailure("shutdown-dns-address", "invalid_result")
  data.overlay.services.api.dns = [dns.addresses[0]]
  await owned.write("shutdown-compose.json", JSON.stringify(data.overlay))
  await docker.command(["config", "--quiet"], "shutdown-compose-validation")
}
function observed(values) {
  const frames = values.filter((value) => value.shutdownObserved === true)
  assert.equal(frames.length, 1)
  const frame = frames[0]
  for (const name of ["spawned", "exited", "active", "peak"])
    assert.ok(Number.isInteger(frame[name]) && frame[name] >= 0)
  assert.equal(frame.active, 0)
  assert.equal(frame.exited, frame.spawned)
  assert.ok(frame.peak <= 1)
  for (const kind of [
    "ProcessWrap",
    "GetAddrInfoReqWrap",
    "TCPSocketWrap",
    "TCPServerWrap",
    "Timeout",
  ])
    assert.equal(frame.resources?.[kind] ?? 0, 0)
  return frame
}
export async function verifyShutdown(owned, docker, { signal, setStage }) {
  const { scenario } = configurations.get(owned),
    address = "http://127.0.0.1:" + owned.ports.api
  setStage("shutdown-api-readiness")
  await until(
    "shutdown-api-ready",
    async () => (await boundedFetch(address + "/health/ready")).ok,
    { signal, timeoutMs: 45000 }
  )
  if (scenario !== "healthy")
    await docker.command(["stop", "jaeger"], "shutdown-collector-outage", 30000)
  const traceId = randomBytes(16).toString("hex"),
    jwt = token(owned.signing, "shutdown")
  setStage("shutdown-post-outage-request")
  const response = await boundedFetch(address + "/v1/me", {
    headers: {
      authorization: "Bearer " + jwt,
      origin: "http://localhost:3000",
      traceparent:
        "00-" + traceId + "-" + randomBytes(8).toString("hex") + "-01",
    },
  })
  assert.equal(response.status, 200)
  await response.arrayBuffer()
  setStage("shutdown-natural-exit")
  // Preserve inherited stop_grace_period:15s and runtime5000ms. No forced exit.
  await docker.command(["stop", "api"], "shutdown-api-stop", 25000)
  const state = await docker.inspect("api")
  assert.equal(state.state, "exited")
  assert.equal(state.exitCode, 0)
  assert.equal(state.oomKilled, false)
  const logs = await docker.command(
    ["logs", "--no-color", "--no-log-prefix", "api"],
    "shutdown-api-observation"
  )
  const frame = observed(records(logs.output + "\n" + logs.errors))
  assert.ok(!logs.output.includes(jwt) && !logs.errors.includes(jwt))
  if (scenario === "disabled") assert.equal(frame.spawned, 0)
  else assert.ok(frame.spawned >= 1)
  let spans = 0,
    semantics = 0
  if (scenario === "healthy") {
    setStage("shutdown-healthy-span")
    spans = await until(
      "shutdown-healthy-span",
      async () => {
        const response = await boundedFetch(
          "http://127.0.0.1:" + owned.ports.jaeger + "/api/v3/traces/" + traceId
        )
        if (!response.ok) return false
        return (
          serviceSpans(
            decodeTrace(await response.text()),
            "conversations-api"
          ).filter((span) => span.name === "http").length || false
        )
      },
      { signal, timeoutMs: 20000 }
    )
    setStage("shutdown-shipped-lookup-semantics")
    const result = await docker.command(
      [
        "run",
        "--rm",
        "--no-deps",
        "api",
        "node",
        "--import",
        "/shutdown-observer.mjs",
        "/shutdown-lookup-semantics.mjs",
      ],
      "shutdown-shipped-lookup-semantics",
      30000
    )
    const values = records(result.output)
    semantics = values.find(
      (value) => value.shutdownLookupCases !== undefined
    )?.shutdownLookupCases
    assert.equal(semantics, 10)
    const checks = observed(values)
    assert.equal(checks.spawned, 10)
  }
  await docker.command(["stop", "shutdown-dns"], "shutdown-dns-stop", 10000)
  const dns = records(
    (
      await docker.command(
        ["logs", "--no-color", "--no-log-prefix", "shutdown-dns"],
        "shutdown-dns-observation"
      )
    ).output
  )
  const stopped = dns.find((value) => value.shutdownDns === "stopped")
  assert.ok(Number.isInteger(stopped?.queries) && stopped.queries >= 0)
  if (scenario === "outage") assert.ok(stopped.queries > 0)
  if (scenario === "disabled") assert.equal(stopped.queries, 0)
  setStage("shutdown-complete")
  return {
    scenarioOutage: scenario === "outage",
    scenarioHealthy: scenario === "healthy",
    scenarioDisabled: scenario === "disabled",
    naturalApiExit: true,
    joinedLookupChildren: frame.spawned,
    lookupChildrenAtExit: frame.active,
    healthySpans: spans,
    shippedLookupCases: semantics,
    dnsQueries: stopped.queries,
  }
}
