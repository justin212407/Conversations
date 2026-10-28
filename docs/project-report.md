# Project Report: Conversations

## Executive Summary

Conversations is a voice-first AI workspace and agent orchestration platform.
It begins with a durable voice conversation that a developer can create, stream, persist, resume, and observe.
The project is intentionally evolving from a tutorial-based customer-support widget into a portfolio-grade engineering system.
The new architecture separates the frontend, API, worker, and realtime services, uses PostgreSQL as the system of record, Redis for ephemeral state, and BullMQ for background work.
Every vertical slice will include the feature, tests, observability, a design note, and deployment evidence.

## What We Are Building

The product combines two pillars.
The first pillar is an AI workspace: a developer creates projects, attaches context, and has persistent text or voice conversations.
The second pillar is an agent orchestration platform: agents run tools, retry failures, await approvals, and leave auditable execution traces.
The first slice focuses entirely on the first pillar, a durable voice conversation, because every later feature depends on it.

The first user is an individual developer or technical professional.
We deliberately avoid team collaboration, complex roles, and multi-tenant features in the early slices.
This keeps the domain focused and lets us demonstrate engineering depth without scope explosion.

## Old Architecture

The current codebase is a Next.js monorepo created from a shadcn/ui monorepo template.
It contains the following structure.

- `apps/web`: the Next.js dashboard application.
- `apps/widget`: the embedded widget application.
- `packages/backend`: a Convex backend package with the conversation schema and actions.
- `packages/ui`: shared shadcn/ui components, including AI chat primitives.
- `packages/math`: a small shared math library.

Authentication is handled by Clerk.
The dashboard uses the Clerk React provider and the widget relies on contact sessions stored in Convex.

The backend is written as Convex functions.
The schema in `packages/backend/convex/schema.ts` defines `users`, `contactSessions`, and `conversations`.
Conversations are linked to a `threadId` provided by the `@convex-dev/agent` package.

The AI agent in `packages/backend/convex/system/ai/agents/supportAgent.ts` is a thin wrapper around Google's Gemini model.
It uses the agent component to create threads, save messages, and generate responses.

The widget in `apps/widget/modules/widget/ui/screens/widget-chat-screen.tsx` renders an chat interface using the shared AI components.
It fetches messages through `useThreadMessages`, handles infinite scroll, and submits new messages through a Convex action.

The voice integration is in `apps/widget/modules/widget/hooks/use-vapi.ts`.
It uses the Vapi Web SDK directly, manages call state, and accumulates transcript messages.

The dashboard sidebar already shows routes for Conversations, Knowledge Base, Widget Customization, Integrations, and Voice Assistant, but most of these pages are placeholders.

### Strengths of the old architecture

- The monorepo is already set up with pnpm workspaces, Turbo, TypeScript, and shared UI components.
- Clerk authentication is already wired into the dashboard.
- The widget has a working chat UI with infinite scroll and a message list.
- The Vapi hook provides a starting point for voice integration.
- Convex gives fast iteration and real-time sync for prototype work.

### Weaknesses of the old architecture

- The backend is tightly coupled to Convex and its generated APIs.
- There is no separation between the API, worker, and realtime concerns.
- The Vapi SDK is used directly, creating provider lock-in.
- The domain model is oriented around support tickets, not a developer workspace.
- There is no observability, worker queue, or durable job infrastructure.
- Testing appears to be manual or absent.

## New Architecture

The new architecture splits the system into four logical services.

1. **Frontend**: a Next.js application that evolves from the existing dashboard and widget.
2. **API**: an HTTP service that owns the domain, business rules, and REST/OpenAPI contracts.
3. **Worker**: a Node.js service that consumes jobs from BullMQ and runs background tasks.
4. **Realtime**: a Node.js service that manages raw WebSocket connections, subscriptions, and event fan-out.

These services communicate through explicit contracts.
The frontend talks to the API over REST.
The API publishes typed events for the worker and realtime services.
The worker and API share PostgreSQL as the system of record.
Redis provides caching, session coordination, and the BullMQ job queue.

