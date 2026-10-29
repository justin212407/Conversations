---
status: in-progress
depends: [text-generation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [21]
---

# Plan: Authenticated realtime delivery and recovery

## Scope

Complete #21 after PR #30 merged. Deliver durable application events and replaceable text snapshots through the separate raw-WebSocket service, with API-owned authorization and authoritative REST reconciliation. Supply a browser-safe recovery/connection seam for #22 without implementing its workspace UI. Railway deployment, Vapi orchestration and collaborative features remain outside this plan.

## Implements

The architecture's read/delivery-only realtime boundary, lifecycle subscription-before-snapshot recovery rule, and API's one-use scoped tickets, heartbeat, ordering, safe resubscription and access revocation contracts.

## Approach

1. Reuse account ownership, subscription authorization, event handoff leases and shared event/snapshot contracts from merged #18–#20. Commit any bounded protocol clarifications before implementing them.
2. Issue verified-user conversation tickets through the API with sixty-second one-use Redis state. Enforce exact allowed Origin and payload limits; keep raw Clerk tokens out of socket URLs and redact ticket-bearing URLs.
3. Keep durable event publication and access decisions at the API boundary. Relay committed events to Redis before acknowledging them; realtime subscribes/fans out without writing conversation state or inferring authorization from client-supplied scope.
4. Implement connection/subscription state, heartbeat, bounded buffers/backpressure, session expiration, cleanup, authorized resubscription and revocation/deletion handling. Avoid holding database connections across network I/O.
5. Establish a consistent authoritative snapshot/checkpoint seam and browser-safe event reducer/transport. Subscribe before reconciliation, deduplicate durable IDs/sequences, detect gaps, reconnect with bounded jittered backoff and fresh tickets, and make terminal durable state dominate late provisional revisions.
6. Test actual signed API→PostgreSQL handoff→Redis→separate socket service boundaries and failure/restart recovery with isolated databases, queue/prefixes and ports. No production auth bypass or provider credentials in deterministic tests.
7. Publish reviewed evidence, close the plan, and merge before dependent workspace #22 starts. Update the central local-only journal after every small change.

## Validation

- [ ] Verified-user ticket issuance is ownership scoped, sixty-second bounded and atomically one-use; unauthorized, expired/replayed, wrong-Origin and arbitrary-conversation subscriptions fail safely.
- [ ] API event relay retains stable IDs, handles publish-before-ack replay and delivers ordered versioned durable events plus replaceable worker snapshots through real Redis/WebSockets.
- [ ] Heartbeat, bounded payload/buffers, unsubscribe, session lifetime, deletion/revocation and disconnect/shutdown cleanup preserve the API authorization boundary.
- [ ] Subscription-before-snapshot recovery has a consistent checkpoint and handles duplicates, gaps, out-of-order and late provisional delivery without losing or duplicating completed history.
- [ ] Browser-safe transport obtains fresh tickets and reconnects with bounded jitter/backoff; service restart/Redis interruption triggers reconciliation rather than false continuity.
- [ ] Meaningful real-service regressions, existing service tests, build/typecheck/lint, formatting, OpenAPI consistency and isolated process/container smoke pass under the user's temporary hosted-CI exception.

## Risks / unknowns

Redis pub/sub cannot promise offline replay. Persisted snapshots/checkpoints are authoritative, and dependency interruption must explicitly force reconciliation. Ticket redemption and later access checks must fail closed through the API ownership boundary. Limits/configuration must support the maximum existing event/output contracts without unbounded buffering.

## Notes

PR #30 merged as13ace0fb5ed17594ae03303e8948f3eda9173008 before this worktree was created. The user authorized ongoing implementation/PR merges and temporarily waived hosted CI; Railway #26 is deferred and Vapi remains free. Existing Convex data and the central private change journal remain outside commits.

## Follow-ups

Workspace integration #22 consumes this stable connection/recovery seam after merge. Voice callbacks #23, cross-service collectors/metrics #24, full regression/CI #25 and deferred deployment #26 remain tracked by the durable-conversation umbrella.
