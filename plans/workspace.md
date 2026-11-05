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

- [x] Personal Clerk sign-in reaches the workspace without organization selection or Convex guards; server requests use the verified account boundary.
- [x] Create/list/paginate/open conversations and ordered persisted/older history work through the versioned API.
- [x] Text submission streams once, exposes pending/failure and controlled retry, and handles uncertain delivery and concurrency without duplicating user turns.
- [x] Reload/reopen/continue and realtime reconnect preserve authoritative completed messages/context with visible recovery states.
- [x] Keyboard, responsive rendering and loading/empty/error/unavailable states are usable; text-only flow requests no microphone permission.
- [x] Active routes/navigation use developer-workspace language and reuse the established shell/shared chat primitives; the new path has no Convex dependency.
- [x] Meaningful frontend checks, scoped build/typecheck/lint, relevant prior regressions and local browser/container checks pass under the owner's hosted-CI exception; live evidence is distinguished from fixtures.

## Risks / unknowns

Clerk frontend instance settings and existing local redirect configuration can affect real sign-in. No missing credential authorizes a production bypass. Frontend packaging must build shared contracts from a clean checkout and exclude every env/journal file. Legacy widget/Convex remain isolated until verified replacement and final cutover.

## Notes

PR31 realtime, PR33 diagnostics and PR34 service regression are merged prerequisites. The workspace source was independently reviewed, including corrected unresolved-request identity retention through session expiry and unavailable-history cleanup/fencing. Both review axes cleared those corrections. Rebase onto main de9ba5d produced61428ae with an exact unchanged frontend/shared-UI/shared-contract/product-service/Dockerfile tree compared with reviewed b95a84e. Frozen installation passed again.

Automated evidence comprises98 checked paths:70 service tests,15 regression-harness tests,12 frontend units and1 real-service controller integration. Frontend typecheck/lint, a clean production build and the isolated Brave keyboard/responsive/lifecycle/retry/reconnect fixture were verified on the same frontend implementation. The merged container gate additionally verifies the actual separated service lifecycle with deterministic signed identities/provider substitution. Hosted execution remains unavailable under the owner's explicit waiver; no hosted pass is claimed.

Root completed real Clerk development and Google-provider acceptance on2026-11-06. Through the owner-authorized normal Brave dashboard, Conversations Development now has Membership optional saved and verified after reload. The dedicated test identity has an active personal Clerk session with no organization/task and actual API authorization200. The actual UI created a conversation, generated four real Google answers, observed message.snapshot streaming, survived fresh-document reloads, recalled the prior codeword on continuation and reopened from the sidebar. All8 persisted message IDs remain unique/stable. The monitored text turn made0 microphone calls while microphone permission remained unrequested.

Private proof and the central ignored change journal remain outside Git. No owner impersonation, production auth bypass, Convex import/deletion, Vapi upgrade or Railway deployment occurred. The frontend uses the accepted bounded unresolved-intent store and shared connection/reducer; the normal Clerk/API ownership boundary is exercised end to end. All validation criteria for this workspace scope are now verified before root merges PR32.

## Follow-ups

- Deferred to [durable-conversation](durable-conversation.md): voice#23 consumes this merged workspace; #24 completes frontend/voice diagnostics; #25 integrates the remaining browser/voice regression and dependency remediation; #26 owns deployment/cutover under the existing Railway deferral. Vapi stays on the existing free account.
