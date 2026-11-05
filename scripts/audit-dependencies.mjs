import process from "node:process"
import { scanDependencies } from "./regression/audit.mjs"
import { repository } from "./regression/compose.mjs"
const result = await scanDependencies({ cwd: repository })
console.log(JSON.stringify(result.report, null, 2))
process.exitCode = result.exitCode
