import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"
import type { ConversationStore } from "@conversations/database"
import {
  TEXT_GENERATION_QUEUE,
  provisionalChannel,
  textGenerationJobSchema,
  type TextGenerationJob,
} from "@conversations/shared"
import { redisConnectionOptions } from "@conversations/service-runtime"
import type { TextProvider } from "./provider.js"
import { createTextRunner } from "./text-runner.js"

async function enqueue(queue: Queue, command: TextGenerationJob) {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      queue.add("text.generate", command, {
        jobId: command.operationId,
        attempts: 1,
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Text queue unavailable")),
          2000
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Publish before acknowledgement. A crash between them replays the same queue identity. */
export async function relayTextHandoffs(
  store: ConversationStore,
  queue: Queue,
  options: {
    shouldStop?: () => boolean
    afterEnqueue?: () => Promise<void>
  } = {}
) {
  const claimed = await store.handoff.claim("job", {
    limit: 25,
    leaseMs: 10000,
  })
  for (const row of claimed) {
    if (options.shouldStop?.()) break
    const parsed = textGenerationJobSchema.safeParse(row.payload)
    if (
      !parsed.success ||
      row.type !== "text.generate" ||
      parsed.data.operationId !== row.operationId ||
      parsed.data.conversationId !== row.conversationId
    )
      continue
    await enqueue(queue, parsed.data)
    await options.afterEnqueue?.()
    if (row.leaseToken) await store.handoff.acknowledge(row.id, row.leaseToken)
  }
}

export function createTextRuntime(options: {
  store: ConversationStore
  redisUrl: string
  prefix: string
  provider: TextProvider
  timeoutMs: number
  schemaReady?: () => Promise<unknown>
}) {
  const connection = redisConnectionOptions(options.redisUrl)
  const queue = new Queue<TextGenerationJob>(TEXT_GENERATION_QUEUE, {
    prefix: options.prefix,
    connection: {
      ...connection,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      commandTimeout: 1500,
    },
  })
  const publisher = new Redis({
    ...connection,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1500,
    commandTimeout: 1500,
  })
  publisher.on("error", () => {})
  void publisher.connect().catch(() => {})
  queue.on("error", () => {})
  const runner = createTextRunner({
    store: options.store,
    provider: options.provider,
    timeoutMs: options.timeoutMs,
    publish: (snapshot) =>
      publisher.publish(
        provisionalChannel(snapshot.conversationId),
        JSON.stringify(snapshot)
      ),
  })
  const worker = new Worker<TextGenerationJob>(
    TEXT_GENERATION_QUEUE,
    (job) =>
      job.name === "text.generate"
        ? runner.execute(job.data, job.id)
        : Promise.resolve({ status: "ignored" }),
    {
      prefix: options.prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: null,
        connectTimeout: 1500,
      },
      concurrency: 2,
      autorun: false,
    }
  )
  worker.on("error", () => {})
  worker.on("failed", () => {}) // Safe state is persisted by runner or recovered from PG lease.
  let stopping = false,
    started = false,
    ticking: Promise<void> | undefined,
    timer: NodeJS.Timeout | undefined,
    lastRecovery = 0
  async function tick() {
    if (stopping || ticking) return
    ticking = (async () => {
      if (!started) {
        await options.schemaReady?.()
        if (stopping) return
        started = true
        void worker.run().catch(() => {})
      }
      if (!stopping && Date.now() - lastRecovery >= 5000) {
        lastRecovery = Date.now()
        await options.store.commands.interruptExpiredTextOperations(
          25,
          () => stopping
        )
      }
      await relayTextHandoffs(options.store, queue, {
        shouldStop: () => stopping,
      })
    })()
      .catch(() => {})
      .finally(() => {
        ticking = undefined
      })
    await ticking
  }
  return {
    queue,
    worker,
    start() {
      if (timer || stopping) return
      timer = setInterval(() => {
        void tick()
      }, 250)
      void tick()
    },
    async check() {
      if (
        stopping ||
        !started ||
        !options.provider.available ||
        !worker.isRunning() ||
        worker.isPaused()
      )
        throw new Error("Text generation unavailable")
      await worker.waitUntilReady()
      await worker.getBackend().getCounts(["active"])
    },
    async stopIntake() {
      stopping = true
      if (timer) clearInterval(timer)
      await worker.pause(true)
      runner.stop()
    },
    async close() {
      stopping = true
      if (timer) clearInterval(timer)
      runner.stop()
      await ticking
      await runner.drain()
      // Domain work is durable before Redis shutdown. Force-closing the queue
      // intake avoids a disconnected blocking client delaying process exit.
      try {
        await worker.close(true)
      } finally {
        try {
          await queue.close()
        } finally {
          publisher.disconnect()
        }
      }
    },
  }
}
