# Local development

The [Slice 1](slice-1.md) services provide API/worker/realtime processes, health checks, and a real queue probe. PostgreSQL/Drizzle and Clerk support personal accounts, owned conversation CRUD/history, durable text generation, and controlled retry. [Conversation API guidance](conversation-api.md) describes the implemented routes and server-only handoff/finalization interfaces; runtime OpenAPI is at `/openapi.json`. [Text generation](text-generation.md) describes the separate Gemini worker and deterministic verification. [Authenticated realtime](realtime.md) provides socket delivery and browser recovery; workspace UI remains #22.

## Prerequisites

- Node.js 22 and pnpm 10.4.1 (the version in `packageManager`).
- Docker with Compose v2 for PostgreSQL/Redis and optional service containers.
- No Clerk, voice, or model credentials are required for foundation verification.
- Tests and smoke require PostgreSQL `CREATE DATABASE` permission: each run creates and drops uniquely named temporary databases. Set `TEST_DATABASE_URL` to override the local test admin connection; no test truncates or migrates the shared base database.

## Run the containerized foundation

```sh
cp .env.example .env
# Set TEXT_PROVIDER=deterministic for credential-free development.
# For real generation, configure GOOGLE_GENERATIVE_AI_API_KEY instead.
# Set REALTIME_INTERNAL_SECRET to a fresh secret shared by API/realtime.
docker compose up --build -d
docker compose ps
curl --fail http://localhost:4300/health/ready
curl --fail http://localhost:4301/health/ready
curl --fail http://localhost:4302/health/ready
docker compose exec worker node apps/worker/dist/probe.js
```

Generate REALTIME_INTERNAL_SECRET from at least 32 random bytes (base64url or hex) in your ignored .env; never commit or expose it to the browser. Runtime configuration fails closed for ticket issuance when absent. Compose passes it only to API/realtime.

The API, realtime, and worker ports are 4300, 4301, and 4302. Host PostgreSQL is 55432 and Redis is 56379. `.env.example` documents port overrides. Published ports bind to loopback. Compose uses the isolated `conversations-slice1` project and named data volumes; it does not touch other projects or existing Convex data.

Compose runs the one-shot `migrate` service after PostgreSQL is healthy and waits for its success before starting the API. Restarting an API process never implicitly migrates the database.

`/health/live` means the process serves HTTP. `/health/ready` checks live PostgreSQL/Redis connectivity as appropriate; the worker also checks its schema, BullMQ backends and provider configuration. Missing development Gemini settings leaves generation unready and admitted work visibly failed; production refuses startup. Worker health/shutdown stay available during schema/Redis startup failures, and generation starts only after the expected schema is available. Dependency failure returns 503 without exposing credentials. Signal-driven shutdown stops intake, cancels/drains model tasks through durable interruption, and closes connections within a deadline.

## Run services on the host

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres redis
pnpm services:build
pnpm services:migrate
pnpm services:dev
```

Use the `.env` values copied above. Stop containerized API/worker/realtime before starting host services on the same ports. The service scripts load the root `.env`; restarting is required after changing configuration. Shared packages are built before development starts; rerun `pnpm services:build` after editing shared/runtime code.

## Verification

```sh
pnpm services:build
pnpm services:typecheck
pnpm services:lint
pnpm services:test
pnpm services:smoke
pnpm services:probe
```

The smoke check needs local PostgreSQL/Redis and compiled service output. It creates and migrates an isolated database, starts temporary service processes on free ports, checks real dependency/schema readiness, unauthenticated `/v1/me` rejection, and queue execution, exercises a signed ticket/socket/checkpoint flow in a separate realtime process, verifies Redis startup outages and worker migration recovery, and confirms clean SIGTERM shutdown. It cleans up its child processes and temporary database. The standalone probe requires a running worker. `services:test` includes actual PostgreSQL ownership/concurrency/upgrade tests and signed local RSA fixtures through the real Clerk verification SDK; it includes deterministic real Redis/BullMQ worker integration and SDK SSE fixtures, without live provider secrets.

## Migrations

`packages/database` contains the Drizzle schema, generated SQL/snapshots/journal, and the explicit `pnpm services:migrate` command. Migration 0000 installs accounts; 0001 adds conversations/messages; 0002 adds operation/request identities, durable event/job handoff, and final-delivery receipts. Migration 0003 adds safe generation failures and unique assistant-operation linkage. The reviewed 0002 SQL creates prerequisite unique indexes before their composite foreign keys. Apply committed migrations before service rollout. Concurrent runners serialize using a database advisory lock on one connection, with a 10-second lock timeout and 30-second statement timeout. Do not edit an applied migration; update the schema and run `pnpm --filter @conversations/database generate --name <change>` to generate the next migration, then review its dependency ordering.

API and worker readiness verify every expected migration hash and the required tables, while tolerating additive ahead migrations during a rolling deployment. Missing or altered history keeps readiness at 503. No command imports or removes old Convex data.

## Authentication and the account boundary

Configure `CLERK_JWT_ISSUER_DOMAIN` (the exact HTTPS Clerk issuer without a trailing slash), `CLERK_SECRET_KEY`, and comma-separated `CLERK_AUTHORIZED_PARTIES`. `CLERK_JWT_KEY` may supply the Clerk PEM public verification key instead of remote JWKS retrieval. Development defaults allowed parties to localhost/127.0.0.1 on ports 3000/4303; production requires an explicit allowlist. Only API containers receive Clerk secrets. Never prefix a server secret with `NEXT_PUBLIC_`.

An entirely unconfigured development instance serves health endpoints but cannot provision an account: `/v1/me` returns 401 without a bearer credential and 503 if authentication is unavailable. Partial authentication settings and missing production settings stop startup. With valid settings, send the frontend's Clerk session token as `Authorization: Bearer ...` to `GET /v1/me`; its response contains only the internal account ID and creation/update timestamps. Repeated/concurrent sessions for the same verified subject resolve the same account. Machine tokens, invalid signatures, wrong issuers/parties, pending sessions, and expired tokens are rejected. JWKS/network outages return a generic 503 rather than exposing SDK diagnostics.

The server-only `ConversationStore` scopes reads/writes/subscription authorization to that internal account. Mutation checks and writes share a conversation row lock; message/event sequences are allocated in the same transaction as persistence and handoff. Implemented conversation and socket authorization routes consume this boundary. Realtime rechecks signed-session expiry and current access through bounded internal API calls; stateless upstream revocation is bounded by JWT lifetime. Do not trust a client-supplied account ID. A live Clerk secret/issuer JWKS association was checked separately; deterministic JWT tests do not prove a real end-user session was issued.

## Existing frontend during transition

The current Next.js dashboard/widget still contains legacy Convex/organization assumptions. Run `pnpm --filter web dev` with the existing app-local configuration to inspect it. An opt-in Compose profile is available with `docker compose --profile frontend up --build -d`; it requires valid Clerk settings in the root environment and does not yet supply the migrated conversation flow. It is excluded from the credential-free foundation checks.

## Stopping and data

`docker compose down` stops this project and preserves its named volumes. Avoid `down --volumes` unless intentionally discarding the new local PostgreSQL/Redis data. Existing Convex data is outside this stack and remains untouched.

## Progress records

Update the GitHub issue with concise change/verification evidence. Update the checkout's ignored `docs/local-change-log.md` after every small change with affected files, code responsibilities, actual user flow, architecture, and verification. Never commit or upload the local journal. Its exclusion is checkout-local; check it with `git check-ignore -v docs/local-change-log.md` before staging.
