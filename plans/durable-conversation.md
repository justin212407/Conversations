---
status: planned
depends: [service-foundation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [18, 19, 20, 21, 22, 23, 24, 25, 26]
---

# Plan: Durable conversation

## Scope

Deliver the persistent personal-account voice/text lifecycle after the service foundation. GitHub sub-issues carry the bounded work and their acceptance checklists.

## Implements

Architecture, lifecycle, REST/event/job contracts, and final deployment behavior.

## Approach

Implement account/storage (#18), API (#19), text worker (#20), realtime (#21), workspace (#22), and voice (#23) in dependency order. Add observability (#24) and CI/regression coverage (#25) alongside those features. Complete cutover/deployment evidence (#26). Maintain the private change journal after each small change.

## Validation

- [ ] Account isolation and conversation CRUD/history pass integration tests.
- [ ] Text generation persists results and handles duplicate delivery/failure.
- [ ] Realtime authenticates, orders updates, and recovers after disconnects.
- [ ] The workspace supports create/type/stream/reopen/continue.
- [ ] Real voice calls persist history and resume with prior context.
- [ ] CI, security basics, and cross-service diagnostics cover the complete flow.
- [ ] Local Compose and one production environment pass the slice acceptance.

## Risks / unknowns

Real authentication/provider credentials and cloud provisioning must be available for external validation. No credential absence authorizes a production auth bypass. Existing Convex data remains untouched.

## Notes

Not started.

## Follow-ups

Later features remain in Slices 2–5.
