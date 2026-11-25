import process from "node:process"
import { createServer } from "node:net"
import { readFile } from "node:fs/promises"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { dirname, basename } from "node:path"
import { isIP } from "node:net"
import { fileURLToPath, URL } from "node:url"
import {
  childEnvironment,
  localDockerEndpoint,
  run,
  json,
  GateFailure,
  privateRunDirectory,
} from "./runtime.mjs"

export const repository = fileURLToPath(new URL("../../", import.meta.url))
export async function verifyDocker(execute = run, env = childEnvironment()) {
  const context = (
    await execute("docker", ["context", "show"], {
      env,
      stage: "docker-target",
    })
  ).output.trim()
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(context))
    throw new GateFailure("docker-target", "precondition")
  const inspected = json(
    (
      await execute("docker", ["context", "inspect", context], {
        env,
        stage: "docker-target",
      })
    ).output,
    "docker-target"
  )
  const endpoint = localDockerEndpoint(inspected?.[0]?.Endpoints?.docker?.Host)
  const prefix = ["--host", endpoint]
  const version = (
    await execute("docker", [...prefix, "compose", "version", "--short"], {
      env,
      stage: "compose-version",
    })
  ).output
    .trim()
    .replace(/^v/, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map(Number)
  if (
    version.length !== 3 ||
    version.some((v) => !Number.isFinite(v)) ||
    version[0] < 2 ||
    (version[0] === 2 &&
      (version[1] < 24 || (version[1] === 24 && version[2] < 4)))
  )
    throw new GateFailure("compose-version", "precondition")
  const info = json(
    (
      await execute(
        "docker",
        [...prefix, "info", "--format", "{{json .OperatingSystem}}"],
        { env, stage: "docker-daemon" }
      )
    ).output,
    "docker-daemon"
  )
  if (
    !endpoint.startsWith("unix:") &&
    !endpoint.startsWith("npipe:") &&
    !(typeof info === "string" && /Docker Desktop/i.test(info))
  )
    throw new GateFailure("docker-target", "precondition")
  return prefix
}
export async function reservations({ browser = false } = {}) {
  const servers = [],
    ports = {}
  try {
    for (const name of [
      "api",
      "worker",
      "realtime",
      "jaeger",
      "prom",
      ...(browser ? ["browser"] : []),
    ]) {
      const server = createServer()
      servers.push(server)
      await new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      ports[name] = server.address().port
    }
    return {
      ports,
      async release(name) {
        await Promise.all(
          servers
            .filter((_, index) => !name || Object.keys(ports)[index] === name)
            .map((server) =>
              server.listening
                ? new Promise((resolve) => server.close(resolve))
                : Promise.resolve()
            )
        )
      },
    }
  } catch (error) {
    for (const server of servers) server.close()
    throw error
  }
}
export async function prepare({ browser = false } = {}) {
  const owned = await privateRunDirectory()
  let ports
  try {
    ports = await reservations({ browser })
    const signing = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const secret = () => randomBytes(32).toString("base64url")
    const credentials = {
      metrics: secret(),
      realtime: secret(),
      database: secret(),
    }
    const image = owned.project + ":local"
    const fixture = await owned.write(
      "container-worker.mjs",
      await readFile(
        new URL(
          "../../apps/worker/test/fixtures/container-worker.mjs",
          import.meta.url
        ),
        "utf8"
      ),
      0o644
    )
    const prometheus = await owned.write(
      "prometheus.yml",
      `global:\n  scrape_interval: 1s\n  scrape_timeout: 1s\nscrape_configs:\n  - job_name: conversations-services\n    metrics_path: /metrics\n    authorization:\n      type: Bearer\n      credentials: ${credentials.metrics}\n    static_configs:\n      - targets: [api:4300, worker:4302, realtime:4301]\n`
    )
    const values = {
      REGRESSION_PROJECT: owned.project,
      REGRESSION_AUTHORIZED_PARTIES: browser
        ? "http://127.0.0.1:" + ports.ports.browser
        : "http://localhost:3000",
      REGRESSION_IMAGE: image,
      REGRESSION_DB_PASSWORD: credentials.database,
      REGRESSION_DATABASE_URL: `postgresql://conversations:${credentials.database}@postgres:5432/conversations`,
      METRICS_BEARER_TOKEN: credentials.metrics,
      REALTIME_INTERNAL_SECRET: credentials.realtime,
      CLERK_JWT_KEY: signing.publicKey
        .export({ type: "spki", format: "pem" })
        .replaceAll("\n", "\\n"),
      REGRESSION_WORKER_FIXTURE: fixture,
      REGRESSION_PROM_CONFIG: prometheus,
      OBSERVABILITY_UID: String(process.getuid?.() ?? 1000),
      OBSERVABILITY_GID: String(process.getgid?.() ?? 1000),
      TRACE_SAMPLE_RATIO: "1",
      CONVERSATIONS_POSTGRES_PORT: "1",
      CONVERSATIONS_REDIS_PORT: "1",
    }
    for (const [name, value] of Object.entries(ports.ports))
      values["REGRESSION_" + name.toUpperCase() + "_PORT"] = String(value)
    // Compose env-file double quotes decode the synthetic public PEM's escaped newlines.
    const envFile = await owned.write(
      "run.env",
      Object.entries(values)
        .map(
          ([name, value]) =>
            name + "=" + (name === "CLERK_JWT_KEY" ? '"' + value + '"' : value)
        )
        .join("\n") + "\n"
    )
    return {
      ...owned,
      ports: ports.ports,
      releasePorts: (name) => ports.release(name),
      signing,
      credentials,
      image,
      envFile,
    }
  } catch (error) {
    await ports?.release()
    await owned.remove()
    throw error
  }
}
export function composeController(
  owned,
  prefix,
  { execute = run, signal, env = childEnvironment(), files = [] } = {}
) {
  if (
    !Array.isArray(files) ||
    files.some(
      (file) =>
        typeof file !== "string" ||
        dirname(file) !== owned.directory ||
        !/^[a-z0-9.-]+$/.test(basename(file))
    )
  )
    throw new GateFailure("compose-files", "precondition")
  const base = [
    ...prefix,
    "compose",
    "--env-file",
    owned.envFile,
    "--project-directory",
    repository,
    "-p",
    owned.project,
    "-f",
    "docker-compose.regression.yml",
    ...files.flatMap((file) => ["-f", file]),
    "--profile",
    "observability",
  ]
  let cleaning
  const command = (args, stage, timeoutMs = 30000, customSignal = signal) =>
    execute("docker", [...base, ...args], {
      cwd: repository,
      env,
      stage,
      timeoutMs,
      signal: customSignal,
    })
  const resources = async () => {
    const label = "com.docker.compose.project=" + owned.project
    const remaining = []
    for (const kind of ["container", "network", "volume"]) {
      try {
        const result = await execute(
          "docker",
          [
            ...prefix,
            kind,
            "ls",
            ...(kind === "container" ? ["-a"] : []),
            "--filter",
            "label=" + label,
            "--format",
            kind === "volume" ? "{{.Name}}" : "{{.ID}}",
          ],
          { env, stage: "cleanup-check", timeoutMs: 15000 }
        )
        if (result.output.trim()) remaining.push(kind)
      } catch {
        remaining.push(kind)
      }
    }
    return remaining
  }
  return {
    command,
    async inspect(service) {
      if (!/^[a-z][a-z0-9-]{0,40}$/.test(service))
        throw new GateFailure("owned-service-inspect", "precondition")
      const id = (
        await command(["ps", "-a", "-q", service], "owned-service-id")
      ).output.trim()
      if (!/^[a-f0-9]{12,64}$/.test(id))
        throw new GateFailure("owned-service-inspect", "invalid_result")
      const result = json(
        (
          await execute("docker", [...prefix, "inspect", id], {
            env,
            stage: "owned-service-inspect",
            timeoutMs: 15000,
          })
        ).output,
        "owned-service-inspect"
      )
      const value =
        Array.isArray(result) && result.length === 1 ? result[0] : undefined
      if (
        value?.Config?.Labels?.["com.docker.compose.project"] !==
          owned.project ||
        !Number.isInteger(value?.State?.ExitCode) ||
        typeof value?.State?.OOMKilled !== "boolean" ||
        ![
          "created",
          "running",
          "paused",
          "restarting",
          "removing",
          "exited",
          "dead",
        ].includes(value?.State?.Status)
      )
        throw new GateFailure("owned-service-inspect", "invalid_result")
      const networks = Object.entries(value.NetworkSettings?.Networks ?? {})
      if (
        networks.length !== 1 ||
        networks[0][0] !== owned.project + "_default"
      )
        throw new GateFailure("owned-service-inspect", "invalid_result")
      const address = networks[0][1]?.IPAddress
      return {
        state: value.State.Status,
        exitCode: value.State.ExitCode,
        oomKilled: value.State.OOMKilled,
        addresses:
          typeof address === "string" && isIP(address) === 4 ? [address] : [],
      }
    },
    async cleanup() {
      if (cleaning) return cleaning
      cleaning = (async () => {
        let clean = true
        try {
          await owned.releasePorts()
        } catch {
          clean = false
        }
        try {
          await command(
            ["down", "--volumes", "--remove-orphans", "--timeout", "6"],
            "cleanup",
            45000,
            null
          )
        } catch {
          clean = false
        }
        if ((await resources()).length) clean = false
        try {
          // Only the exact unique tag produced by this run; shared build cache stays intact.
          const images = await execute(
            "docker",
            [
              ...prefix,
              "image",
              "ls",
              "--filter",
              "reference=" + owned.image,
              "--format",
              "{{.ID}}",
            ],
            { env, stage: "cleanup-image", timeoutMs: 15000 }
          )
          if (images.output.trim())
            await execute("docker", [...prefix, "image", "rm", owned.image], {
              env,
              stage: "cleanup-image",
              timeoutMs: 15000,
            })
        } catch {
          clean = false
        } finally {
          try {
            await owned.remove()
          } catch {
            clean = false
          }
        }
        return clean
      })()
      return cleaning
    },
    resources,
  }
}
