# Architecture

## Slice 1 boundary

The primary product is a personal developer workspace in `apps/web`. Accounts own conversations and messages directly. Projects/files/context are Slice 4; agent runs/tools/approvals are Slice 5. The old `apps/widget` and Convex code remain isolated during migration and are retired only when their replacements are verified.

The user chose a fresh PostgreSQL workspace on 2026-10-28. Existing Convex data must remain untouched; Slice 1 has no import or deletion job against Convex.

## Responsibilities

- Frontend: Next.js/React and shared UI, Clerk sign-in, REST commands/history, WebSocket application updates, and a voice-provider adapter.
- API: Fastify on Node.js/TypeScript; verifies Clerk identity, resolves personal accounts, owns authorization, conversation rules, provider ingestion, OpenAPI, and PostgreSQL transactions.
- Worker: Node.js/TypeScript with BullMQ; executes text-response generation, loads context, persists results through the shared domain layer, and emits versioned application events. It never regenerates turns already answered by the voice provider.
- Realtime: raw WebSockets; authenticates subscriptions, handles heartbeats and reconnect, and delivers events. It makes no conversation business decisions and does not write conversation tables.
- PostgreSQL/Drizzle: authoritative conversation history, identities, operations, and reliable event/job handoff state. Migrations are explicit and repeatable.
- Redis: ephemeral coordination, realtime fan-out, and BullMQ. Final history never depends on a Redis-only record.

Browser-safe contracts live separately from server-only infrastructure. No voice SDK or database client belongs in the browser-safe contract package.

Realtime has no PostgreSQL client or conversation writes. The API owns ticket redemption, periodic signed-session/access checks, consistent history checkpoints and durable-event relay. API/realtime share only a server-side internal service secret; browser transports receive opaque one-use tickets and versioned application data. Redis interruption invalidates socket continuity and forces subscribe-before-snapshot recovery.

## Response ownership

Text prompts are API-owned commands executed by the worker behind an AI-provider interface. Vapi owns live voice response generation. The API ingests authenticated provider conversation updates and final call reports through a provider adapter; browser transcript events are display previews, not trusted durable writes. A voice turn does not enqueue text generation.

A new voice session is linked to an account-owned conversation before use. The adapter supplies persisted completed context to that session. Server callbacks are authenticated using provider credentials and checked against the registered session; unrecognized/mismatched call IDs cannot mutate history. Durable turn identity must distinguish repeated identical utterances and deduplicate repeated provider deliveries.

The integration must be proven against real provider events before #23 is closed. Supported provider mechanisms are documented in [Vapi server events](https://docs.vapi.ai/server-url/events) and [server authentication](https://docs.vapi.ai/server-url/server-authentication). Authentication configuration belongs on trusted saved provider resources; credentials are not sent to the browser.

## Operations

Use Docker Compose locally with persistent PostgreSQL and Redis volumes and independently runnable frontend/API/worker/realtime processes. Railway is the initial deployment target; provisioning and deployment evidence belong to #26 and require the actual account/configuration. No cloud deployment is claimed by this specification.

Use structured Pino logs, OpenTelemetry traces, and Prometheus metrics. Local trace/metric collectors are introduced with #24. Correlation follows HTTP requests, jobs, provider calls, and application events. Tokens, database URLs, secrets, and transcript contents are excluded from default logs.

## Principles

- A displayed completed turn must survive a browser reload.
- Account ownership is enforced at the API and subscription boundaries, even without teams.
- Reconnect recovers authoritative history; duplicate delivery must not duplicate a turn.
- Preserve the working frontend foundation while moving domain behavior behind explicit service contracts.
- Keep provider-specific behavior behind adapters and distinguish implemented behavior from planned behavior in all status reports.
