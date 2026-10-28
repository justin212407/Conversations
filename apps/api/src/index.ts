import {
  loadConfig,
  createResources,
  createHealthServer,
  startService,
  reportStartupFailure,
} from "@conversations/service-runtime"

async function main() {
  const config = loadConfig("api")
  const resources = createResources(config)
  const app = createHealthServer(config, resources)
  await startService(app, config)
}
main().catch(reportStartupFailure)
