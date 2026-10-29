import { z } from "zod"
import { deterministicProvider, geminiProvider } from "./provider.js"

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  TEXT_PROVIDER: z.enum(["gemini", "deterministic"]).default("gemini"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z.string().min(1).optional()
  ),
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .default("gemini-3.5-flash-lite"),
  TEXT_GENERATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120000)
    .default(60000),
  TEXT_QUEUE_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,80}$/)
    .default("conversations"),
})
export function loadTextConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env)
  if (!result.success)
    throw new Error(
      "Invalid text configuration: " +
        [
          ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
        ].join(", ")
    )
  const config = result.data
  if (
    config.NODE_ENV === "production" &&
    (config.TEXT_PROVIDER !== "gemini" || !config.GOOGLE_GENERATIVE_AI_API_KEY)
  )
    throw new Error("Production text generation requires configured Gemini")
  return config
}
export type TextConfig = ReturnType<typeof loadTextConfig>
export function createTextProvider(config: TextConfig) {
  return config.TEXT_PROVIDER === "deterministic"
    ? deterministicProvider()
    : geminiProvider({
        apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
        model: config.GEMINI_MODEL,
        timeoutMs: config.TEXT_GENERATION_TIMEOUT_MS,
      })
}
