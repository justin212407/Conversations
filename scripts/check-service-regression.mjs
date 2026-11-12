import process from "node:process"
import { pathToFileURL } from "node:url"
import { runRegression } from "./regression/runner.mjs"

export async function main(args = process.argv.slice(2)) {
  return runRegression(
    args,
    async () => (await import("./regression/lifecycle.mjs")).verifyLifecycle
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
