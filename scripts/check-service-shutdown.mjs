import process from "node:process"
import { pathToFileURL } from "node:url"
import { runRegression } from "./regression/runner.mjs"

export async function main(args = process.argv.slice(2)) {
  for (const scenario of ["outage", "healthy", "disabled"]) {
    let module
    const exit = await runRegression(
      args,
      async () => {
        module = await import("./regression/shutdown.mjs")
        return module.verifyShutdown
      },
      {
        beforeStart: (owned, context) =>
          module.configureShutdown(owned, context, scenario),
        makeCompose: (owned, prefix, options) =>
          module.shutdownCompose(owned, prefix, options),
        beforeUp: (owned, docker, context) =>
          module.startShutdownDns(owned, docker, context),
        services: ["postgres", "redis", "jaeger", "migrate", "api"],
        timeoutMs: 5 * 60 * 1000,
      }
    )
    if (exit !== 0) return exit
  }
  return 0
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
