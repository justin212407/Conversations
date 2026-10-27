import { randomUUID } from "node:crypto"
import { Queue, QueueEvents } from "bullmq"
import {
  FOUNDATION_QUEUE,
  type ProbeJob,
  type ProbeResult,
} from "@conversations/shared"
import { redisConnectionOptions } from "@conversations/service-runtime"

async function probe() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required")
  const connection = {
    ...redisConnectionOptions(process.env.REDIS_URL),
    maxRetriesPerRequest: 1,
  }
  const queue = new Queue<ProbeJob, ProbeResult>(FOUNDATION_QUEUE, {
    connection,
  })
  const events = new QueueEvents(FOUNDATION_QUEUE, {
    connection: { ...connection, maxRetriesPerRequest: null },
  })
  queue.on("error", () => {})
  events.on("error", () => {})
  const deadline = setTimeout(() => {
    console.error("Foundation queue probe timed out")
    process.exit(1)
  }, 15000)
  try {
    await events.waitUntilReady()
    const probeId = randomUUID()
    const job = await queue.add(
      "probe",
      { version: 1, probeId, sentAt: new Date().toISOString() },
      {
        jobId: probeId,
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    )
    const result = await job.waitUntilFinished(events, 10000)
    if (result.probeId !== probeId || result.service !== "worker")
      throw new Error("Unexpected probe response")
    console.log(
      JSON.stringify({ status: "passed", queue: FOUNDATION_QUEUE, ...result })
    )
  } finally {
    await Promise.all([queue.close(), events.close()])
    clearTimeout(deadline)
  }
}
probe().catch(() => {
  console.error(
    "Foundation queue probe failed; check Redis and worker readiness"
  )
  process.exitCode = 1
})
