# Local development

The service foundation is the first implemented milestone of [Slice 1](slice-1.md). It supplies independently runnable API, worker, and realtime processes, health checks, and a real queue probe. Conversation persistence/authentication, application WebSockets, generation, and the new UI are subsequent issues; a green health check does not claim those features exist.

## Prerequisites

- Node.js 22 and pnpm 10.4.1 (the version in `packageManager`).
- Docker with Compose v2 for PostgreSQL/Redis and optional service containers.
- No Clerk, voice, or model credentials are required for foundation verification.

## Run the containerized foundation

```sh
cp .env.example .env
docker compose up --build -d
docker compose ps
curl --fail http://localhost:4300/health/ready
curl --fail http://localhost:4301/health/ready
curl --fail http://localhost:4302/health/ready
docker compose exec worker node apps/worker/dist/probe.js
```

The API, realtime, and worker ports are 4300, 4301, and 4302. Host PostgreSQL is 55432 and Redis is 56379. `.env.example` documents port overrides. Published ports bind to loopback. Compose uses the isolated `conversations-slice1` project and named data volumes; it does not touch other projects or existing Convex data.

`/health/live` means the process serves HTTP. `/health/ready` checks live PostgreSQL/Redis connectivity as appropriate; the worker also checks its actual BullMQ backend. Dependency failure returns 503 without exposing credentials. Signal-driven shutdown drains work and closes connections within a deadline.

## Run services on the host

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres redis
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

The smoke check needs local PostgreSQL/Redis and compiled service output. It starts temporary service processes on free ports, checks real dependency readiness and queue execution, verifies a dependency outage, and confirms clean SIGTERM shutdown. It cleans up only its own child processes. The standalone probe requires a running worker.

## Migrations

The foundation has no domain tables or migrations yet. Issue #18 adds the Drizzle schema and the explicit one-shot migration command; #19 cannot enable conversation routes before that migration succeeds. Database migrations will run once before service rollout rather than concurrently on every startup. No command imports or removes old Convex data.

## Existing frontend during transition

The current Next.js dashboard/widget still contains legacy Convex/organization assumptions. Run `pnpm --filter web dev` with the existing app-local configuration to inspect it. An opt-in Compose profile is available with `docker compose --profile frontend up --build -d`; it requires valid Clerk settings in the root environment and does not yet supply the migrated conversation flow. It is excluded from the credential-free foundation checks.

## Stopping and data

`docker compose down` stops this project and preserves its named volumes. Avoid `down --volumes` unless intentionally discarding the new local PostgreSQL/Redis data. Existing Convex data is outside this stack and remains untouched.

## Progress records

Update the GitHub issue with concise change/verification evidence. Update the checkout's ignored `docs/local-change-log.md` after every small change with affected files, code responsibilities, actual user flow, architecture, and verification. Never commit or upload the local journal. Its exclusion is checkout-local; check it with `git check-ignore -v docs/local-change-log.md` before staging.
