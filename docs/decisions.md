# Decisions

This document records the design decisions that shape the **Conversations** project.
It includes the product direction, architecture, tools, tradeoffs, and the planned vertical slices.

## Context

The project started as a customer-support chat widget built by following a YouTube tutorial.
The tutorial used a Next.js monorepo, Clerk authentication, Convex as the backend, and the Vapi Web SDK for voice.
The existing code supports a dashboard, an widget, and a small Convex schema for users, contact sessions, and conversations.

We are now intentionally moving away from the tutorial path.
The goal is to build a portfolio-grade engineering project that demonstrates production discipline and systems-learning depth.
The application remains voice-first, but the architecture and implementation will reflect deliberate engineering tradeoffs.

## Product Decisions

### What we are building

A voice-first AI workspace combined with an agent orchestration platform.
The central experience is a durable voice conversation that a developer creates, speaks to, resumes later, and observes end-to-end.
Over time, it expands to include projects, files, tools, and durable agent runs.

### Target user

Individual developer or technical professional.
We deliberately avoid multi-user collaboration, teams, and advanced role-based access in the first slices.
This keeps the domain focused and the engineering demonstrable.

### Product identity choice

We chose a combined identity because the existing application already has a voice interface and a conversation model.
Turning it only into a generic AI workspace would discard that identity.
Turning it only into an agent platform would ignore the conversation experience.
The combined identity lets us grow both pillars from the same durable conversation core.

## Architecture Decisions

### Separate services from the start

We will run four logical services: frontend, API, worker, and realtime.
They will be separated now rather than extracted later, because extracting a monolith is expensive and error-prone.
The separation is deliberately minimal at first; we add only the contracts and infrastructure needed by the current slice.

### WAPI sits behind an application-owned adapter

The Vapi Web SDK will be isolated behind a provider adapter.
The core conversation domain will not depend on Vapi types or events.
This lets us change or add voice providers later without rewriting the domain.

### Realtime service owns delivery only

The realtime service manages raw WebSocket connections, subscriptions, presence, and event fan-out.
Business decisions and conversation state live in the API.
This keeps business logic testable and prevents WebSocket lifecycle concerns from leaking into the domain.

### PostgreSQL as the system of record

PostgreSQL will replace Convex as the durable system of record.
Convex is convenient for fast prototyping, but PostgreSQL gives us stronger relational modeling, transactions, migrations, auditability, and a more transferable engineering story.
Redis remains for ephemeral state, caching, and coordination.

### API contracts

External communication uses REST + OpenAPI.
Internal service communication uses typed, versioned events.
REST/OpenAPI is more interviewable, language-independent, and easier to document and test than tRPC, GraphQL, or gRPC for our current scope.
tRPC would couple the frontend and backend too tightly.
GraphQL adds query-cost complexity before we need flexible client queries.
gRPC would require a gateway for browser clients and harder-to-debug binary payloads.

### Raw WebSockets for realtime

We chose raw WebSockets over Socket.IO to demonstrate ownership of reconnection, heartbeat, presence, room management, and message ordering.
This is a deliberate systems-learning decision.
It adds implementation burden, but it also produces a stronger portfolio signal.

### Deployment target

Local Docker Compose plus one production environment on a simple cloud target such as Fly or Railway.
We avoid Kubernetes at the start to keep operations focused on the product rather than on cluster management.

## Technology Decisions

### TypeScript/Node.js for backend services

This matches the existing stack, supports fast iteration, and has a strong ecosystem for queues and WebSockets.
It also lets us share types across the monorepo.

### Next.js frontend redesigned in place

We keep the current Next.js/React frontend and refactor it into the new architecture.
A rewrite would discard working UI and voice integration.

### BullMQ on Redis for worker jobs

BullMQ is proven, Redis-native, has excellent TypeScript support, and fits naturally with our Redis plans.
It handles retries, dead-letter queues, and backpressure without us building them from scratch in production.

### Drizzle ORM for PostgreSQL

Drizzle is lightweight, type-safe, and modern.
It produces clean SQL and is easy to explain in a portfolio context.

### Clerk for authentication with an internal account boundary

Authentication is delegated to Clerk, but the API owns account ownership and authorization.
This gives us production-grade auth without building registration, sessions, or password handling ourselves.

## Quality and Process Decisions

### Observability from day one

Every request and job will produce structured logs, traces, and metrics.
This is evidence of production discipline and helps us debug the separated services.

### Testing strategy

Unit, integration, and end-to-end tests are required from the first slice.
Unit tests cover domain logic.
Integration tests cover database, queue, and API boundaries.
End-to-end tests cover the voice conversation flow using text fallback.

### Security posture

