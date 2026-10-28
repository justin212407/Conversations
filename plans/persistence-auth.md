---
status: done
depends: [service-foundation]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [18]
pr: 28
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

- [x] Generated Drizzle schema/migrations define accounts, conversations, and messages with ownership, identity, ordering, and lifecycle constraints/indexes.
- [x] Clean setup and migration re-run/upgrade preserve data and pass against real PostgreSQL.
- [x] Concurrent provisioning of one verified Clerk subject produces one account.
- [x] API rejects absent, malformed, invalid-signature, expired, wrong-issuer, and unauthorized-party credentials; only a verified identity provisions an account.
- [x] `/v1/me` returns the same internal account across repeated authenticated requests, without exposing credentials.
- [x] Shared data-access/subscription authorization denies another account's reads and mutations and treats deleted/missing conversations as inaccessible.
- [x] Concurrent message writes retain unique stable IDs and conversation-local sequence order, with rollback on failure.
- [x] Scoped build/typecheck/lint/tests and real-dependency smoke pass; local-only records and secrets remain untracked.

## Risks / unknowns

- Clerk credential presence is not proof of live authentication; local signed fixtures verify the real signature path and live validation is recorded separately when available.
- Actual sockets/realtime tickets are #21; this feature validates the authorization boundary they must consume.
- Railway access is deferred to #26 and does not gate this local implementation. Vapi stays on the existing free plan; its real-call limits are validated in #23.

## Notes

PR #27 merged as `a7a2050`; the dependency was present on origin/main before this worktree was created. Implementation is PR #28.

Build/typecheck/lint pass. Seventeen top-level tests pass: four PostgreSQL migration/ownership/concurrency suites, nine runtime regressions, and four API suites using signed local fixtures through Clerk verification, including its network seam. The isolated smoke verifies schema readiness, missing-bearer rejection, real queue delivery, dependency outage, and clean shutdown. Frozen offline installation, generated-schema consistency, Compose config, formatting, and diff checks pass. All tests/smoke use uniquely named temporary databases; the base DB and Convex data remain untouched.

Independent standards/spec reviews completed. Standards review found a test-setup cleanup gap; immediate test-context database cleanup registration fixes it, and the four API suites passed again. The reviewer confirmed resolution. Specification review found no actionable defect. A fresh service image also built successfully; a separate Compose project verified migration exit 0 before API startup, healthy schema readiness, and missing-bearer 401. Temporary review resources were isolated from the development stack.

API identity and readiness reuse the runtime-owned pool. All expected migration hashes must be present, while additive ahead migrations can coexist during rollout. Migration waits are bounded. Invalid sessions return 401; provider/configuration outages return generic 503. These behaviors and the temporary merge policy are documented in development/Slice 1 guidance.

The root agent verified the existing Clerk backend key and configured issuer return matching JWKS, but no real end-user session issuance is claimed. Live session UX is verified with #22. Actual socket subscriptions consume this feature's tested shared authorization boundary in #21; no application socket endpoint is claimed here. Hosted CI remains unavailable and the user explicitly authorized reviewed local checks as the temporary gate.

## Follow-ups

- Issue [#19](https://github.com/justin212407/Conversations/issues/19) — conversation REST/OpenAPI and reliable event handoff use this persistence boundary.
- Issue [#21](https://github.com/justin212407/Conversations/issues/21) — realtime-ticket/subscription flow consumes shared ownership authorization and enforces access revocation.
- Issue [#22](https://github.com/justin212407/Conversations/issues/22) — verify real-user Clerk sign-in and workspace flow.
- Issues #20, #23–#26 — remaining generation, voice, observability, regression, and deployment acceptance in the durable-conversation plan.
