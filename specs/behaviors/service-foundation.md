# Service foundation

## Responsibilities and startup

API, worker, and realtime are independently runnable Node.js services. They validate required environment variables before opening network listeners. Each has a distinct port and structured logs carrying its service name. Shared infrastructure helpers are server-only; shared message/health contracts remain browser-safe.

The API and worker require PostgreSQL and Redis. Realtime requires Redis and does not connect directly to the conversation database. The frontend remains the existing Next.js app until the workspace issue is implemented.

## Health and shutdown

`GET /health/live` answers 200 when the process can serve requests. `GET /health/ready` answers 200 only when all required dependencies respond within a bounded timeout; otherwise 503. Readiness does not claim that later conversation features exist. A dependency failure returns a generic unhealthy result without leaking a connection URL or credential.

SIGINT/SIGTERM marks a service unready, stops accepting new work, drains active requests/jobs, closes clients, and exits. Shutdown has an explicit deadline to avoid an indefinitely hung process. The worker probes its actual BullMQ connection/readiness in addition to database connectivity.

A dedicated infrastructure probe job may exercise queue connectivity. It carries no conversation content and is separate from future generation queues.

## Local environment

Docker Compose provides persistent PostgreSQL and Redis volumes and the three new services. Redis uses noeviction and persistence for BullMQ. Published ports bind to loopback by default. The existing Next.js frontend has its own opt-in profile until Clerk configuration and workspace migration are ready.

Migrations run as an explicit one-shot step, not racing independently inside every service. Foundation has no domain migrations; #18 supplies them before conversation routes are enabled. Startup commands and dependencies are documented. No command deletes existing Convex data or host-wide Docker resources.

## Verification

Configuration failures, liveness/readiness distinction, dependency timeout/redaction, resource cleanup, actual PostgreSQL/Redis connectivity, queue handoff, and process shutdown are observable and verified. Foundation validation may pass while the legacy frontend still has separately documented build/runtime problems.
