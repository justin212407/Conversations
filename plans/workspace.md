---
status: in-progress
depends: [realtime]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
issues: [22]
---

# Plan: Personal developer conversation workspace

## Scope

Complete #22 using merged text generation and authenticated realtime. Refactor the existing Next.js dashboard/shared UI into the personal developer conversation product: Clerk sign-in, owned conversation list/detail/history, text submission/streaming/retry and reload/reconnect recovery. Preserve the established frontend foundation and reusable chat primitives. Voice orchestration, projects/files/tools and deployment remain downstream.

## Implements

The architecture's apps/web destination and personal account boundary, durable lifecycle/recovery rules, and versioned REST/socket contracts. Add a bounded screen specification before implementing navigation/display/actions.

## Approach

1. Audit the current dashboard, auth/organization guards, redirects, Convex bindings and shared/widget chat primitives. Record the accepted screen behavior before implementation; retain the existing shell, theme and reusable components.
2. Use Clerk identity and the API's internal account workflow. Remove mandatory organization selection and Convex access from the new Slice 1 path without reading, importing or deleting existing Convex data.
3. Add owned paginated conversation listing/create and detail routes. Use the merged browser connection module for subscribe-before-snapshot state, streamed updates, reconnect and unavailable states; do not recreate its protocol inside React.
4. Implement text commands and controlled retry through typed API bindings. Preserve request IDs across uncertain delivery/retry, surface safe errors, avoid duplicate optimistic messages and retain completed history through reload/reopen. Handle concurrent operation/lifecycle conflicts honestly.
5. Provide keyboard-accessible input/navigation, readable loading/empty/error/pending/failed/reconnect states, older-history pagination and responsive layout. Text use must not request microphone access. Replace support/widget/organization product language in the active navigation.
6. Verify meaningful frontend behavior, account isolation and actual browser flows using isolated test data/services. Keep automated fixtures out of production auth; root separately verifies live Clerk/provider access when available. Preserve existing lock resolutions when adding/removing scoped dependencies.
7. Verify frontend build/typecheck/lint and service regressions, packaging/local Compose and browser behavior. Update the central ignored journal after every small change; publish a PR, close the plan honestly and wait for review/merge before dependent voice work.

## Validation

- [ ] Personal Clerk sign-in reaches the workspace without organization selection or Convex guards; server requests use the verified account boundary.
- [ ] Create/list/paginate/open conversations and ordered persisted/older history work through the versioned API.
- [ ] Text submission streams once, exposes pending/failure and controlled retry, and handles uncertain delivery and concurrency without duplicating user turns.
- [ ] Reload/reopen/continue and realtime reconnect preserve authoritative completed messages/context with visible recovery states.
- [ ] Keyboard, responsive rendering and loading/empty/error/unavailable states are usable; text-only flow requests no microphone permission.
- [ ] Active routes/navigation use developer-workspace language and reuse the established shell/shared chat primitives; the new path has no Convex dependency.
- [ ] Meaningful frontend checks, scoped build/typecheck/lint, relevant prior regressions and local browser/container checks pass under the owner's hosted-CI exception; live evidence is distinguished from fixtures.

## Risks / unknowns

Clerk frontend instance settings and existing local redirect configuration can affect real sign-in. No missing credential authorizes a production bypass. Frontend packaging must build shared contracts from a clean checkout and exclude every env/journal file. Legacy widget/Convex remain isolated until verified replacement and final cutover.

## Notes

PR #31 merged as a03a4d92d830fb8e5ea7c561330fdcfe15ba2981 before this worktree was created. Its reviewed connection interface handles one-use tickets, scoped delivery, terminal/retry metadata and checkpoint recovery. Root verified actual Docker Gemini completion and realtime-container restart. User authorized ongoing feature PRs/merges with reviewed local gates; Railway #26 stays deferred and Vapi stays on the existing free account.

## Follow-ups

Voice #23 consumes this workspace after merge. Observability/security #24, complete regression/CI #25 and deferred deployment/cutover #26 remain in the umbrella plan.
