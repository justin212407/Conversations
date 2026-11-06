import * as Sentry from "@sentry/nextjs"
import { initializeDiagnostics } from "./modules/diagnostics/policy"

initializeDiagnostics(Sentry, "node", process.env.SENTRY_DSN)
