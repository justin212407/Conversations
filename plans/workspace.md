---
status: done
depends: [realtime]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
  - specs/screens/workspace.md
issues: [22]
pr: 32
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
- [x] Create/list/paginate/open conversations and ordered persisted/older history work through the versioned API.
- [x] Text submission streams once, exposes pending/failure and controlled retry, and handles uncertain delivery and concurrency without duplicating user turns.
- [x] Reload/reopen/continue and realtime reconnect preserve authoritative completed messages/context with visible recovery states.
- [x] Keyboard, responsive rendering and loading/empty/error/unavailable states are usable; text-only flow requests no microphone permission.
- [x] Active routes/navigation use developer-workspace language and reuse the established shell/shared chat primitives; the new path has no Convex dependency.
- [ ] Meaningful frontend checks, scoped build/typecheck/lint, relevant prior regressions and local browser/container checks pass under the owner's hosted-CI exception; live evidence is distinguished from fixtures.

## Risks / unknowns

Clerk frontend instance settings and existing local redirect configuration can affect real sign-in. No missing credential authorizes a production bypass. Frontend packaging must build shared contracts from a clean checkout and exclude every env/journal file. Legacy widget/Convex remain isolated until verified replacement and final cutover.

## Notes

PR #31 merged as a03a4d92d830fb8e5ea7c561330fdcfe15ba2981 before this worktree was created. Its reviewed connection interface handles one-use tickets, scoped delivery, terminal/retry metadata and checkpoint recovery. Root verified actual Docker Gemini completion and realtime-container restart. User authorized ongoing feature PRs/merges with reviewed local gates; Railway #26 stays deferred and Vapi stays on the existing free account.

Implementation source is frozen at 3c3717b in [PR #32](https://github.com/justin212407/Conversations/pull/32), preceded by the screen-spec commit 9f5ef28. Ten frontend unit tests, one real-service frontend integration and 61 prior service tests passed (72 total). Final frontend typecheck/lint, frozen installation and a clean production build passed. The owned Brave fixture verified keyboard send, older history, failure/retry, lost-ack replay, rename/archive/unarchive, reconnect and responsive rendering without microphone requests. Fixtures use signed Clerk SDK verification and isolated services; no fixture auth is selected in production.

The first validation criterion remains unchecked pending root's actual end-user Clerk walkthrough. A warmed real-key sign-in form is confirmed, but no completed live sign-in/generation/reload claim is made at closeout. The final validation criterion remains unchecked until root finishes independent review and the live browser/container gate before merge. The implementation branch does not merge itself, and no dependent voice work begins before that merge.

The active path uses a bounded session-local unresolved-command store (20 intents/512 KiB), preserves matching request IDs through uncertain delivery and consumes the merged connection/reducer boundary. The plain Next configuration removes the obsolete Sentry tunnel wrapper; runtime telemetry is opt-in and scrubbed. Cold concurrent Next writers exposed torn generated route caches, so verification used one writer and a clean owned cache. The scoped lock importer change preserves prior resolutions. See [workspace documentation](../docs/workspace.md) for module responsibilities and local commands.

## Follow-ups

- Tracked as: root's pre-merge real-Clerk walkthrough and independent review of PR #32; the unchecked criteria above are retained until that evidence is recorded.
- Deferred to [durable-conversation](durable-conversation.md) — voice #23 consumes the merged workspace; observability/security #24 evaluates patched telemetry dependencies and diagnostics, #25 completes cross-service/frontend regression coverage, and #26 verifies deployment/cutover under the existing Railway deferral. Vapi stays on the existing free account.

### Integration after diagnostics merge

PR #33 merged as b89756d before the workspace branch was rebased. Both private observability-config and browser-capture ignore exclusions were preserved. Exact frontend/shared-UI tree comparison found no behavior changes; frozen installation, web typecheck,12 unit tests and the real-service controller integration passed on the merged diagnostic boundaries. The combined checked paths comprise70 service tests and13 frontend tests. Both original workspace review findings were corrected and independently cleared before this rebase.

The real Clerk development instance still leaves the dedicated test identity pending with choose-organization. Personal Accounts must be enabled in its dashboard before the personal sign-in/generation/reload walkthrough; the actual API correctly rejects the pending session. Keep personal/live acceptance unchecked, preserve owner/Convex data, and do not substitute a production auth bypass. Independent #24 foundation and #25 automation can progress without changing this requirement.
