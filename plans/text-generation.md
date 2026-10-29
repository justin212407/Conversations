---
status: in-progress
depends: [conversation-api]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [20]
---

# Plan: Durable text generation worker

## Scope

Complete #20 after merged PR #29: consume durable text-generation handoffs through BullMQ, load authoritative completed context, stream provisional snapshots, persist terminal results, recover interrupted execution, and expose useful failure state through the existing API. Keep Gemini behind an application-owned provider interface and deterministic automated tests independent of credentials. Application WebSockets, workspace UI, voice-provider orchestration, observability collectors, and cloud deployment remain downstream.

## Implements

- Architecture: worker owns typed generation, Vapi owns live voice, PostgreSQL owns final history, Redis/BullMQ coordinate execution and provisional updates.
- Lifecycle: completed context is preserved and bounded explicitly; partial output remains provisional; failures/interruption preserve history and release admission through a controlled recovery path.
- Job/events: consume the merged versioned generation command and emit validated application snapshots/results with request/account/conversation/message correlation.

## Approach

1. Reuse the merged command, lease, finalization, and job/event contracts. Relay committed job handoffs into BullMQ with stable operation job IDs and acknowledge only after enqueue succeeds.
2. Before execution, reload and verify the operation, account/conversation ownership, kind, and input identity. Fence duplicates with execution identity and terminal state; never regenerate voice operations or finalized turns.
3. Load all required completed context through the input turn. Enforce explicit bounded context and output; reject over-limit admission with 413 rather than silently dropping history, and revalidate bounds in the worker.
4. Add a Gemini provider adapter with cancellation/timeouts and a deterministic test/development provider explicitly rejected in production. Never hold database transactions/connections across model calls.
5. Define the provisional message-snapshot contract consumed by #21, distinguishing message revisions from durable conversation event sequencing. Final success/failure/interruption commits through the shared transactional finalization seam.
6. Recover expired executions after restart, stop intake before shutdown, cancel/drain bounded in-flight work, and preserve completed history. Keep failure diagnostics credential/transcript safe.
7. Verify actual API→PostgreSQL→handoff→Redis/BullMQ→worker→result/event boundaries with deterministic providers; separately record a small real Gemini smoke when access permits. Review, publish a PR, and merge before dependent streaming implementation.

## Validation

- [ ] Durable handoffs enqueue with stable IDs, survive interrupted publication/ack, and execute through the separate text worker.
- [ ] Authoritative operation/input/ownership/kind checks reject malformed or mismatched commands and prevent duplicate/voice response generation.
- [ ] Context includes prior completed history and the current input once; retry targets its original input; configured bounds fail explicitly without truncation.
- [ ] Actual provider interface streams replaceable provisional snapshots and persists completed results only after the final transaction succeeds.
- [ ] Provider failure/timeout/interruption produce visible safe terminal states, preserve history, and permit controlled retry without another user message.
- [ ] Expired execution/restart and shutdown release or recover admission without stale workers overwriting a newer result.
- [ ] Deterministic provider substitutes exercise real queue/database/event integration and are unavailable in production.
- [ ] Correlation crosses API, handoff, BullMQ, worker and event boundaries without logging credentials or transcript contents.
- [ ] Build/typecheck/lint, prior regressions, meaningful queue/provider integration tests, migration consistency and isolated smoke pass; real provider evidence is distinguished from deterministic coverage.

## Risks / unknowns

- Existing Gemini key presence is not proof of model access/quota. Root verifies live provider access without exposing keys; no paid upgrade is authorized by this plan.
- The five-minute operation lease bounds recovery. Provider execution/shutdown must be bounded within it or renew ownership safely; stale workers cannot finalize a replaced attempt.
- #21 consumes the provisional streaming contract established here, so it starts after this feature merges rather than concurrently changing that seam.
- Railway deployment is deferred to #26; Vapi remains on the current free plan and does not gate typed generation.

## Notes

PR #29 merged as `b70faf7`; its durable command/persistence boundary is on main before this worktree was created. Hosted CI is temporarily replaced by reviewed local checks with explicit user authorization.

## Follow-ups

Tracked by #21–#26 and the durable-conversation plan; no application socket, browser UI, real voice, or deployed lifecycle is claimed here.
