import {
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
  const realtimeConfig = loadRealtimeConfig()
  const resources = createResources(config)
  const app = createHealthServer(config, {
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
  })
  const gateway = createGateway({
    server: app.server,
    redisUrl: config.REDIS_URL,
    config: realtimeConfig,
  })
  await startService(app, config)
}
main().catch(reportStartupFailure)