We enforce standard production basics from the first slice: HTTPS, CORS, input validation, parameterized queries, authn/authz, secret management, and dependency scanning.
We avoid premature advanced hardening.

### CI pipeline

Every pull request must pass lint, typecheck, unit tests, integration tests, and build.
This is the minimum evidence of engineering maturity.

### API versioning

The public API is versioned in the URL from day one, for example `/v1/...`.
This avoids pain when we introduce breaking changes.

## Vertical Slices

### Slice 1 implementation resolutions — 2026-10-28

- The primary product surface is the personal developer workspace in `apps/web`. Reuse shared/widget UI where useful; retain the legacy widget and Convex source during the transition.
- Slice 1 models accounts, conversations, messages, and their operational state. Projects arrive in Slice 4; agent runs arrive in Slice 5.
- The user chose fresh PostgreSQL data. Existing Convex data remains untouched; no import or old-data deletion is part of this slice.
- Fastify is the Node.js HTTP framework. Railway is the initial deployment target; actual provisioning and deployment evidence remain issue #26.
- Vapi generates live voice responses. The worker generates typed responses. Authenticated provider callbacks are the durable voice source; browser captions are provisional. A voice turn never triggers a duplicate worker response.
- Resume means continuing the same conversation using persisted completed context, including when starting a new provider call. Interruptions, duplicate delivery, ordering, and recovery are specified explicitly.
- Use structured Pino logs, OpenTelemetry traces, and Prometheus metrics; implementation and collector configuration arrive with issue #24.
- The detailed desired behavior is in [architecture](../specs/architecture.md), [conversation lifecycle](../specs/behaviors/conversation-lifecycle.md), and [API contracts](../specs/api/conversations.md). These specs describe the target; the issue tracker records what has been implemented and verified.

### Slice 1: Durable Voice Conversation

Build the complete lifecycle of a voice conversation.
A developer signs in, creates a conversation, speaks through WAPI, sees streaming responses, reloads the history, and resumes later.
The slice includes persistence, the API boundary, the realtime service, worker jobs for any background processing, and end-to-end observability.
Text fallback is included for debugging, accessibility, and deterministic testing.

### Slice 2: Cache and Rate Limiter

Add Redis-backed response caching and distributed rate limiting.
Run an educational experiment that implements a simple cache with hashes, TTL, and an eviction policy, and benchmark it against Redis.
The educational implementation stays separate from the production path.

### Slice 3: Durable Job Queue

Deepen the worker layer with retries, idempotency, visibility timeouts, and dead-letter handling.
Optionally run an educational experiment that builds a small queue and compares it with BullMQ.

### Slice 4: Project Context and Files

Introduce the account → project → conversation hierarchy.
Allow a developer to attach files or notes to a project and converse with that context.

### Slice 5: Agent Orchestration

Introduce agent runs under a conversation.
Support tools, multi-step execution, approvals, retries, and execution traces.

## Decision Log

| Decision | Choice | Rejected Alternatives | Rationale |
| --- | --- | --- | --- |
| Product identity | Voice-first AI workspace + agent platform | Generic workspace only, agent platform only | Preserves existing voice identity and enables both pillars |
| Target user | Individual developer | Teams, support teams, general consumer | Keeps the domain narrow and portfolio-focused |
| Architecture timing | Separate services now, minimal complexity | Full distributed architecture now, product first then extract | Avoids the cost of later extraction while keeping services explicit |
| WAPI integration | Provider adapter | Direct dependency on Vapi types | Prevents lock-in and keeps domain clean |
| Realtime responsibility | Connection and delivery only | Orchestration or full domain service | Keeps business logic testable and separated |
| System of record | PostgreSQL | Convex, hybrid, document database | Stronger relational model, migrations, auditability |
| External API | REST + OpenAPI | tRPC, GraphQL, gRPC | Interviewable, language-independent, clear contracts |
| Realtime transport | Raw WebSockets | Socket.IO, SSE, managed services | Demonstrates ownership of connection mechanics |
| Backend runtime | TypeScript/Node.js | Python, Go, mixed | Matches existing stack and ecosystem |
| Frontend strategy | Redesign in place | Rewrite, extract later | Preserves working UI and voice integration |
| Job queue | BullMQ on Redis | RabbitMQ, PostgreSQL queue, custom | Proven, Redis-native, excellent TypeScript support |
| Database access | Drizzle ORM | Prisma, raw SQL, other ORMs | Lightweight, type-safe, modern |
| Auth | Clerk + internal account boundary | Build auth ourselves, single user, full RBAC | Production-grade auth without operational burden |
| Deployment | Docker Compose + one cloud target | Kubernetes, serverless, local-only | Real deployment without Kubernetes becoming the project |
| API versioning | URL versioning from day one | No versioning, header versioning, schema evolution | Simple and clear |
