import {
  loadConfig,
  createResources,
  startService,
  reportStartupFailure,
} from "@conversations/service-runtime"
import { checkDatabaseSchema, ConversationStore } from "@conversations/database"
import { createApi } from "./app.js"
import { loadAuthConfig } from "./auth.js"

async function main() {
  const config = loadConfig("api")
  const auth = loadAuthConfig()
  const resources = createResources(config)
  const pool = resources.postgres
  if (!pool) throw new Error("Database resource unavailable")
  resources.dependencies.push({
    name: "schema",
    check: () => checkDatabaseSchema(pool),
  })
  const app = createApi(config, resources, new ConversationStore(pool), auth)
  await startService(app, config)
}
main().catch(reportStartupFailure)
