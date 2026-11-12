import process from "node:process"
import { pathToFileURL } from "node:url"
import { runRegression } from "./regression/runner.mjs"
import { prepare } from "./regression/compose.mjs"

export async function main(args = process.argv.slice(2)) {
  let verifier
  return runRegression(
    args,
    async () => {
      verifier = await import("./regression/workspace-browser.mjs")
      return verifier.verifyWorkspaceBrowser
    },
    {
      timeoutMs: args.some((value) => value.startsWith("--fault=browser-"))
        ? 5 * 60 * 1000
        : 25 * 60 * 1000,
      prepareRun: () => prepare({ browser: true }),
      beforeStart: (owned, context) =>
        verifier.prepareWorkspaceBrowser(owned, context),
      faults: [
        "browser-after-launch",
        "browser-deadline",
        "browser-sigint",
        "browser-sigterm",
      ],
    }
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await main()
