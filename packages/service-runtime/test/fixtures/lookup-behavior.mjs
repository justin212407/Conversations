import process from "node:process"
import { setInterval, setTimeout } from "node:timers"
const mode = process.argv[2]
if (mode === "term-resistant" || mode === "valid-term-resistant")
  process.on("SIGTERM", () => {})
process.once("message", () => {
  if (mode === "exit") process.exitCode = 2
  else if (mode === "bad")
    process.send({
      ok: true,
      result: { address: "PRIVATE_LOOKUP_CANARY", family: 4 },
    })
  else if (mode === "oversized") process.send("x".repeat(70000))
  else if (mode === "valid-term-resistant") {
    setTimeout(
      () =>
        process.send({ ok: true, result: { address: "127.0.0.1", family: 4 } }),
      100
    )
  } else if (mode === "late") {
    process.send({ ok: true, result: { address: "127.0.0.1", family: 4 } })
    setTimeout(() => process.send({ ok: false, code: "EFAIL" }), 200)
  }
  if (mode !== "exit") setInterval(() => {}, 1000)
  else process.disconnect()
})
