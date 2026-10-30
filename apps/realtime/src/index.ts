import {
  Diagnostics,
  loadConfig,
  createResources,
  createHealthServer,
  startService,
  reportStartupFailure,
  loadRealtimeConfig,
} from "@conversations/service-runtime"
import { createGateway } from "./gateway.js"

async function main() {
  const config = loadConfig("realtime")
  const diagnostics = new Diagnostics(config)
  const realtimeConfig = loadRealtimeConfig()
  const resources = createResources(config)
  const app = createHealthServer(
    config,
    {
      ...resources,
      dependencies: [
        ...resources.dependencies,
        {
          name: "gateway",
          check: async () => {
            await gateway.check()
          },
        },
      ],
      async stopIntake() {
        gateway.stop()
      },
      async close() {
        await gateway.close()
        await resources.close()
      },
    },
    undefined,
    diagnostics
  )
  const gateway = createGateway({
    server: app.server,
    redisUrl: config.REDIS_URL,
    config: realtimeConfig,
    diagnostics,
  })
  await startService(app, config)
}
main().catch(reportStartupFailure)
