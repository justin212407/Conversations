import * as Sentry from "@sentry/nextjs"

// Detailed collectors/instrumentation belong to #24. Never capture transcripts,
// credentials, URL breadcrumbs, replay or PII by default.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  enableLogs: false,
  sendDefaultPii: false,
  beforeBreadcrumb: () => null,
  beforeSend(event) {
    delete event.request
    delete event.extra
    delete event.user
    delete event.contexts
    delete event.message
    event.breadcrumbs = []
    for (const exception of event.exception?.values ?? [])
      exception.value = "Application error"
    return event
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
