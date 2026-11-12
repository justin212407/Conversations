---
status: in-progress
depends:
  [service-regression, workspace, frontend-security, security-schema-legacy]
specs:
  - specs/architecture.md
  - specs/screens/workspace.md
  - specs/behaviors/service-regression.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/behaviors/observability.md
  - specs/behaviors/dependency-security.md
  - specs/api/conversations.md
issues: [25]
---

# Plan: Portable workspace browser and frontend CI regression

## Scope

Complete the deterministic workspace browser portion of #25 on actually merged main after PR #38. Add repository-owned, pinned browser execution over real isolated services and the missing frontend CI gates. Preserve the existing eight renderer checks and full service/container/diagnostic proof as distinct evidence. This plan does not implement voice, real Clerk sign-in, cloud deployment or the whole remaining #25/#24/Slice 1 acceptance.

No installation, runtime/browser/Docker work or product implementation starts until root accepts this proposal. The only proposed production adjustment is a small extraction of existing client session/context orchestration so the browser tests exercise the real identity/refresh/lifecycle boundary. Clerk verification, domain/API/worker/model/pending/auth behavior and Convex source/data remain unchanged.

## Implements

- `service-regression`: repository-pinned browser commands, renderer versus real-service evidence, native-origin signed identity, durable replay/context/recovery, browser privacy, joined cleanup and frontend CI.
- `workspace`: one shared session/context boundary retaining same-user refresh and identity replacement semantics, with unchanged strict API-origin validation and a thin normal Clerk/Next adapter.
- Architecture/lifecycle/API/observability/dependency security: preserve actual ownership, bounded durable history, idempotency/fencing, safe diagnostics, isolated resources and the full zero-high/critical audit threshold.

## Approach

