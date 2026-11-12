import * as Sentry from "@sentry/nextjs"
import { initializeDiagnostics } from "./modules/diagnostics/policy"

initializeDiagnostics(Sentry, "browser", process.env.NEXT_PUBLIC_SENTRY_DSN)
