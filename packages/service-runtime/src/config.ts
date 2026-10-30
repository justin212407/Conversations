import { z } from "zod"
import type { ServiceName } from "@conversations/shared"

const address = (protocols: string[]) =>
  z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value)
      return protocols.includes(url.protocol) && !!url.hostname
    }, "must use a supported connection protocol")
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  METRICS_BEARER_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{43,256}$/)
      .optional()
  ),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(0.1),
  OBSERVABILITY_ALLOW_PRIVATE_HTTP: z.enum(["true", "false"]).default("false"),
  REDIS_URL: address(["redis:", "rediss:"]).refine((value) => {
    const db = new URL(value).pathname.slice(1)
    return db === "" || /^\d+$/.test(db)
  }, "must contain a nonnegative database number"),
  DATABASE_URL: address(["postgres:", "postgresql:"]).optional(),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(10000),
})
export type ServiceConfig = z.infer<typeof envSchema> & { service: ServiceName }

export function loadConfig(
  service: ServiceName,
  env: NodeJS.ProcessEnv = process.env
): ServiceConfig {
  const ports = { api: 4300, realtime: 4301, worker: 4302 }
  const parsed = envSchema.safeParse({
    ...env,
    PORT: env.PORT ?? ports[service],
  })
  if (!parsed.success) {
    // Deliberately report field names only: a URL can contain a password.
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ]
    throw new Error("Invalid service configuration: " + fields.join(", "))
  }
  if (service !== "realtime" && !parsed.data.DATABASE_URL) {
    throw new Error("Invalid service configuration: DATABASE_URL is required")
  }
  if (parsed.data.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    const url = new URL(parsed.data.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT)
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (parsed.data.NODE_ENV === "production" &&
        url.protocol !== "https:" &&
        parsed.data.OBSERVABILITY_ALLOW_PRIVATE_HTTP !== "true")
    )
      throw new Error(
        "Invalid service configuration: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
      )
  }
  return { ...parsed.data, service }
}

export function redisConnectionOptions(connectionUrl: string) {
  const url = new URL(connectionUrl)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  }
}