1. Start only from the accepted spec/plan and merged prerequisites, currently base `acf433a6c73673732e8a05040d4b311c08f1c0f1`. Mark this plan in-progress in its own commit. Keep all completed plans frozen. Inventory the existing runtime/Compose/lifecycle modules, browser fixtures, controller integration, origin/auth boundary and actual Playwright source before implementation. Announce npm-axi when registry inspection is needed. Use Node 22/pnpm 10.4.1, retain root/services TypeScript 5.9.3 and backend/math 6.0.3, existing exact patches and lock resolutions.
2. Pin the Playwright **library** to `1.65.0` in the web test toolchain (candidate metadata verified: Node >=20 and matching core 1.65.0). Resolve it through that declared workspace owner from repository MJS orchestration. Use its installed Chromium by default, with an explicit repository install command and supported Ubuntu 24.04 CI prerequisites; no global CLI, external private driver, owner browser or implicit executable override supplies a required pass. Inspect public BrowserServer process/close/kill behavior on the actual installed version. Keep control endpoints private.
3. Extract existing token/session/context wiring into a small client provider module, proposed `apps/web/modules/workspace/session.tsx`. Keep `context.tsx` as the thin existing Clerk/Next adapter with the same identity/getToken/navigation and real environment inputs. The shared module retains identity-keyed sessionTokenSource, callback refresh without store replacement, strict workspaceApiOrigin validation before client/store creation, start/stop effects and context subscription. Tests inject only these inputs, not lifecycle/store/API/socket replacements. Same-user refresh must retain draft/intent/store; replacement must stop/clear/fence. The fixture's controlled navigation and synthetic identity do not prove Clerk hooks, Next routing or real sign-in. No model/pending/API/auth changes or production fixture flag are authorized by this extraction.
4. Deepen the existing stack orchestration rather than copy it. Extract the shared preparation/start/finally lifecycle from `scripts/check-service-regression.mjs` into a narrow regression module if needed; retain verifyDocker, privateRunDirectory, reservations, Compose controller, fixture mount and existing service fault modes. Add a separate root command, proposed `workspace:regression`, that owns a fresh project for browser operations. The existing `services:regression` still runs its unchanged foundation scenario and fixed metric/SQL/outage/shutdown assertions in its own project. Share reusable signing/digest/diagnostic checks through bounded helpers instead of duplicating protocols or resource cleanup.
5. Replace the standalone fixture server's unowned temporary files/process-exit cleanup with a runner-owned server interface. Preserve its eight in-memory renderer cases with private supplied screenshot paths. Add a separate test-only service-backed React entry under `apps/web/test/`; it mounts the shared production session provider and screen, normal WorkspaceStore/createWorkspaceApi and shared native connection. Browser-context bindings issue generated RSA-signed JWTs at getToken; private signing keys stay in Node. No fixture code is imported by product routes and no product debug/control endpoint is added. Discover the real fixture origin before finalizing generated stack auth/CORS/realtime settings; any Compose interpolation is test-only, with the old foundation default unchanged. Never spoof Origin or replace real API/socket traffic with fixture success.
6. Run service-backed browser cases sequentially: create and observe a provisional snapshot then exact digest completion; full fresh-document reload/list/reopen and second-prompt ordered context; persisted failure/reload/visible retry retaining one user; lost acknowledgement only after a real upstream 202 and committed admission, then reload and same-UUID Check delivery replay. Forward the intercepted request with its original native browser headers, verify upstream admission privately, and abort only its response; other requests remain native. Compare actual persisted message/operation/job/event identities and provider invocation deltas rather than any nonempty DOM output or in-memory counters. Keep the worker digest/failure entrypoint test-only and below its existing capacity. Restart realtime to prove visible disconnect, a new ticket and reconciliation of a missed persisted change; do not toggle a fixture connection flag.
7. Exercise signed foreign/expired/pending/invalid/wrong-azp cases and shared same-user token refresh/account replacement. Assert old UI/draft/pending scope does not leak and late callbacks cannot restore it. Actual backend verification and the browser's real ephemeral origin stay in force. Capture tickets and canaries privately in memory. While collectors are live, scan actual service logs/traces/metrics for browser input/title/output/credential/ticket/error canaries; use the existing real browser Sentry-policy fixture/in-memory receiver for enabled and disabled envelope privacy. No real DSN or provider network request occurs.
8. Own BrowserServer, contexts/pages, fixture server, short external profile/temp root and bounded captures through one idempotent cleanup interface. Validate Git/build-context/symlink and path-length boundaries before launch. Use graceful close then bounded supported kill/exit verification as needed; do not equate disconnect with termination. Aggregate browser/server/profile and Docker cleanup results conjunctively, continue all cleanup steps after an individual failure, and return cleanup:false/nonzero on an unverified resource. Retain no owner profile and perform no global kill/prune. Add meaningful harness tests for command/env/path/privacy/cleanup ordering and failed cleanup, plus actual owned-browser success/assertion/SIGINT/SIGTERM/deadline runs with unrelated sentinels. Fault commands are explicit and bounded; they do not run a model or alter billing.
9. Add a frontend workflow job on explicit Ubuntu 24.04, dependent on the service foundation job so heavy gates run serially. Retain the existing foundation/legacy/audit jobs and their commands. Run frozen install, service contracts build, web units/type/lint/clean synthetic-config production build, pinned Chromium/system installation, renderer/browser cleanup tests and the actual service-backed browser gate. Give inner stage/run budgets time to clean up before the job deadline. Browser binary or registry failures remain failures, not skips. No automatic screenshot/trace/HAR/report artifact upload, app/root env loading, paid scan or real credential is introduced.
10. Verify locally in coordinated serial slots: frozen install; scoped format/diff/type/lint/build; all existing service, legacy, frontend, controller and harness tests; unchanged full foundation container proof; new renderer/service-backed browser proof; all actual browser fault cleanup paths; fresh full-workspace zero-high/critical audit. Preserve the exact inherited shared UI 23 diagnostics and widget footer TS2367 transparently; reject new failures. Freeze source for root's two independent reviews, then progress only after root acceptance. Publication/merge ownership remains root-directed; never publish or merge without that direction. Keep the central ignored journal updated after every small change.

### Planned file ownership

- `apps/web/test/browser-{fixture,check,server}.*`, new service-backed fixture/check and browser cleanup tests; reuse existing `diagnostics-browser.ts` rather than modify diagnostic policy.
- Minimal `apps/web/modules/workspace/session.tsx` and `context.tsx` extraction/wiring only; existing `config.ts` validation is consumed, not relaxed. No API/model/pending/auth/Convex production changes.
- `scripts/check-service-regression.mjs`, new browser entry and focused `scripts/regression/*` orchestration/browser helpers and `scripts/test/*` regressions.
- Test-only `docker-compose.regression.yml` origin/config inputs if required; root/web manifests, lockfile, services workflow and `docs/service-regression.md` runbook.
- This spec/plan, the affected workspace session contract and unstarted durable-conversation umbrella. No completed plan is edited.

## Validation

