---
status: in-progress
depends: [persistence-auth]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [19]
---

# Plan: Versioned conversation API and durable commands

## Scope

Complete #19 after merged PR #28: authenticated conversation CRUD, keyset-paginated conversation/message history, durable/idempotent text admission and controlled retry, common finalized-message persistence, transactional application-event/job handoff, and runtime OpenAPI 3.1. Worker generation, application sockets, workspace UI, Vapi orchestration, and cloud deployment remain their dependent issues.

## Implements

- Lifecycle: account-owned active/archived/deleted conversations, stable ordered text/voice messages, idempotent requests, one admitted operation, and durable completed history.
- API: the specified conversation/message/retry endpoints, shared errors/cursors, and machine-readable documentation of implemented routes including `/v1/me` and health.
- Architecture: PostgreSQL-authoritative commands/results with a recoverable durable handoff; provider-specific data stays outside the application contract.

## Approach

1. Reuse merged Clerk authentication and the ownership-scoped persistence package. Add generated migrations for bounded operation/request identities and event/job handoff as needed; do not implement generation/provider orchestration here.
2. Implement CRUD and strict validation/error envelopes, excluding deleted resources and enforcing active-operation lifecycle conflicts transactionally.
3. Implement stable keyset cursors scoped to resource/ordering, retaining full PostgreSQL timestamp precision for conversation pagination. Latest message pages return ascending sequence; older pages prepend.
4. Commit accepted text operations, stable user/assistant identities, and pending generation handoff atomically. Same request/payload returns the original result; conflicting identity reuse returns 409. Controlled retries refer to the failed turn and never duplicate its user message.
5. Provide the common transactional finalization/event seam consumed by the future worker/voice adapter. Prove duplicate finalization and interrupted delivery cannot duplicate completed history or lose the durable handoff. Keep partial output provisional.
6. Publish OpenAPI 3.1 with examples and document exactly which flows exist. Add real PostgreSQL/API integration and rollback/recovery tests; review, validate locally, raise a PR, and merge before starting dependent features.

## Validation

- [ ] Owned conversation create/list/read/rename/archive/unarchive/soft-delete match the accepted lifecycle; cross-account and deleted resources return indistinguishable 404s.
- [ ] Conversation/message pagination is stable across ties, full timestamp precision, and cursor boundaries; limits and invalid/cross-resource cursors are validated.
- [ ] Invalid inputs, state conflicts, oversized data, auth failures, and unavailable dependencies use documented credential-safe errors.
- [ ] Text submission atomically persists stable user/assistant/operation identities and durable generation handoff; concurrent duplicates converge and changed-payload reuse conflicts.
- [ ] Active-operation admission, controlled retry, and explicit interruption/recovery preserve history and avoid duplicate user turns.
- [ ] Common text/voice finalization and application-event handoff are transactional and idempotent; simulated delivery interruption leaves recoverable durable state.
- [ ] Runtime OpenAPI 3.1 accurately describes implemented routes and examples without claiming worker/socket/provider features exist.
- [ ] Scoped build/typecheck/lint, real database/API tests, existing regressions, migration upgrade, and isolated smoke pass; private records/secrets remain untracked.

## Risks / unknowns

- New commands remain visibly pending until #20's worker consumes the durable handoff; acceptance is durable command admission, not a generated response.
- Real provider ingestion is #23 and consumes the common persistence/finalization seam; browser transcripts are not trusted final writes.
- Hosted CI is temporarily replaced by reviewed local checks with explicit user authorization. Railway deployment is deferred to #26; no Vapi upgrade is authorized.

## Notes

PR #28 merged as `3df1bdd`; the dependency is on main before this worktree was created. Runtime OpenAPI publication explicitly includes the prior identity endpoint.

## Follow-ups

Tracked by #20–#26 and the durable-conversation plan; no downstream behavior is claimed complete by this API feature.
