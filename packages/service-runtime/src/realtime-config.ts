import { z } from "zod"

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4303",
  "http://127.0.0.1:4303",
]
export function loadRealtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const schema = z.object({
    REALTIME_INTERNAL_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{43,256}$/)
        .optional()
    ),
    REALTIME_ALLOW_PRIVATE_HTTP: z.enum(["true", "false"]).default("false"),
    REALTIME_PUBLIC_URL: z
      .string()
      .url()
      .default("ws://localhost:4301/v1/connect"),
    REALTIME_API_URL: z.string().url().default("http://127.0.0.1:4300"),
    REALTIME_REDIS_PREFIX: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,80}$/)
      .default("conversations-realtime"),
    REALTIME_ACCESS_CHECK_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(15000)
      .default(5000),
    REALTIME_HEARTBEAT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30000)
      .default(15000),
  })
  const result = schema.safeParse(env)
  if (!result.success)
    throw new Error(
      "Invalid realtime configuration: " +
        [
          ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
        ].join(", ")
    )
  const config = result.data
  const configuredOrigins = env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const origins = configuredOrigins?.length
    ? configuredOrigins
    : env.NODE_ENV === "production"
      ? []
      : defaultOrigins
  try {
    const publicUrl = new URL(config.REALTIME_PUBLIC_URL),
      api = new URL(config.REALTIME_API_URL)
    if (
      !["ws:", "wss:"].includes(publicUrl.protocol) ||
      publicUrl.pathname !== "/v1/connect" ||
      publicUrl.search ||
      publicUrl.hash ||
      publicUrl.username ||
      publicUrl.password ||
      !["http:", "https:"].includes(api.protocol) ||
      api.username ||
      api.password ||
      api.search ||
      api.hash ||
      api.pathname !== "/"
    )
      throw new Error()
    if (
      origins.some((value) => {
        const url = new URL(value)
        return (
          !["http:", "https:"].includes(url.protocol) ||
          (env.NODE_ENV === "production" && url.protocol !== "https:") ||
          url.origin !== value ||
          !!url.username ||
          !!url.password
        )
      })
    )
      throw new Error()
    if (
      env.NODE_ENV === "production" &&
      (!config.REALTIME_INTERNAL_SECRET ||
        !origins.length ||
        publicUrl.protocol !== "wss:" ||
        (api.protocol !== "https:" &&
          config.REALTIME_ALLOW_PRIVATE_HTTP !== "true"))
    )
      throw new Error()
  } catch {
    throw new Error("Invalid realtime service configuration")
  }
  return { ...config, origins }
}
export type RealtimeConfig = ReturnType<typeof loadRealtimeConfig>
