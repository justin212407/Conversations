import * as Sentry from "@sentry/nextjs"
import { initializeDiagnostics } from "./modules/diagnostics/policy"

initializeDiagnostics(Sentry, "edge", process.env.SENTRY_DSN)
