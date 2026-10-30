import {
  Diagnostics,
  loadConfig,
  createResources,
  startService,
  reportStartupFailure,
  loadRealtimeConfig,
} from "@conversations/service-runtime"
import { checkDatabaseSchema, ConversationStore } from "@conversations/database"
import { createApi } from "./app.js"
import { loadAuthConfig } from "./auth.js"
import { createRealtimeApi, createEventRelay } from "./realtime.js"

async function main() {
  const config = loadConfig("api")
  const diagnostics = new Diagnostics(config)
  const auth = loadAuthConfig()
  const realtimeConfig = loadRealtimeConfig()
  const resources = createResources(config)
  const pool = resources.postgres
  if (!pool) throw new Error("Database resource unavailable")
  resources.dependencies.push({
    name: "schema",
    check: () => checkDatabaseSchema(pool),
  })
  const store = new ConversationStore(pool)
  const realtime = createRealtimeApi({
    store,
    redis: resources.redis,
    auth,
    config: realtimeConfig,
  })
  const relay = createEventRelay(store, resources.redis, diagnostics)
  const app = createApi(
    config,
    {
      ...resources,
      async stopIntake() {
        relay.stop()
      },
      async close() {
        await relay.close()
        await resources.close()
      },
    },
    store,
    auth,
    undefined,
    realtime,
    diagnostics
  )
  relay.start()
  await startService(app, config)
}
main().catch(reportStartupFailure)
