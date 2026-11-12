import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getStringFromEnv } from "@opentelemetry/core"
import { diag } from "@opentelemetry/api"
import type { Agent, AgentOptions } from "node:http"
import { Socket } from "node:net"
import type { Duplex } from "node:stream"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { DiagnosticLookup, lookupFailure } from "./diagnostic-lookup.js"

// Preserve the pinned SDK's signal-specific ?? generic TLS file selection.
// File contents stay in the parent and are never passed to the lookup child.
function tlsFile(
  field: "CERTIFICATE" | "CLIENT_CERTIFICATE" | "CLIENT_KEY",
  warning: string
) {
  const path =
    getStringFromEnv("OTEL_EXPORTER_OTLP_TRACES_" + field) ??
    getStringFromEnv("OTEL_EXPORTER_OTLP_" + field)
  if (path === undefined) return
  try {
    return readFileSync(resolve(process.cwd(), path))
  } catch {
    diag.warn(warning)
    return
  }
}

type AgentClass = new (options: AgentOptions) => Agent
export function createDiagnosticTransport(
  endpoint: string,
  dependencies: {
    lookup?: DiagnosticLookup
    loadAgent?: (protocol: string) => Promise<AgentClass>
  } = {}
) {
  const lookups = dependencies.lookup ?? new DiagnosticLookup(),
    agents = new Set<Agent>(),
    sockets = new Map<Duplex, Promise<void>>()
  const tls = {
    ca: tlsFile("CERTIFICATE", "Failed to read root certificate file"),
    cert: tlsFile(
      "CLIENT_CERTIFICATE",
      "Failed to read client certificate chain file"
    ),
    key: tlsFile(
      "CLIENT_KEY",
      "Failed to read client certificate private key file"
    ),
  }
  let closed = false,
    closing: Promise<void> | undefined
  const track = (socket: Duplex | null | undefined) => {
    if (!socket || sockets.has(socket)) return
    const exited = new Promise<void>((resolve) =>
      socket.once("close", () => {
        sockets.delete(socket)
        resolve()
      })
    )
    sockets.set(socket, exited)
  }
  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers: {},
    timeoutMillis: 750,
    concurrencyLimit: 1,
    httpAgentOptions: async (protocol) => {
      if (closed) throw lookupFailure()
      const AgentType = dependencies.loadAgent
        ? await dependencies.loadAgent(protocol)
        : (protocol === "http:"
            ? await import("node:http")
            : await import("node:https")
          ).Agent
      if (closed) throw lookupFailure()
      const agent: Agent = new AgentType({
        keepAlive: true,
        lookup: lookups.lookup,
        ...(protocol === "https:" ? tls : {}),
      })
      const connect = agent.createConnection.bind(agent)
      agent.createConnection = (options, callback) => {
        if (closed) {
          const denied = new Socket()
          if (callback) {
            denied.destroy()
            queueMicrotask(() => callback(lookupFailure(), denied))
            return
          }
          return denied.destroy(lookupFailure())
        }
        const socket = connect(
          options,
          callback
            ? (error, stream) => {
                track(stream)
                callback(error, stream)
              }
            : undefined
        )
        track(socket)
        return socket
      }
      agents.add(agent)
      return agent
    },
  })
  return {
    exporter,
    close(): Promise<void> {
      closed = true
      return (closing ??= (async () => {
        let failure = false
        const lookupClose = lookups.close()
        for (const agent of agents) {
          try {
            agent.destroy()
          } catch {
            failure = true
          }
        }
        // A close event, not destroyed=true, proves the owned stream has ended.
        let timer: NodeJS.Timeout | undefined
        const socketClose = new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => reject(lookupFailure()), 1000)
          void Promise.all([...sockets.values()]).then(() => {
            clearTimeout(timer)
            resolve()
          }, reject)
        })
        const results = await Promise.allSettled([
          lookupClose,
          socketClose,
          exporter.shutdown(),
        ])
        clearTimeout(timer)
        if (
          results[0]?.status === "rejected" ||
          results[1]?.status === "rejected" ||
          sockets.size
        )
          failure = true
        // Export failure is optional once all owned lookup/socket resources ended.
        if (failure) throw lookupFailure()
      })())
    },
  }
}
