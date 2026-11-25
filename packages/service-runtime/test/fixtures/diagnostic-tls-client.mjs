import process from "node:process"
import { Diagnostics } from "../../dist/diagnostics.js"
import { loadConfig } from "../../dist/config.js"
const diag = new Diagnostics(
  loadConfig("api", {
    NODE_ENV: "test",
    REDIS_URL: "redis://127.0.0.1:1",
    DATABASE_URL: "postgresql://test:test@127.0.0.1/test",
    LOG_LEVEL: "silent",
    TRACE_SAMPLE_RATIO: "1",
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.argv[2],
  })
)
try {
  await diag.run("http", {}, async () => {})
  await diag.shutdown()
} catch {
  process.exitCode = 1
}
