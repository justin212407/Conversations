// Explicit test entrypoint, privately mounted by the regression gate.
// The production worker/config never selects this provider.
import process from "node:process"
import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { ConversationStore, checkDatabaseSchema } from "@conversations/database"
import {
  Diagnostics,
  loadConfig,
  createResources,
  createHealthServer,
  startService,
  reportStartupFailure,
} from "@conversations/service-runtime"
import { createTextRuntime } from "../../dist/text-runtime.js"

async function main() {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test fixture unavailable")
  const config = loadConfig("worker"),
    diagnostics = new Diagnostics(config),
    resources = createResources(config)
  const seen = new Map()
  const provider = {
    available: true,
    async *stream(context, signal) {
      const digest = createHash("sha256")
        .update(
          JSON.stringify(
            context.map(({ role, content }) => ({ role, content }))
          )
        )
        .digest("hex")
      const failing = context
        .at(-1)
        ?.content.startsWith("REGRESSION_FAIL_ONCE:")
      const attempts = seen.get(digest) ?? 0
      if (seen.size >= 20 && !seen.has(digest))
        throw new Error("Test fixture capacity")
      seen.set(digest, attempts + 1)
      yield "Context digest: "
      await delay(220, undefined, { signal })
      if (signal.aborted) throw new Error("Test fixture interrupted")
      if (failing && attempts === 0)
        throw new Error("PRIVATE_PROVIDER_EXCEPTION_CANARY")
      yield digest
    },
  }
  const text = createTextRuntime({
    store: new ConversationStore(resources.postgres),
    diagnostics,
    redisUrl: config.REDIS_URL,
    prefix: process.env.TEXT_QUEUE_PREFIX,
    provider,
    timeoutMs: 5000,
    schemaReady: () => checkDatabaseSchema(resources.postgres),
  })
  const app = createHealthServer(
    config,
    {
      dependencies: [
        ...resources.dependencies,
        {
          name: "schema",
          check: () => checkDatabaseSchema(resources.postgres),
        },
        { name: "generation", check: () => text.check() },
      ],
      stopIntake: () => text.stopIntake(),
      async close() {
        try {
          await text.close()
        } finally {
          await resources.close()
        }
      },
    },
    undefined,
    diagnostics
  )
  text.start()
  await startService(app, config)
}
main().catch(reportStartupFailure)
