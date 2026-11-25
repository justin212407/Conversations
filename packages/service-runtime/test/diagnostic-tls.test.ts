import assert from "node:assert/strict"
import { test } from "node:test"
import { TLSSocket } from "node:tls"
import { createServer } from "node:https"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  privateRunDirectory,
  run,
  childEnvironment,
} from "../../../scripts/regression/runtime.mjs"

for (const mode of ["generic", "specific", "mtls", "specific-missing"])
  test(
    "compiled default exporter preserves synthetic OTLP TLS environment: " +
      mode,
    { timeout: 15000 },
    async (t) => {
      const owned = await privateRunDirectory()
      t.after(() => owned.remove())
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          join(owned.directory, "key.pem"),
          "-out",
          join(owned.directory, "cert.pem"),
          "-days",
          "1",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost",
        ],
        { stdio: "ignore" }
      )
      const key = await readFile(join(owned.directory, "key.pem")),
        cert = await readFile(join(owned.directory, "cert.pem"))
      let requests = 0,
        authorized = false
      const server = createServer(
        {
          key,
          cert,
          ...(mode === "mtls"
            ? { ca: cert, requestCert: true, rejectUnauthorized: true }
            : {}),
        },
        (request, response) => {
          requests++
          authorized =
            request.socket instanceof TLSSocket && request.socket.authorized
          request.resume()
          response.end()
        }
      )
      t.after(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      })
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      )
      const address = server.address()
      if (!address || typeof address === "string")
        throw Error("Missing listener")
      const tls: NodeJS.ProcessEnv = {
        OTEL_EXPORTER_OTLP_CERTIFICATE:
          mode === "specific" ? "missing-generic.pem" : "cert.pem",
      }
      if (mode === "specific" || mode === "mtls")
        tls.OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE = "cert.pem"
      if (mode === "specific-missing")
        tls.OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE = "missing-specific.pem"
      if (mode === "mtls")
        Object.assign(tls, {
          OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: "missing-generic.pem",
          OTEL_EXPORTER_OTLP_CLIENT_KEY: "missing-generic.pem",
          OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE: "cert.pem",
          OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY: "key.pem",
        })
      const result = await run(
        process.execPath,
        [
          fileURLToPath(
            new URL("./fixtures/diagnostic-tls-client.mjs", import.meta.url)
          ),
          "https://localhost:" + address.port + "/v1/traces",
        ],
        {
          cwd: owned.directory,
          env: { ...childEnvironment(), ...tls },
          stage: "synthetic-tls-client",
          timeoutMs: 5000,
        }
      )
      assert.equal(result.code, 0)
      assert.equal(requests, mode === "specific-missing" ? 0 : 1)
      if (mode === "mtls") assert.equal(authorized, true)
    }
  )