### Service boundaries

The API owns the domain model and business decisions.
The worker owns background execution and retry logic.
The realtime service owns connection state and delivery.
This separation makes each service independently testable and lets us reason about failure modes clearly.

### External integrations

**Vapi/WAPI**: isolated behind an adapter in the API and frontend.
The adapter translates Vapi events into application events and vice versa.
If we later switch to another voice provider, only the adapter changes.

**Clerk**: still the authentication provider.
The API validates Clerk JWTs and maps them to internal accounts.

**Google Gemini**: used through the AI SDK in the worker or API, depending on the slice.
It remains an implementation detail behind an agent interface.

## Data Model

Slice 1 introduces accounts, conversations, messages, and the operational state needed for durable voice/text processing. Projects arrive in Slice 4 and agent runs in Slice 5. This resolves the earlier contradiction between this section and the slice roadmap.

- **Account**: maps a Clerk identity to an internal account record.
- **Project (Slice 4)**: groups conversations and context for an account.
- **Conversation**: a durable thread with metadata, status, and provider thread references.
- **Message**: a single turn in a conversation, with support for text and voice transcripts.
- **Agent Run**: a separate slice later, representing an asynchronous task or tool execution tied to a conversation.

The target model uses PostgreSQL with Drizzle ORM. Fresh PostgreSQL data is explicitly authorized; existing Convex data remains untouched.
Migrations are versioned and applied through a repeatable process.

## Architecture Flow

A developer opens the application and signs in through Clerk.
The frontend receives a token and makes requests to the API.
The API validates the token, resolves the internal account, and serves or mutates resources.

When the developer starts a conversation, the frontend requests a conversation record from the API.
The API creates or loads the conversation from PostgreSQL and returns it.

When the developer speaks, the frontend sends audio to the WAPI adapter.
The adapter forwards the audio to Vapi and receives streaming events.
As transcript events arrive, the adapter emits typed application events.
These events update the conversation state in PostgreSQL and are pushed to subscribed clients through the realtime service.

For typed prompts, the API accepts a durable command and the worker generates the response, streams progress, and persists the final message. Vapi owns live voice generation; authenticated provider callbacks are ingested through the API adapter and do not trigger another generated response. Browser transcripts are provisional previews.
All operations are traced and logged.

## What Each File Is For

### Existing files we keep

- `apps/web/app/layout.tsx`: the root Next.js layout with Clerk, theme, and tooltip providers.
- `apps/web/app/(dashboard)/layout.tsx`: the dashboard shell that wraps dashboard pages.
- `apps/web/modules/dashboard/ui/components/dashboard-sidebar.tsx`: the sidebar navigation that will be updated to reflect the new product routes.
- `apps/widget/modules/widget/ui/screens/widget-chat-screen.tsx`: the widget chat screen that will be refactored to use the new API and realtime service.
- `apps/widget/modules/widget/hooks/use-vapi.ts`: the Vapi hook that will be moved behind the WAPI adapter.
- `packages/ui/src/components/ai/*.tsx`: shared AI chat primitives that remain the visual building blocks.

### Existing files we retire

- `packages/backend/convex/schema.ts`: replaced by Drizzle schema files in the API.
- `packages/backend/convex/public/*.ts`: replaced by REST API route handlers.
- `packages/backend/convex/system/*.ts`: replaced by domain services in the API and worker.
- `packages/backend/convex/auth.config.ts`: replaced by Clerk token validation in the API.

### New files we add

- `apps/api/`: the new API service with routes, domain services, and database schema.
- `apps/worker/`: the new worker service with job handlers and queue definitions.
- `apps/realtime/`: the new realtime service with raw WebSocket connection management.
- `packages/shared/`: shared types, event contracts, and utilities used across services.
- `docs/decisions.md`: the living decision log.
- `docs/project-report.md`: this report.
- `docker-compose.yml`: local orchestration of services, PostgreSQL, Redis, and observability.
- `infra/`: deployment manifests and configuration for the production environment.

## How We Will Build It

### Slice 1: Durable Voice Conversation