- [ ] Clean checkout installs the exact pinned library/browser through documented repository commands, with no global tool, private helper, live credentials or owner profile dependency; toolchain/patch ownership and whole graph are preserved.
- [ ] Shared production session/context orchestration passes same-user refresh, identity replacement/stop/clear/late-callback tests while strict API-origin validation remains before store/client creation; production Clerk/Next adaptation is unchanged and synthetic limits are explicit.
- [ ] All eight existing renderer flows pass as separately labelled coverage, with private owned screenshot paths, no microphone request/overflow/page error and verified owned cleanup.
- [ ] Actual browser native API/WebSocket flow passes provisional-to-durable completion, full reload/list/reopen/second prompt and exact completed-context/identity/order checks against real isolated services.
- [ ] Actual persisted failure/reload/retry preserves one user; lost acknowledgement is proven after committed admission and survives full reload/same UUID replay with one operation/provider execution and stable durable IDs.
- [ ] Real backend signature/session/expiry/azp and foreign ownership denials, account scope clearing and actual realtime restart/new-ticket/reconciliation pass without Origin spoofing, fixture success or production bypass.
- [ ] Actual browser-operation canaries are absent from exported service diagnostics and enabled frontend SDK envelopes; disabled diagnostics and external egress are distinguished, with no raw console/CI artifact leakage.
- [ ] Browser/server/profile and Docker cleanup jointly pass normal/assertion/SIGINT/SIGTERM/deadline tests and actual owned faults, preserve sentinels, and classify failed/unverified browser cleanup as cleanup:false even when Compose cleanup succeeds.
- [ ] Existing foundation lifecycle/metrics/SQL/collector-outage/shutdown and prior focused gates retain their verified meaning; no browser operation contaminates fixed foundation counts or unrelated resources.
- [ ] Frontend CI declares units/type/lint/synthetic production build, pinned Chromium install and both browser layers with serialized heavy jobs/deadlines, retaining existing service/legacy/audit gates and the hosted-access waiver honestly.
- [ ] Frozen source has passing affected local gates and a fresh full audit with zero high/critical findings; inherited limitations, separate live Clerk/voice/deployment acceptance and remaining #25 work are recorded without claiming unavailable hosted execution.

## Risks / unknowns

- **Session fidelity** — duplicating lifecycle glue in a fixture would miss production regressions. The accepted minimal extraction must stay small, preserve validation/order and be exercised in both paths; any broader domain change returns for spec review.
- **Origin and CORS** — a real browser cannot supply Node's artificial Origin override. Reserve/discover its listener before stack config and test actual native preflights/handshakes with exact signed azp.
- **Acknowledgement fidelity** — interception can fail before server admission or accidentally retry. Confirm actual 202/committed identities, use no network auto-retry, and only then abort the acknowledgement; inspect the supported pinned routing API before coding.
- **Resource ownership** — BrowserServer disconnect or a resolved close alone may leave processes/profile/server alive. Use supported owned handles, joined bounded cleanup and actual fault evidence. Long inherited TMPDIR paths or inside-Git aliases must fail safely or use an explicitly verified short external root.
- **Proof contamination** — the current foundation assumes exact counts and stops collectors/services. Use a separate fresh browser project and reuse orchestration, not the foundation's stopped environment or weakened assertions.
- **Platform/binary availability** — required hosted target is Ubuntu 24.04 with matched Chromium; local Linux evidence does not establish all Windows/macOS signal behavior. Missing dependencies remain explicit. No owner-host OS mutation is hidden in installation.
- **Hosted execution** — account billing still prevents hosted Actions. Local actual evidence can establish implementation under the explicit waiver, never a hosted pass; voice/provider/deployment remain separate owners.

## Notes

Proposal only. Main prerequisites are actually merged: workspace PR #32, regression foundation PR #34, frontend privacy/configuration PR #37 and dependency/schema PR #38 (`acf433a6c73673732e8a05040d4b311c08f1c0f1`). Existing actual Clerk/Google acceptance is recorded in the completed workspace plan; later read-only Clerk/history checks were separate from synthetic gates. No product code, dependency/install, browser or Docker mutation is part of this proposal.

Primary guidance reviewed: [Playwright CI](https://playwright.dev/docs/ci), [browser installation](https://playwright.dev/docs/browsers), [BrowserServer lifecycle](https://playwright.dev/docs/api/class-browserserver) and [route.fetch](https://playwright.dev/docs/api/class-route#route-fetch). Their availability does not replace checking the actual pinned source/API and cleanup behavior during implementation.

## Follow-ups

- Deferred to [durable-conversation](durable-conversation.md) — absorb this plan as required deterministic frontend/browser CI evidence before combined #25/Slice 1 acceptance; full voice/provider/deployed acceptance is not discharged here.
- Issue [#23](https://github.com/justin212407/Conversations/issues/23) — real Vapi capability and voice history/resume/event acceptance remain separate under the free-account constraint.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — production deployment, public HTTPS and cutover evidence remain deferred.
