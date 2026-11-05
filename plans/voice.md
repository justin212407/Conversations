---
status: in-progress
depends: [workspace, observability, service-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
  - specs/screens/workspace.md
issues: [23]
---

# Plan: Durable contextual voice conversations

## Scope

Complete #23 on the merged personal workspace using the existing free Vapi account. Introduce application-owned frontend/server adapters, authenticated durable provider ingestion, stable turn identities and completed-context resume. Preserve the text lifecycle, normal Clerk ownership and old Convex/widget data. Railway deployment remains #26; representative live voice verification may use an isolated local stack and a temporary restricted HTTPS callback endpoint.

## Implements

The accepted architecture/lifecycle/API rules for Vapi-generated voice, server-authoritative final transcripts, browser-provisional captions, one active interaction, contextual resume and explicit interruption/recovery. Audit current provider behavior and define a bounded voice specification before implementing.

## Approach

1. Audit the merged storage/commands/realtime/workspace and existing widget SDK. Verify current official Vapi API/SDK/webhook contracts, free-account behavior and callback authentication. Draft the concrete voice behavior/API changes and refine this plan; root accepts the specification before implementation.
2. Add deep provider boundaries for server-created/configured call lifecycle and browser connection/state/cleanup. Keep provider types out of the core and private credentials out of the browser. Reuse existing verified ownership, idempotency, lifecycle, history and diagnostic building blocks.
3. Persist call/session ownership, stable finalized turn identity and recovery state through reviewed migrations/transactions. Authenticate callbacks, bind them to authorized registered calls, validate bounded payloads, and handle repeated identical utterances, seeded context, duplicate/late/out-of-order events without duplicating completed messages or worker generation.
4. Start/resume voice from complete persisted context; integrate explicit start/stop/connection/speaking/microphone/failure states with the personal workspace and shared authoritative history. Coordinate text/voice admission and terminate media/listeners/resources when leaving or stopping.
5. Verify domain/adapter/contract/ownership/fencing/privacy/recovery behavior with deterministic provider substitutes and isolated storage. Reuse the service regression foundation and meaningful frontend tests. Serialize heavy builds and Docker checks on the shared host.
6. Configure only necessary dedicated free-account Vapi resources/secrets, preserving existing assistants and owner data. Prove an actual browser/provider call and authenticated durable callbacks in a representative environment. No paid upgrades, purchases, auto-reload, telephone provisioning or Railway authorization. An account balance label alone is not a failed-call result; use a controlled real attempt before classifying availability.
7. Record each small change in the central ignored journal. Run scoped gates/self-review, freeze source, push and raise a PR. Root reviews/fixes/merges before dependent work. Check only verified acceptance and keep real-provider or deployment gaps explicit.

## Validation

- [ ] Reviewed provider-independent contracts and adapters support start/stop/resume, safe configuration and bounded lifecycle cleanup.
- [ ] Actual Clerk/account ownership and authenticated registered-call ingestion prevent cross-account or forged transcript writes.
- [ ] Final user/assistant turns persist once with stable identities, including repeated utterances, duplicate/out-of-order/late events and seeded context.
- [ ] Completed context resumes across reload/new provider calls; voice never triggers a duplicate text-worker answer.
- [ ] UI exposes connection/speaking/failure/microphone-denial/interruption states and coordinates text/voice without leaks or hidden resubmission.
- [ ] Focused service/frontend/adapter/contract tests and scoped build/type/lint/install gates pass; diagnostics remain private and bounded.
- [ ] Real free-account provider/browser call and durable authenticated callback evidence pass in a representative environment; required resources and captures remain isolated/local.

## Risks / unknowns

Vapi callback identity/order/committed-history semantics, server-created web-call compatibility and free-account availability must be verified from current primary sources and a controlled live attempt. No missing authorization permits a production bypass or owner impersonation. The host has limited memory; never stop unrelated services. Dependency audit findings remain #25 and production deployment stays #26.

## Notes

PR32 merged as2b98a2636cba3645344f10b32d08cd7b091c30f2 before this worktree was created. Real personal Clerk and Google text/streaming/context/reload/reopen acceptance passed; main includes the reviewed service/observability/regression foundation. The user explicitly authorizes issue/feature PR progression and necessary browser credential setup, performs login/MFA when required, waives unavailable hosted CI, preserves existing Convex data and requires the existing free Vapi account.

## Follow-ups

#24 completes cross-service/frontend/voice diagnostics and security; #25 owns whole-workspace advisory remediation and final browser/voice regression integration; #26 retains deployment/cutover and production evidence.
