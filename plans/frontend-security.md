---
status: planned
depends: [workspace, observability, security-dependencies]
specs:
  - specs/behaviors/observability.md
issues: [24]
---

# Plan: Optional frontend diagnostics and API origin security

## Scope

Harden the existing optional Sentry 10.78.0 browser/Node/edge diagnostics and workspace API origin configuration after their merged dependencies. Keep this feature independent of the concurrent Zod/AI migration in [schema and legacy security](security-schema-legacy.md). Root reviews and accepts this amendment and plan before implementation.

Voice diagnostics remain #23/#24; final deployed HTTPS/WSS/proxy/runbook acceptance remains #26 and explicitly deferred. Hosted CI is unavailable under the user's waiver; local reviewed evidence remains required. No provider/Clerk/Sentry account requests, private configuration, old Convex data, cloud signup or paid resources are needed.

## Implements

- [Observability](../specs/behaviors/observability.md): optional frontend error-only diagnostics, complete exported-envelope privacy, bounded best-effort failure handling, retired demonstration routes and explicit production API origin validation.
- Existing [workspace](../specs/screens/workspace.md), [API](../specs/api/conversations.md) and [lifecycle](../specs/behaviors/conversation-lifecycle.md) contracts remain unchanged.

## Approach

1. Review the existing three initialization hooks, request/global error entrypoints, demonstration routes and context initialization against the installed SDK and current primary documentation. Audit every envelope route rather than treating `beforeSend` as universal. Accept the spec and bounded ownership before implementation.
2. Add a pure diagnostics policy under `apps/web/modules/diagnostics/`. Reconstruct only fixed safe errors using closed runtime/failure categories. Add a final transport wrapper that reconstructs allowed error envelopes and drops all other item types and dynamic headers, even when upstream SDK processing adds fields or attachments after `beforeSend`. Bound queue/concurrency/request time; reject malformed inputs without printing or throwing raw details. Use the installed SDK's supported transport/serialization primitives and existing runtime capabilities without adding dependencies.
3. Wire browser/Node/edge initialization with `defaultIntegrations: false`, no added automatic integrations, `sendDefaultPii: false`, `sendClientReports: false`, `enableLogs: false`, `enableMetrics: false`, no replay, no tracing sampler/rate, no trace-propagation targets and a transaction-drop hook. Node skips automatic OpenTelemetry setup. Missing/invalid DSNs skip initialization/export; initialization and capture failures are contained. Preserve useful explicit global-render/request-error signals as safe summaries, without forwarding raw error/request arguments or intercepting console.
4. Remove only `apps/web/app/sentry-example-page/page.tsx` and `apps/web/app/api/sentry-example-api/route.ts` as the explicitly retired Sentry installation demonstrations. Their live connectivity/account-link/intentional-throw behavior is replaced by isolated automated verification, not another product route.
5. Add `apps/web/modules/workspace/config.ts` with a pure API-origin resolver and minimal `context.tsx` wiring. Production requires configured HTTPS; require literal HTTP(S) authority syntax and reject raw whitespace/control characters/backslashes, any userinfo/query/fragment delimiter (including empty delimiters), non-root paths and invalid origins with the fixed field-name error. Never trim or rely on parser repair. Accept optional root slash and normalize to origin. Development/test retain absent-value localhost fallback and explicit loopback HTTP. Keep API client, model, pending-intent, shared contracts and backend security unchanged.
6. Add distinct `test/diagnostics.test.ts` and `test/config.test.ts`, discovered by the existing `tsx --test test/*.test.ts` command. Exercise real installed Next.js SDK runtime-specific entrypoints/clients and actual SDK envelope serialization into private in-memory capture with synthetic DSNs/canaries; never contact Sentry or application/provider endpoints. Cover enabled/disabled output, enrichment/attachments/other envelope kinds, malformed inputs, throwing/rejecting transport and unchanged domain/control outcomes. Keep actual runtime evidence separate from entrypoint/configuration verification.
7. Update only the frontend portion of `docs/observability.md` with opt-in setup, exact privacy/utility limits, local reproduction, primary source links and evidence limits. Journal each small change in the central ignored local change log; never copy/upload it.
8. Serialize clean frozen installation/build with root. Run meaningful units and web build/type/lint; retain honest inherited shared-UI/widget limitations. Run existing browser fixture/relevant checks only within root's allocated resources. Freeze source for independent standards/spec review, then push/open one scoped PR `Refs #24`; root owns fixes/review/merge. Close the plan only with actual evidence and explicit remaining issue ownership.

## Validation

- [ ] Root accepts the spec/plan and exact non-overlapping file ownership before implementation; dependencies are actually merged.
- [ ] Real Sentry 10.78.0 processing plus final SDK-serialized transport output contains only fixed safe error fields and generated identities/times; synthetic content/secret/URL/user/exception/header canaries are absent.
- [ ] Browser, Node and edge entrypoints use the same policy; disabled/malformed DSN produces no export, and unsupported envelope kinds/attachments/enrichment fail closed. The evidence identifies actual runtimes versus entrypoint-only checks.
- [ ] Throwing/rejecting/timed-out diagnostics and malformed inputs cannot change the existing return/rejection or invoke a domain command/retry; export queue/time is bounded and console is not intercepted.
- [ ] Production origin cases require explicit HTTPS; credentials/query/fragment/non-root paths/empty/relative/invalid values fail with only `NEXT_PUBLIC_API_URL`; optional root slash normalization and local HTTP behavior pass without network access.
- [ ] Both Sentry demonstration routes are absent and no connectivity probe, source-map upload, tunnel or user-facing diagnostic success claim remains.
- [ ] Frozen install, web unit/type/lint/build and relevant fixture checks pass or report a verified unchanged inherited baseline, using synthetic public configuration and no real provider/account requests. Hosted execution is explicitly unclaimed.
- [ ] Review guide/runbook record exact actual output evidence and limitations; source is frozen and independent standards/spec review is completed before root merges. #24 remains open for voice and production acceptance.

## Risks / unknowns

- **SDK enrichment and alternate outputs** — errors acquire SDK metadata/envelope headers and attachments after event hooks; a final allowlist plus actual serialized-output tests owns this risk. Installed 10.78.0 core defaults logs and metrics on unless explicitly disabled. Runtime conditional exports require testing the actual resolved entrypoints rather than assuming the Node import is browser/edge proof.
- **Runtime side effects** — Next.js initialization can install OpenTelemetry/global integrations beyond error handling. Explicitly disable automatic collection and contain initialization; investigate source and test behavior. No browser console interception is acceptable.
- **Diagnostic utility** — eliminating all raw messages/stacks/domain IDs intentionally limits investigation to failure category/runtime/count. Correlated service telemetry remains the source for durable flow investigation.
- **Build constraints** — host memory is limited and inherited optional shared-UI/widget errors exist. Root allocates heavy checks; no unrelated process or browser state is touched.

## Notes

Proposal only; implementation and validation are pending acceptance. Relevant primary sources: [pinned core client](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/client.ts), [pinned envelope construction](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/envelope.ts), [serialization](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/utils/envelope.ts), [Next.js browser init](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/client/index.ts), [Node init](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/server/index.ts), [edge init](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/edge/index.ts) and [current options](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/). Read-only installed source confirms 10.78.0 core/Next.js/Node/edge and the browser resolved through its React dependency.

## Follow-ups

Populated at closeout; existing #23/#24 voice and #26 deployed acceptance remain outside this bounded feature.
