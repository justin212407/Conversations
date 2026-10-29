---
status: planned
depends: [text-generation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [21, 22, 23, 24, 25, 26]
---

# Plan: Durable conversation

## Scope

Deliver the remaining persistent personal-account voice/text lifecycle after the service and account/storage foundations. GitHub sub-issues carry the bounded work and their acceptance checklists.

## Implements

Architecture, lifecycle, REST/event/job contracts, and final deployment behavior.

## Approach

Build on #18's Drizzle migrations, verified Clerk account projection, ownership-scoped persistence, and shared subscription-authorization boundary, delivered by the [persistence/auth plan](persistence-auth.md). The [conversation API plan](conversation-api.md) adds owned CRUD/history, durable text admission/retry, finalization, and validated event/job handoff (#19). The [text-generation plan](text-generation.md) implements fenced BullMQ/Gemini execution, complete bounded context, durable failures/retry, lease recovery and the provisional snapshot contract (#20). Implement realtime (#21), workspace (#22), and voice (#23) in dependency order after that feature actually merges. Add observability (#24) and CI/regression coverage (#25) alongside those features. Complete cutover/deployment evidence (#26). Maintain the private change journal after each small change.

## Validation

- [x] Account isolation and conversation CRUD/history pass integration tests.
- [x] Text generation persists results and handles duplicate delivery/failure.
- [ ] Realtime authenticates, orders updates, and recovers after disconnects.
- [ ] The workspace supports create/type/stream/reopen/continue.
- [ ] Real voice calls persist history and resume with prior context.
- [ ] CI, security basics, and cross-service diagnostics cover the complete flow.
- [ ] Local Compose and one production environment pass the slice acceptance.

## Risks / unknowns

Real authentication/provider credentials and cloud provisioning must be available for external validation. No credential absence authorizes a production auth bypass. Existing Convex data remains untouched.

## Notes

The account/storage boundary merged in PR #28 and the conversation API/transactional command boundary merged in PR #29. Text generation is implemented in PR #30, with 43 local tests plus genuine separate-worker Gemini execution evidence; dependent realtime implementation must wait for its actual merge. Its stable provisional snapshot contract is consumed by #21. Remaining realtime/UI/voice/diagnostic/regression/deployment criteria stay open; text completion does not imply those flows. Railway remains deferred to #26, Vapi stays free, and the user's temporary hosted-CI exception preserves reviewed local gates.

## Follow-ups

Later features remain in Slices 2–5.
