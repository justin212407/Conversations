// Deliberately drops DNS packets on the owned internal network; never forwards.
import process from "node:process"
import { createSocket } from "node:dgram"
const server = createSocket("udp4")
let queries = 0
const report = (event) =>
  process.stdout.write(JSON.stringify({ shutdownDns: event, queries }) + "\n")
server.on("message", () => {
  queries++
  report("query")
})
server.on("error", () => {
  report("failed")
  process.exitCode = 1
  server.close()
})
server.bind(53, "0.0.0.0", () => report("ready"))
process.on("SIGTERM", () => {
  report("stopped")
  server.close()
})
