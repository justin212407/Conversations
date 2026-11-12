---
status: planned
depends: [workspace, workspace-browser-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
  - specs/screens/workspace.md
  - specs/behaviors/service-regression.md
issues: [23, 24, 25, 26]
---

# Plan: Durable conversation

## Scope

Deliver the remaining persistent personal-account voice/text lifecycle after the service and account/storage foundations. GitHub sub-issues carry the bounded work and their acceptance checklists.

## Implements

Architecture, lifecycle, REST/event/job contracts, and final deployment behavior.

## Approach

Build on #18's Drizzle migrations, verified Clerk account projection, ownership-scoped persistence, and shared subscription-authorization boundary, delivered by the [persistence/auth plan](persistence-auth.md). The [conversation API plan](conversation-api.md) adds owned CRUD/history, durable text admission/retry, finalization, and validated event/job handoff (#19). The [text-generation plan](text-generation.md) implements fenced BullMQ/Gemini execution, complete bounded context, durable failures/retry, lease recovery and the provisional snapshot contract (#20). The [realtime plan](realtime.md) adds API-owned one-use tickets/access checks/event relay, database-free WebSocket delivery, atomic checkpoints and the browser recovery interface (#21). The [workspace plan](workspace.md) implements the personal Clerk/REST/realtime UI, bounded unresolved delivery identity, paginated history and keyboard/mobile recovery flows (#22). Implement voice (#23) only after that workspace actually merges. Add observability (#24) and CI/regression coverage (#25) alongside those features. Require the [workspace browser regression plan](workspace-browser-regression.md) after the merged dependency stage: portable pinned frontend/browser CI must exercise the shared production session boundary and normal browser store/API/transport against actual isolated services, preserving separate renderer and foundation proofs. Its verified closeout is a prerequisite for the combined regression criterion; synthetic sessions do not claim real Clerk sign-in or voice acceptance. Complete cutover/deployment evidence (#26). Maintain the private change journal after each small change. Absorb the workspace follow-ups: integrate voice with the established personal shell and stored history; evaluate patched optional telemetry dependencies and safe diagnostics in #24; retain controller/browser/real-service regressions in #25; complete actual frontend/service deployment and cutover proof in #26.

## Validation

- [x] Account isolation and conversation CRUD/history pass integration tests.
- [x] Text generation persists results and handles duplicate delivery/failure.
- [x] Realtime authenticates, orders updates, and recovers after disconnects.
- [x] The workspace supports create/type/stream/reopen/continue.
- [ ] Real voice calls persist history and resume with prior context.
- [ ] CI, security basics, and cross-service diagnostics cover the complete flow, including the required [workspace-browser-regression](workspace-browser-regression.md) renderer/real-service/session/privacy/cleanup evidence and separate full voice acceptance.
- [ ] Local Compose and one production environment pass the slice acceptance.

## Risks / unknowns

Real authentication/provider credentials and cloud provisioning must be available for external validation. No credential absence authorizes a production auth bypass. Existing Convex data remains untouched.

## Notes

The account/storage boundary merged in PR #28, conversation API/transactional commands in PR #29, text generation in PR #30 and realtime in PR #31. The personal workspace PR #32 actually merged and issue #22 is closed. Real Clerk personal sign-in without organization selection and four actual Google text turns proved create/type/stream/reload/reopen/continue, complete remembered context, eight stable unique persisted message IDs and zero microphone requests. Later separate read-only real-Clerk checks preserved those identities through reload/list/reopen, including after the dependency migration. The workspace checkbox is therefore checked; these live observations are distinct from synthetic identity/provider fixtures.

The service diagnostics foundation merged in PR #33 and portable service/container regression in PR #34. Frontend error/privacy and strict origin configuration merged in PR #37. Compatible dependency PR #36 and schema/legacy PR #38 are merged; PR #38 merged as acf433a6c73673732e8a05040d4b311c08f1c0f1 after both review axes and local evidence. Its 129 automated tests, actual isolated service/controller/process/container/browser checks and zero-high/critical audit are recorded in that completed plan. Lower-severity findings, the inherited shared UI 23 diagnostics and widget footer TS2367 remain explicit; none establishes full voice or production acceptance.

Portable repository-owned frontend/browser CI is now explicitly owned by the planned [workspace-browser-regression](workspace-browser-regression.md), absorbed here as a dependency, approach requirement and combined validation obligation. The existing standalone renderer and controller tests alone do not meet its real-browser/service/session requirements. All completed plans remain frozen; this unstarted umbrella owns reconciliation of their combined acceptance.

Voice #23 and full voice-related #24/#25 criteria remain open. The existing free-account Vapi probe could not start the authorized call; live voice capability/mapping remains unproven and no paid funding, upgrade or billing change is authorized. Railway/deployment stays deferred to #26. The hosted-CI billing/access waiver permits reviewed local gates while hosted execution is unavailable, never a hosted pass or a production auth bypass. Existing Convex data remains untouched and the central local change journal stays ignored.

## Follow-ups

Later features remain in Slices 2–5.
