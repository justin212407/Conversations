import * as Sentry from "@sentry/nextjs"
import { reportFailure } from "./modules/diagnostics/policy"

export async function register() {
  try {
    if (process.env.NEXT_RUNTIME === "nodejs")
      await import("./sentry.server.config")
    if (process.env.NEXT_RUNTIME === "edge")
      await import("./sentry.edge.config")
  } catch {
    // Optional diagnostics cannot prevent startup.
  }
}

export const onRequestError = () => {
  reportFailure(Sentry.captureEvent, "request_error")
}
