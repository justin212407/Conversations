---
status: done
depends: [workspace, service-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/service-regression.md
  - specs/behaviors/dependency-security.md
issues: [25]
pr: 36
---

# Plan: Compatible dependency security fixes

## Scope

Implement the supported compatible direct/transitive portion of the whole-workspace high/critical remediation in #25. Keep the complete graph audited, preserve current/legacy behavior and leave schema/legacy-major compatibility work explicitly owned by [schema and legacy security](security-schema-legacy.md). Root accepts this plan/spec before any package edit; root reviews/merges this plan before the dependent migration starts.

This stage does not promise a green whole-workspace audit: Zod 3 and old AI 4/jsondiffpatch consumers remain known residuals until the next plan completes. Do not close #25, weaken scanning or label residual failures passed. Broader Sentry privacy work, browser CI wiring, voice and deployment remain outside this package-remediation scope.

## Implements

The [dependency security behavior](../specs/behaviors/dependency-security.md) for supported compatible updates, explicit residual ownership, shipped-artifact checks and truthful local/hosted/audit reporting.

## Approach

1. Preserve the original complete-graph audit and offline baseline: 87 high / 10 critical findings, 180 advisory records, 25 affected package names and 76 unique high/critical advisory IDs. Supplement capped public scanner paths with exact lockfile owner/node reachability. Never read private application/provider configuration or use live services for these gates. The backend's remote build command is not an offline check.
2. Use supported direct targets: Next 16.4.5 in both apps and matching lint plugin, Sentry 10.78.0, ESLint 9.39.5, typescript-eslint family 8.72.1, PostCSS 8.5.32, @turbo/gen 2.11.10 and shadcn 4.23.0. Preserve Node 22 / pnpm 10.4.1, root/service TypeScript 5.9.3 and already-resolved backend/math TypeScript 6.0.3. Next requires Node >=20.9.0 and shadcn >=20.18.1; verify the pinned Node 22 rather than every inherited root Node >=20 version.
3. Resolve remaining compatible vulnerable transitives through supported parents and bounded selectors. Convex 1.42.0 is the first compatible parent pinning patched ws 8.21.0. Record all 11 override selectors and 27 original parent-range checks in the [exact evidence ledger](../docs/dependency-security-stage-1.md). Do not force unsupported major or 0.x edges, refresh unrelated direct versions, suppress peers or weaken scanning.
4. Own previously implicit compatible peers explicitly: backend Zod 3.25.76 preserves AI 4 behavior; worker MCP SDK 1.32.2 and backend/widget Hono 4.12.25 retain existing optional capabilities. Webpack 5.112.0 satisfies the changed workspace build-tool peer. Verify imports and behavior rather than obtaining security reduction from disappearing optional peers. Legacy AI/provider trees retain supported Zod 3 until the next plan.
5. Inspect shipped shadcn and @turbo/gen artifacts, patched bundled inputs and actual installed CLI entrypoints. Retain consumed CSS exports and generator capability. Use isolated HOME/non-mutating help and runtime/parser checks; never mutate the real project through a generator. Next's supported sharp ^0.35.5 parent avoids an unsupported cross-0.x override.
6. Keep Zod 4 and the legacy AI/agent/provider migration outside this stage. The exact remaining Zod 3.25.76 and jsondiffpatch 0.6.0 advisories and affected importers belong to [schema and legacy security](security-schema-legacy.md). Audit failures remain nonzero, with no new high/critical advisories or unowned residuals accepted.
7. Verify frozen install, service build/type/lint, 70 service tests, existing 15 harness tests plus six security behavior regressions, process smoke and the actual isolated container lifecycle. Verify workspace build/type/lint, 12 units, one actual controller integration and the existing standalone browser fixture. Compare shared UI/widget inherited failures and backend/math offline compilers against the original baseline. No Convex dev/codegen/deploy, provider call or private configuration is used; serialize owned heavy resources and verify cleanup.
8. Freeze source for independent standards/spec review, publish one scoped PR and close out only actual evidence. Root performs the later merge; the dependent migration starts only after that real merge. Preserve local-only change records centrally and keep hosted CI, final audit/#25, voice and production deployment acceptance distinct.

## Validation

- [x] Exact baseline/affected owners and original offline frontend/widget/backend gates are recorded without loading private configuration.
- [x] Supported compatible direct/transitive targets are installed reproducibly, with coherent peers/engines and no unsupported blanket override or unrelated major migration.
- [x] Shipped CLI artifacts and targeted runtime/parser/import checks establish actual remediation rather than an audit-path disappearance.
- [x] Service/workspace/UI/widget checks pass or accurately preserve/report an explicitly identified pre-existing baseline; isolated smoke/container cleanup remains verified.
- [x] A fresh full-graph audit reports actual reduced findings without scanner changes; every residual is explicitly assigned to security-schema-legacy, with no unreviewed newly introduced high/critical vulnerable package.
- [x] Source is frozen/review-ready with actual local gate evidence and explicit downstream residual ownership; #25/final audit acceptance remain open, and dependent implementation is gated on the later actual root merge.

## Risks / unknowns

The fresh audit's findings can change with new disclosures. Some CLI releases bundle or substantially reshape dependency trees. Out-of-range major/transitive fixes may require additional compatibility proof; unsupported edges remain failing and transfer explicitly to the dependent plan rather than being forced. Existing legacy code may already fail offline type/build checks; establish that baseline without accessing its deployed backend. Host memory is constrained, so heavy gates run serially and never stop unrelated services.

## Notes

[PR #36](https://github.com/justin212407/Conversations/pull/36) carries the completed compatible stage. Reviewed source is 14fbba1, including root's bounded MCP test requests, Markdown range rendering and Next-generated root parameter type directive; dependency freeze 457ae31 has identical package/lockfile/product behavior. Both independent standards/spec reviews are clear. The dependent plan begins only after root confirms the actual merge.

The full unchanged scanner reduced 87 high / 10 critical findings to **2 high / 0 critical**, with **27 moderate / 7 low** still visible and no new high/critical advisory IDs. This remains a failing audit, explicitly owned by the next plan. The [evidence ledger](../docs/dependency-security-stage-1.md) records exact supported direct versions, all 11 override selectors, 27 original parent ranges, shipped tool inputs, preserved schema/optional peers and every remaining affected importer. No compatibility-sensitive transitive edge outside those two named findings is deferred.

Frozen install, service build/typecheck/lint, strict harness lint and 104 automated checks pass: 70 service, 21 harness (15 existing plus six security behavior checks), 12 workspace units and one actual controller integration. Process smoke passes on fresh owned PostgreSQL/Redis with verified container/network/volume cleanup. The actual isolated container gate passes ownership/replay/restart/context/failure/retry/socket/diagnostics/collector-outage/graceful-exit checks and cleanup. The existing standalone desktop/mobile browser fixture passes eight interaction checks with zero page errors, external requests, microphone requests or horizontal overflow; browser/server cleanup is verified. Its existing external Playwright installation is manual proof, not a new repository dependency or reusable CI runner.

Workspace production build/typecheck/lint, retained backend offline TypeScript, math build and installed CLI help entrypoints pass. Builds use synthetic public config and an unusable loopback API URL; CLI probes isolate HOME. Root separately verified an actual Clerk personal session on 14fbba1: authenticated account lookup, all eight original message identities, reload and list/reopen pass, without product mutation, generation or microphone access; owned preview/browser cleanup is verified. Web typecheck passes with the generated type directive. Hosted execution remains explicitly waived and unexecuted.

The original compiler split remains Node 22.18.0 / pnpm 10.4.1, root/services TypeScript 5.9.3 and retained backend/math 6.0.3. Original shared UI typecheck already fails 23 missing optional dependency/inference diagnostics; post-change typecheck diagnostics match exactly. Original widget typecheck/build already fail TS2367 at widget-footer.tsx line 27, column 35 (selection/inbox comparison). Widget typecheck matches exactly; Next changed build diagnostic formatting, while the failure location/message are unchanged. These remain failing inherited gates. No legacy source/features, deployed Convex data, provider resources or private operator configuration were changed.

The browser fixture initially hit a local Brave Unix-socket path limit under a long private temporary directory. Private terminal failure details and cleanup were preserved; shortening only the owned temporary directory allowed the unchanged fixture to pass. No browser timeout was reclassified as success.

## Follow-ups

- Deferred to [schema and legacy security](security-schema-legacy.md) — patched Zod 4/current parser migration, supported old AI/agent/provider family upgrade, jsondiffpatch removal/fix and any specifically recorded incompatible residual edge. That plan includes this acceptance below; complete high/critical audit success stays there.
- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — final whole-graph acceptance, additional browser CI integration and accurately reconciled hosted execution status.
- Issue [#24](https://github.com/justin212407/Conversations/issues/24) — separate optional frontend/voice telemetry privacy hardening; do not fold it into dependency updates.
