---
status: done
depends: [text-generation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [21]
pr: 31
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

- [x] Verified-user ticket issuance is ownership scoped, sixty-second bounded and atomically one-use; unauthorized, expired/replayed, wrong-Origin and arbitrary-conversation subscriptions fail safely.
- [x] API event relay retains stable IDs, handles publish-before-ack replay and delivers ordered versioned durable events plus replaceable worker snapshots through real Redis/WebSockets.
- [x] Heartbeat, bounded payload/buffers, unsubscribe, session lifetime, deletion/revocation and disconnect/shutdown cleanup preserve the API authorization boundary.
- [x] Subscription-before-snapshot recovery has a consistent checkpoint and handles duplicates, gaps, out-of-order and late provisional delivery without losing or duplicating completed history.
- [x] Browser-safe transport obtains fresh tickets and reconnects with bounded jitter/backoff; service restart/Redis interruption triggers reconciliation rather than false continuity.
- [x] Meaningful real-service regressions, existing service tests, build/typecheck/lint, formatting, OpenAPI consistency and isolated process/container smoke pass under the user's temporary hosted-CI exception.

## Risks / unknowns

Redis pub/sub cannot promise offline replay. Persisted snapshots/checkpoints are authoritative, and dependency interruption must explicitly force reconciliation. Ticket redemption and later access checks must fail closed through the API ownership boundary. Limits/configuration must support the maximum existing event/output contracts without unbounded buffering.

## Notes

PR #30 merged as 13ace0fb5ed17594ae03303e8948f3eda9173008 before this worktree was created. The user authorized ongoing implementation/PR merges and temporarily waived hosted CI; Railway #26 is deferred and Vapi remains free. Existing Convex data and the central private change journal remain outside commits.

Implementation is [PR #31](https://github.com/justin212407/Conversations/pull/31), source `ab47905`, preceded by protocol clarification `965d600`. Fifty-eight local tests pass: thirteen PostgreSQL, ten authenticated API, eleven worker, nine runtime and fifteen realtime/recovery suites. Real Redis/WebSocket coverage includes signed sessions, concurrent one-use tickets, exact Origin/scope/privacy, publication-before-ack replay, maximum finalized frames and paused-consumer backpressure, heartbeat/expiry/access loss, subscription generations, API failure, actual socket/subscriber restart, atomic concurrent snapshots, gaps/out-of-order/late partials, retry metadata, bounded browser deadlines and stop-related rejection handling. Build/typecheck/lint pass with zero warnings; frozen install, generated consistency, formatting/diff checks and separate-process signed ticket/socket/checkpoint smoke pass. All 108 OpenAPI request/response examples validate. The lock adds only 32 lines and preserves existing resolutions; no migration is needed for the snapshot query.

Root's isolated container proof passed on the frozen source: actual Docker API/worker/realtime with fresh PostgreSQL/Redis, synthetic signed Clerk session/service secret and the existing project Gemini key supplied only to the worker at runtime. The browser connection module obtained a ticket, subscribed/reconciled, observed rename and real Gemini completion matching persisted snapshot/operation metadata. Exact replay retained exactly one operation/job/assistant completion. Restarting the actual realtime container recovered a fresh connection/snapshot with the same answer once and updated title. No key/token/response text was printed. Cleanup of that test-owned stack remains with root after review.

Independent review is still in progress. The standards review identified two corrections before merge: scheduling more than eight established socket polls must queue bounded checks rather than close healthy excess connections, and stopping during an in-flight snapshot must reset reconciliation before restarting the same browser transport. Root owns those fixes/regressions and final rechecks; this closeout does not claim review clearance. Workspace #22 waits for the actual merge.

`docs/realtime.md` records the server/client interfaces, safety limits and configuration. Clerk checks are stateless signed-JWT verification plus current ownership; immediate upstream session revocation is not claimed before JWT expiry. API/realtime share only a server-side internal secret. Realtime has no database mutation path and Redis interruption always forces reconciliation. No actual workspace rendering, real-user Clerk session issuance, voice callback or Railway deployment is claimed by this feature.

## Follow-ups

Workspace integration #22 consumes this stable connection/recovery seam after merge. Voice callbacks #23, cross-service collectors/metrics #24, full regression/CI #25 and deferred deployment #26 remain tracked by the durable-conversation umbrella.
