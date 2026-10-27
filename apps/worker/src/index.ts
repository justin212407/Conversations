import { Worker } from "bullmq"
import {
  FOUNDATION_QUEUE,
  probeJobSchema,
  type ProbeJob,
  type ProbeResult,
} from "@conversations/shared"
import {
  loadConfig,
  redisConnectionOptions,
  createResources,
  createHealthServer,
  startService,
  reportStartupFailure,
} from "@conversations/service-runtime"

async function main() {
  const config = loadConfig("worker")
  const resources = createResources(config)
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
  const app = createHealthServer(config, {
    dependencies: [
      ...resources.dependencies,
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
        await worker.close()
      } finally {
        await resources.close()
      }
    },
  })
  worker.on("failed", (job) =>
    app.log.warn({ jobId: job?.id }, "Foundation probe failed")
  )
  worker.on("completed", (job) =>
    app.log.info({ jobId: job.id }, "Foundation probe completed")
  )
  await startService(app, config)
}
main().catch(reportStartupFailure)
