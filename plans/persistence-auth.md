---
status: in-progress
depends: [service-foundation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [18]
---

# Plan: Persistence and personal-account authorization

## Scope

Implement #18 after merged PR #27: PostgreSQL/Drizzle accounts, conversations, and messages; versioned migrations; verified Clerk identity; shared account-owned data access and subscription authorization. Expose the already specified `/v1/me` identity projection. Conversation CRUD routes, generation, application sockets, workspace UI, voice integration, and cloud deployment remain downstream issues.

## Implements

- Architecture: PostgreSQL is authoritative; personal accounts own conversations and messages; Convex data is untouched.
- Lifecycle: uniquely provision accounts from verified Clerk subjects, exclude deleted conversations, enforce ownership, and allocate stable message identities/sequences transactionally.
- API: verified bearer authentication, consistent errors, and `/v1/me`; reusable authorization for later conversation routes and realtime-ticket issuance.

## Approach

1. Add a server-only Drizzle persistence package with committed generated migration metadata/SQL, explicit one-shot migration command, and bounded connection ownership.
2. Implement concurrency-safe account provisioning and ownership-scoped conversation/message access. Keep authorization and mutation in the same transaction where race conditions matter; give future consumers one application-owned authorization interface.
3. Verify Clerk session signatures, expected issuer, expiration, and configured authorized parties using its supported backend SDK. Tests use signed local fixtures through that same verification path; production has no authentication bypass.
4. Integrate API identity projection and safe error handling with the merged health/runtime foundation. Update environment templates, local/Compose guidance, and scoped automated checks.
5. Verify against isolated real PostgreSQL databases and deterministic JWTs. Review the complete diff, publish a PR, and close this plan only with supporting evidence. The user authorized a temporary local-check merge gate while hosted CI is unavailable.

## Validation

- [ ] Generated Drizzle schema/migrations define accounts, conversations, and messages with ownership, identity, ordering, and lifecycle constraints/indexes.
- [ ] Clean setup and migration re-run/upgrade preserve data and pass against real PostgreSQL.
- [ ] Concurrent provisioning of one verified Clerk subject produces one account.
- [ ] API rejects absent, malformed, invalid-signature, expired, wrong-issuer, and unauthorized-party credentials; only a verified identity provisions an account.
- [ ] `/v1/me` returns the same internal account across repeated authenticated requests, without exposing credentials.
- [ ] Shared data-access/subscription authorization denies another account's reads and mutations and treats deleted/missing conversations as inaccessible.
- [ ] Concurrent message writes retain unique stable IDs and conversation-local sequence order, with rollback on failure.
- [ ] Scoped build/typecheck/lint/tests and real-dependency smoke pass; local-only records and secrets remain untracked.

## Risks / unknowns

- Clerk credential presence is not proof of live authentication; local signed fixtures verify the real signature path and live validation is recorded separately when available.
- Actual sockets/realtime tickets are #21; this feature validates the authorization boundary they must consume.
- Railway access is deferred to #26 and does not gate this local implementation. Vapi stays on the existing free plan; its real-call limits are validated in #23.

## Notes

PR #27 merged as `a7a2050`; the dependency is present on origin/main before this worktree was created.

## Follow-ups

Tracked by #19–#26 and the durable-conversation plan. Do not mark downstream behavior implemented by this foundation.
