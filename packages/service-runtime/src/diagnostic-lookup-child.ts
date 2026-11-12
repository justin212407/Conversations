// Shipped one-shot OS lookup worker: no app configuration, providers or logs.
import { lookup } from "node:dns"
import {
  lookupRequest,
  lookupMessage,
  lookupCode,
} from "./diagnostic-lookup.js"

process.once("message", (value: unknown) => {
  const send = (result: unknown) => {
    const safe = lookupMessage(result) ?? { ok: false, code: "EFAIL" }
    if (process.connected) process.send?.(safe, () => process.disconnect())
  }
  const request = lookupRequest.safeParse(value)
  if (!request.success) {
    send({ ok: false, code: "EFAIL" })
    return
  }
  try {
    lookup(
      request.data.hostname,
      request.data.options,
      (error, result, family) => {
        if (error)
          send({
            ok: false,
            code: lookupCode.safeParse(error.code).data ?? "EFAIL",
          })
        else if (Array.isArray(result)) send({ ok: true, results: result })
        else if (family === 4 || family === 6)
          send({ ok: true, result: { address: result, family } })
        else send({ ok: false, code: "EFAIL" })
      }
    )
  } catch {
    send({ ok: false, code: "EFAIL" })
  }
})
