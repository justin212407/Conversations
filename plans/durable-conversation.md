---
status: planned
depends: [conversation-api]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [20, 21, 22, 23, 24, 25, 26]
---

# Plan: Durable conversation

## Scope

Deliver the remaining persistent personal-account voice/text lifecycle after the service and account/storage foundations. GitHub sub-issues carry the bounded work and their acceptance checklists.

## Implements

Architecture, lifecycle, REST/event/job contracts, and final deployment behavior.

## Approach

Build on #18's Drizzle migrations, verified Clerk account projection, ownership-scoped persistence, and shared subscription-authorization boundary, delivered by the [persistence/auth plan](persistence-auth.md). The [conversation API plan](conversation-api.md) adds owned CRUD/history, durable text admission/retry, finalization, and validated event/job handoff (#19). Implement text worker (#20), realtime (#21), workspace (#22), and voice (#23) in dependency order. Add observability (#24) and CI/regression coverage (#25) alongside those features. Complete cutover/deployment evidence (#26). Maintain the private change journal after each small change.

## Validation

- [x] Account isolation and conversation CRUD/history pass integration tests.
- [ ] Text generation persists results and handles duplicate delivery/failure.
- [ ] Realtime authenticates, orders updates, and recovers after disconnects.
- [ ] The workspace supports create/type/stream/reopen/continue.
- [ ] Real voice calls persist history and resume with prior context.
- [ ] CI, security basics, and cross-service diagnostics cover the complete flow.
- [ ] Local Compose and one production environment pass the slice acceptance.

## Risks / unknowns

Real authentication/provider credentials and cloud provisioning must be available for external validation. No credential absence authorizes a production auth bypass. Existing Convex data remains untouched.

## Notes

The account/storage boundary merged in PR #28. The conversation API and transactional command/handoff boundary are implemented in PR #29; dependent implementation must wait for its actual merge. Its real PostgreSQL/API suites verify the account-isolation and CRUD/history criterion. Remaining lifecycle criteria stay open, and model generation/realtime/UI/voice/deployment are not implied by accepted pending commands.

## Follow-ups

Later features remain in Slices 2–5.
