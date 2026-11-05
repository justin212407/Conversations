---
status: in-progress
depends: [workspace, observability, service-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
  - specs/screens/workspace.md
  - specs/behaviors/voice.md
issues: [23]
---

# Plan: Durable contextual voice conversations

## Scope

Complete #23 on the merged personal workspace using the existing free Vapi account. Introduce application-owned frontend/server adapters, authenticated durable provider ingestion, stable turn identities and completed-context resume. Preserve the text lifecycle, normal Clerk ownership and old Convex/widget data. Railway deployment remains #26; representative live voice verification may use an isolated local stack and a temporary restricted HTTPS callback endpoint.

## Implements

The accepted architecture/lifecycle/API rules for Vapi-generated voice, server-authoritative final transcripts, browser-provisional captions, one active interaction, contextual resume and explicit interruption/recovery. Audit current provider behavior and define a bounded voice specification before implementing.

## Approach

1. Audit the merged storage/commands/realtime/workspace and existing widget SDK. Verify current official Vapi API/SDK/webhook contracts, free-account behavior and callback authentication. Draft the concrete voice behavior/API changes and refine this plan; root accepts the specification before implementation.
2. After root accepts the specification, run an isolated short free-account contract probe before broad implementation. Preserve older saved assistants; create/configure only dedicated assistant/bearer resources and a restricted temporary callback endpoint. Prove private-server Daily-call creation, SDK join, actual callback authentication, complete seed/private boundary representation, raw spoken-history versus formatted context, greetings/repeated utterances, interruption/mutable-tail behavior and final artifacts. If account availability or provider representation fails, report the actual safe result and obtain root review before relying on a different mapping.
3. Add deep provider boundaries for server-created/configured call lifecycle and browser connection/state/cleanup. Keep provider types out of the core and private credentials out of the browser. Reuse existing verified ownership, idempotency, lifecycle, history and diagnostic building blocks. Keep private-key creation and registered-call ingestion server-only; the browser adapter joins only the returned short-lived capability. Audit SDK2.5.2 cleanup/error logging and apply a scoped reviewed correction or safer implementation rather than global console interception.
4. Persist call/session ownership, stable finalized turn identity and recovery state through reviewed migrations/transactions. Reuse the existing voice-capable operation fence with no fabricated text messages. Commit stable session/ordinal receipts, new finalized turns and existing outbox events atomically; retain one mutable tail until a successor/final authoritative cutoff, and fence terminal callbacks. Authenticate callbacks, bind them to authorized registered calls, validate bounded payloads, and handle repeated identical utterances, seeded context, duplicate/late/out-of-order events without duplicating completed messages or worker generation.
5. Start/resume voice from complete persisted context; integrate explicit start/stop/connection/speaking/microphone/failure states with the personal workspace and shared authoritative history. Coordinate text/voice admission and terminate media/listeners/resources when leaving or stopping.
6. Verify domain/adapter/contract/ownership/fencing/privacy/recovery behavior with deterministic provider substitutes and isolated storage. Reuse the service regression foundation and meaningful frontend tests. Serialize heavy builds and Docker checks on the shared host.
7. Configure only necessary dedicated free-account Vapi resources/secrets, preserving existing assistants and owner data. Prove an actual browser/provider call and authenticated durable callbacks in a representative environment. No paid upgrades, purchases, auto-reload, telephone provisioning or Railway authorization. An account balance label alone is not a failed-call result; use a controlled real attempt before classifying availability.
8. Record each small change in the central ignored journal. Run scoped gates/self-review, freeze source, push and raise a PR. Root reviews/fixes/merges before dependent work. Check only verified acceptance and keep real-provider or deployment gaps explicit.

## Validation

- [ ] A reviewed real-provider contract probe establishes actual seed/live mapping, authenticated saved-resource callbacks, spoken-history/cutoff and server-created joining; no unproven identity/prefix guarantee is relied on.
- [ ] Reviewed provider-independent contracts and adapters support start/stop/resume, safe configuration and bounded lifecycle cleanup.
- [ ] Actual Clerk/account ownership and authenticated registered-call ingestion prevent cross-account or forged transcript writes.
- [ ] Final user/assistant turns persist once with stable identities, including repeated utterances, duplicate/out-of-order/late events and seeded context.
- [ ] Completed context resumes across reload/new provider calls; voice never triggers a duplicate text-worker answer.
- [ ] UI exposes connection/speaking/failure/microphone-denial/interruption states and coordinates text/voice without leaks or hidden resubmission.
- [ ] Focused service/frontend/adapter/contract tests and scoped build/type/lint/install gates pass; diagnostics remain private and bounded.
- [ ] Real free-account provider/browser call and durable authenticated callback evidence pass in a representative environment; required resources and captures remain isolated/local.

## Risks / unknowns

Vapi callback identity/order/committed-history semantics, server-created web-call compatibility and free-account availability must be verified from current primary sources and a controlled live attempt. The private system boundary and successor-sealed prefix are proposed capability assumptions, not documented guarantees; prove the exact raw/formatted representation early. Explicitly configure spoken-history mode (`modelOutputInMessagesEnabled:false`), a 30-second join timeout, 300-second call bound, eight-minute application deadline and 120-second provider-confirmed ending grace. No missing authorization permits a production bypass or owner impersonation. The host has limited memory; never stop unrelated services. Dependency audit findings remain #25 and production deployment stays #26.

## Notes

PR32 merged as 2b98a2636cba3645344f10b32d08cd7b091c30f2 before this worktree was created. Real personal Clerk and Google text/streaming/context/reload/reopen acceptance passed; main includes the reviewed service/observability/regression foundation. The user explicitly authorizes issue/feature PR progression and necessary browser credential setup, performs login/MFA when required, waives unavailable hosted CI, preserves existing Convex data and requires the existing free Vapi account.

### Initial real-provider availability probe

Root accepted the bounded design at `7f71299` and reviewed/corrected a private probe before execution. A callback-only temporary HTTPS listener was separate from the loopback SDK/config listener; wrong methods/routes and missing authentication were rejected before any provider write. Fresh quick-tunnel readiness required a longer window; the first failed preflight had zero provider attempts/mutations and verified cleanup before the authorized zero-provider repair.

The actual provider phase created one dedicated bearer credential and one dedicated saved assistant (both201), preserving earlier resources. The saved assistant held only base instructions and fixed callback/credential configuration; the single private Daily-call request supplied full synthetic seed and private boundary through model-only per-call assistant overrides, with no server override. **Vapi rejected that one call creation with HTTP400 because account credits were unavailable.** No call ID, SDK media join or transcript callback resulted, and no additional create attempt, paid upgrade, purchase, auto-reload or billing edit occurred.

The initial call-attempt claim and dedicated resource IDs remain private; the assistant's ephemeral callback was retired to a reserved `.invalid` destination before tunnel shutdown. The rejected call required no remote termination; both owned processes and all three local listeners were subsequently verified stopped. The new dedicated resources can be deliberately reconfigured later; no existing assistant or organization setting changed.

This is actual provider unavailability evidence, not a balance-UI inference or a successful voice contract proof. Private server-created join compatibility, any separate browser token requirement, authenticated callback attachment under model overrides, raw/formatted seed-boundary representation, role/ordinal mapping, cumulative prefix behavior and spoken-tail/interruption/final-report semantics all remain **unproven**. The capability validation box stays unchecked. Broad product implementation remains gated on root's decision and exact mapping review; deterministic fixtures must not claim the missing real-provider facts. No public product behavior was implemented in this phase.

## Follow-ups

#24 completes cross-service/frontend/voice diagnostics and security; #25 owns whole-workspace advisory remediation and final browser/voice regression integration; #26 retains deployment/cutover and production evidence.
