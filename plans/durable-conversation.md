---
status: planned
depends: [workspace]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [23, 24, 25, 26]
---

# Plan: Durable conversation

## Scope

Deliver the remaining persistent personal-account voice/text lifecycle after the service and account/storage foundations. GitHub sub-issues carry the bounded work and their acceptance checklists.

## Implements

Architecture, lifecycle, REST/event/job contracts, and final deployment behavior.

## Approach

Build on #18's Drizzle migrations, verified Clerk account projection, ownership-scoped persistence, and shared subscription-authorization boundary, delivered by the [persistence/auth plan](persistence-auth.md). The [conversation API plan](conversation-api.md) adds owned CRUD/history, durable text admission/retry, finalization, and validated event/job handoff (#19). The [text-generation plan](text-generation.md) implements fenced BullMQ/Gemini execution, complete bounded context, durable failures/retry, lease recovery and the provisional snapshot contract (#20). The [realtime plan](realtime.md) adds API-owned one-use tickets/access checks/event relay, database-free WebSocket delivery, atomic checkpoints and the browser recovery interface (#21). The [workspace plan](workspace.md) implements the personal Clerk/REST/realtime UI, bounded unresolved delivery identity, paginated history and keyboard/mobile recovery flows (#22). The workspace merged before the [voice plan](voice.md) began (#23). Add observability (#24) and CI/regression coverage (#25) alongside those features. Complete cutover/deployment evidence (#26). Maintain the private change journal after each small change. Absorb the workspace follow-ups: integrate voice with the established personal shell and stored history; evaluate patched optional telemetry dependencies and safe diagnostics in #24; retain controller/browser/real-service regressions in #25; complete actual frontend/service deployment and cutover proof in #26.

## Validation

- [x] Account isolation and conversation CRUD/history pass integration tests.
- [x] Text generation persists results and handles duplicate delivery/failure.
- [x] Realtime authenticates, orders updates, and recovers after disconnects.
- [x] The workspace supports create/type/stream/reopen/continue.
- [ ] Real voice calls persist history and resume with prior context.
- [ ] CI, security basics, and cross-service diagnostics cover the complete flow.
- [ ] Local Compose and one production environment pass the slice acceptance.

## Risks / unknowns

Real authentication/provider credentials and cloud provisioning must be available for external validation. No credential absence authorizes a production auth bypass. Existing Convex data remains untouched.

## Notes

The account/storage boundary merged in PR #28, conversation API/transactional commands in PR #29 and text generation in PR #30. Realtime merged in PR #31 before workspace implementation. The independent service diagnostics foundation merged in PR #33 with 70 service tests and actual packaged-service/Jaeger/Prometheus failure, replay, privacy, outage and cleanup proof. Issue #24 remains open for frontend/voice/deployed coverage.

The independent #25 service regression foundation merged in PR #34 as de9ba5d. Root's review corrections and verification yielded 85 service/harness checks, a repeatable isolated actual-container lifecycle and cleanup gate, process smoke and free whole-workspace dependency scanning. Actual audit findings remain failing 87 high/10 critical counts; hosted Actions execution remains unavailable under the owner's explicit local-check exception. No passing lifecycle result waives security remediation or establishes hosted execution.

The personal workspace merged in PR #32 as 2b98a2636cba3645344f10b32d08cd7b091c30f2. Actual Clerk personal-account sign-in and real Google generation passed create/stream/four typed turns/context/reload/reopen acceptance, with eight unique persisted messages and a real provisional snapshot. Microphone permission was not requested by text flow. Its 13 local controller/frontend/service checks plus 85 service/harness checks give 98 checked automated paths. Issue #22 is closed and workspace acceptance above is now checked.

The [voice plan](voice.md) now builds on those physically merged dependencies. Voice persistence/context/live provider acceptance, complete frontend/voice diagnostics/security and final regression coverage remain open in #23/#24/#25. Deployment/cutover evidence remains #26, deferred while Railway signup is unavailable. Existing Convex data stays untouched, Vapi stays on the existing free account, and no production auth bypass or fabricated deployed acceptance is authorized.

## Follow-ups

Later features remain in Slices 2–5.