The first slice establishes the entire lifecycle.

1. Set up the API, worker, and realtime services as separate packages.
2. Define the Drizzle schema for accounts, conversations, messages, and the operational state required for durability.
3. Implement Clerk token validation and the internal account boundary.
4. Create REST endpoints for conversation CRUD.
5. Build the WAPI adapter that wraps the Vapi Web SDK.
6. Implement raw WebSocket connection handling in the realtime service.
7. Wire the frontend to use the new API and realtime service instead of Convex.
8. Add text fallback for deterministic testing and accessibility.
9. Add structured logging, tracing, and metrics.
10. Write unit, integration, and end-to-end tests.
11. Add Docker Compose orchestration and CI checks.
12. Deploy to the chosen cloud target.

### Slice 2: Cache and Rate Limiter

1. Add Redis-backed response caching and rate limiting in the API.
2. Implement an educational cache in a benchmark directory.
3. Compare the custom cache against Redis and document findings.

### Slice 3: Durable Job Queue

1. Deepen BullMQ usage with retries, idempotency keys, visibility timeouts, and dead-letter queues.
2. Optionally implement an educational queue and benchmark it against BullMQ.

### Slice 4: Project Context and Files

1. Introduce the project entity.
2. Allow file and note attachments.
3. Use project context in conversations.

### Slice 5: Agent Orchestration

1. Define the agent run entity.
2. Support tools, multi-step execution, approvals, and retries.
3. Expose execution traces.

## Tradeoffs

### PostgreSQL vs Convex

PostgreSQL was chosen because it supports stronger relational modeling, transactions, migrations, and auditability.
Convex is easier for rapid prototyping, but it couples the project to a proprietary backend-as-a-service and makes standard interview discussions harder.
The cost is more setup and operational responsibility.

### Separate services now vs later

Separating services now forces us to define contracts early and avoids a painful extraction later.
The cost is more initial plumbing and more services to run locally.
The alternative of building everything in one app would be faster at first but would create hidden coupling.

### Raw WebSockets vs Socket.IO

Raw WebSockets give us full control and demonstrate systems knowledge.
Socket.IO would provide fallbacks, room management, and reconnection logic for free.
The cost is that we must implement and test these ourselves, which increases the chance of bugs.

### REST/OpenAPI vs tRPC

REST/OpenAPI produces a public, language-independent contract and is easier to explain in a portfolio context.
tRPC would provide end-to-end type safety and faster iteration inside a TypeScript monorepo.
The cost of REST is more boilerplate and explicit versioning.

### BullMQ vs custom queue

BullMQ is proven and Redis-native.
A custom queue would be a stronger learning exercise but would also become production critical.
We keep BullMQ in production and run a custom queue as a separate experiment.

### Docker Compose vs Kubernetes

Docker Compose is simpler to operate locally and for a single production environment.
Kubernetes offers more scalability and operational patterns but becomes a project of its own.
We choose Docker Compose until the operational needs justify Kubernetes.

## Success Criteria for the First Slice

- A developer can sign in through Clerk.
- A developer can create and list conversations.
- A developer can start a voice call through the WAPI adapter.
- Transcript events are persisted and streamed to the client.
- The conversation can be reloaded and resumed.
- Text fallback works for testing and accessibility.
- Every request is logged, traced, and measured.
- Unit, integration, and end-to-end tests pass.
- The stack runs locally with Docker Compose.
- The slice is deployed to the production environment.

## Risks

- Raw WebSocket ownership may delay the first slice if reconnection or ordering bugs appear.
- Moving away from Convex means rebuilding real-time sync and generated client conveniences.
- The WAPI adapter must handle Vapi edge cases without letting them leak into the domain.
- Separating services early adds local development complexity that must be managed with Docker Compose and clear documentation.

## Conclusion

The new architecture turns Conversations from a tutorial project into a deliberate engineering demonstration.
It preserves the working voice and chat UI, replaces the backend with a service-oriented design, and introduces production-grade infrastructure one vertical slice at a time.
Each slice is small enough to finish and large enough to prove engineering maturity.
