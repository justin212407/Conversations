import { Worker } from "bullmq"
import { ConversationStore, checkDatabaseSchema } from "@conversations/database"
import { loadTextConfig, createTextProvider } from "./text-config.js"
import { createTextRuntime } from "./text-runtime.js"
import {
  FOUNDATION_QUEUE,
  probeJobSchema,
  type ProbeJob,
  type ProbeResult,
} from "@conversations/shared"
import {
  Diagnostics,
  loadConfig,
  redisConnectionOptions,
  createResources,
  createHealthServer,
  startService,
  reportStartupFailure,
} from "@conversations/service-runtime"

async function main() {
  const config = loadConfig("worker")
  const diagnostics = new Diagnostics(config)
  const textConfig = loadTextConfig()
  const provider = createTextProvider(textConfig)
  const resources = createResources(config)
  if (!resources.postgres) throw new Error("Worker persistence unavailable")
  const text = createTextRuntime({
    store: new ConversationStore(resources.postgres),
    diagnostics,
    redisUrl: config.REDIS_URL,
    prefix: textConfig.TEXT_QUEUE_PREFIX,
    provider,
    timeoutMs: textConfig.TEXT_GENERATION_TIMEOUT_MS,
    schemaReady: () => checkDatabaseSchema(resources.postgres!),
  })
  const worker = new Worker<ProbeJob, ProbeResult>(
    FOUNDATION_QUEUE,
    async (job) => {
      if (job.name !== "probe") throw new Error("Unsupported foundation job")
      const payload = probeJobSchema.parse(job.data)
      return { probeId: payload.probeId, service: "worker" }
    },
    {
      connection: {
        ...redisConnectionOptions(config.REDIS_URL),
        maxRetriesPerRequest: null,
      },
      concurrency: 1,
    }
  )
  worker.on("error", () => {}) // Report availability through readiness; never expose Redis credentials.
  const app = createHealthServer(
    config,
    {
      stopIntake: async () => {
        await Promise.all([worker.pause(true), text.worker.pause(true)])
        await text.stopIntake()
      },
      dependencies: [
        ...resources.dependencies,
        {
          name: "schema",
          check: () => checkDatabaseSchema(resources.postgres!),
        },
        { name: "generation", check: () => text.check() },
        {
          name: "queue",
          check: async () => {
            if (!worker.isRunning() || worker.isPaused())
              throw new Error("Worker unavailable")
            await worker.waitUntilReady()
            await worker.getBackend().getCounts(["active"])
          },
        },
      ],
      async close() {
        try {
          await Promise.all([worker.close(true), text.close()])
        } finally {
          await resources.close()
        }
      },
    },
    undefined,
    diagnostics
  )
  worker.on("failed", (job) =>
    app.log.warn({ jobId: job?.id }, "Foundation probe failed")
  )
  worker.on("completed", (job) =>
    app.log.info({ jobId: job.id }, "Foundation probe completed")
  )
  text.start()
  await startService(app, config)
}
main().catch(reportStartupFailure)
