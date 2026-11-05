---
status: in-progress
depends: [workspace, service-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/service-regression.md
  - specs/behaviors/dependency-security.md
issues: [25]
---

# Plan: Compatible dependency security fixes

## Scope

Implement the supported compatible direct/transitive portion of the whole-workspace high/critical remediation in #25. Keep the complete graph audited, preserve current/legacy behavior and leave schema/legacy-major compatibility work explicitly owned by [schema and legacy security](security-schema-legacy.md). Root accepts this plan/spec before any package edit; root reviews/merges this plan before the dependent migration starts.

This stage does not promise a green whole-workspace audit: Zod3 and old AI4/jsondiffpatch consumers remain known residuals until the next plan completes. Do not close #25, weaken scanning or label residual failures passed. Broader Sentry privacy work, browser CI wiring, voice and deployment remain outside this package-remediation scope.

## Implements

The [dependency security behavior](../specs/behaviors/dependency-security.md) for supported compatible updates, explicit residual ownership, shipped-artifact checks and truthful local/hosted/audit reporting.

## Approach

1. Preserve the fresh baseline:87high/10critical vulnerability counts,180advisory records,25affected package names and76unique high/critical advisory IDs. The older public summary retains only capped chains; inventory exact owners from lockfile/private uncapped evidence instead of treating898retained paths as exhaustive. Do not read root.env, harness/provider credentials or live services. Record the original offline widget/backend/type/build baseline before changes; never run the backend's remote `convex dev --until-success` build command.
2. Use these registry-verified direct targets on supported existing major lines: Next16.4.5 in both apps, matching Next lint plugin16.4.5, Sentry10.78.0 (not11), ESLint9.39.5 (not10), typescript-eslint family8.72.1, PostCSS8.5.32, @turbo/gen2.11.10 and shadcn4.23.0. Preserve Node22/pnpm10.4.1/TypeScript5.9.3 and current Clerk/React/service APIs unless an explicitly required peer patch is justified. shadcn4.23.0 requires Node>=20.18.1 and Next16.4.5 requires>=20.9; verification targets the pinned Node22, not every version permitted by the inherited root engines>=20 declaration. Do not update unrelated packages indiscriminately.
3. Resolve compatible high/critical transitives through supported parent/range updates, verifying selected releases exist: minimatch3.1.4/9.0.7; brace-expansion1.1.20/2.1.6/5.0.11; flatted3.4.2; handlebars4.7.10; lodash4.18.0; picomatch2.3.2/4.0.4; js-yaml4.3.2; hono4.12.25; fast-uri3.1.7; nanoid3.3.18; browserslist4.29.3; source-map-js1.2.2; proxy-addr2.0.8; body-parser2.4.0; MCP SDK1.32.2 where consumed on1.x; ws8.22.1 for affected8.x edges. Prefer valid declared ranges/parent releases. Recheck actual fresh advisories after resolution rather than assuming these floors cover later disclosures.
4. Treat sharp0.35.5, basic-ftp6.2.6, tmp0.2.6 and ip-address10.3.1 as compatibility-sensitive where parents require older0.x/major lines. Next16.4.5 and new tooling may provide supported paths. Never force those globally. If no supported edge exists, record the exact remaining parent/version/capability and let the dependent plan absorb it before this stage merges.
5. Inspect published @turbo/gen/shadcn artifacts, release metadata and actual CLI imports. @turbo/gen2.11.10 has a much smaller declared graph; shadcn4.23.0 uses Zod4/MCP-server2.x. Confirm vulnerable code is removed/patched rather than only bundled/hidden. Keep the existing CLI dependencies/features; use isolated fixture directories/private HOME and non-mutating help/import/smoke checks, never generator mutation against the real repo/global configuration.
6. Keep core/legacy Zod3 and AI/agent/provider major migration out of this stage. Do not force Zod4 into AI4 or override jsondiffpatch0.6 with0.7 without the next plan's compatibility proof. Confirm the post-change residual ledger is fully owned by that plan, including any incompatible transitive edge fromstep4/5; no unowned or newly introduced high/critical vulnerable package is accepted silently.
7. Verify frozen install, current service build/type/lint,85service/harness paths, process smoke and isolated container lifecycle. Verify web build/type/lint/12units+1real-controller integration and existing standalone browser fixture accurately; this does not claim a reusable browser CI runner is already present. Check sharedUI/widget type/build and legacy offline TypeScript against the original baseline, with no Convex codegen/dev/deploy or provider calls. Targeted smoke/regressions cover changed CLI/parser/runtime edges. Serialize heavy checks and coordinate root before Docker/browser work.
8. Publish one scoped implementation PR only after self-review/source freeze; root performs independent standards/spec review, fixes and a real merge. Maintain the central ignored local journal after each small change. Keep audit failures, inherited legacy failures, absent hosted CI and dependent work explicit; never merge this branch yourself.

## Validation

- [ ] Exact baseline/affected owners and original offline frontend/widget/backend gates are recorded without loading private configuration.
- [ ] Supported compatible direct/transitive targets are installed reproducibly, with coherent peers/engines and no unsupported blanket override or unrelated major migration.
- [ ] Shipped CLI artifacts and targeted runtime/parser/import checks establish actual remediation rather than an audit-path disappearance.
- [ ] Service/workspace/UI/widget checks pass or accurately preserve/report an explicitly identified pre-existing baseline; isolated smoke/container cleanup remains verified.
- [ ] A fresh full-graph audit reports actual reduced findings without scanner changes; every residual is explicitly assigned to security-schema-legacy, with no unreviewed newly introduced high/critical vulnerable package.
- [ ] Source is frozen/review-ready with actual local gate evidence and explicit downstream residual ownership; #25/final audit acceptance remain open, and dependent implementation is gated on the later actual root merge.

## Risks / unknowns

The fresh audit's findings can change with new disclosures. Some CLI releases bundle or substantially reshape dependency trees. Out-of-range major/transitive fixes may require additional compatibility proof; unsupported edges remain failing and transfer explicitly to the dependent plan rather than being forced. Existing legacy code may already fail offline type/build checks; establish that baseline without accessing its deployed backend. Host memory is constrained, so heavy gates run serially and never stop unrelated services.

## Notes

Proposal only on mergedmain2b98a26. Registry metadata confirms Next16.4.5/Sentry10.78.0 retain the current runtime/peer major families. Current raw audit has the same87high/10critical counts; its uncapped registry data and detailed ownership inventory remain local, with safe facts recorded here. No package or lockfile edit has occurred during proposal work.

### Published artifact evidence

Root independently inspected the selected public tarballs without installing/executing generators. shadcn4.23.0 contains21files/about58KB, no embedded node_modules, retains the `tailwind.css` export actually imported by sharedUI, and declares MCP/server^2.3.1, Zod^4.2.0, PostCSS^8.5.23 and browserslist^4.29.3. Keep this dependency/export. Its engine is Node>=20.18.1.

@turbo/gen2.11.10 contains13files/about929KB compressed and a roughly2.44MB bundled CLI. Handlebars/node-plop/minimatch/proxy-agent markers are present: compiled dependencies did not simply vanish. Published bundled inputs identify minimatch9.0.7, handlebars4.7.10, brace-expansion5.0.12, node-plop0.32.3 and proxy-agent8.0.2; runtime declarations contain @inquirer/prompts7.10.1/esbuild0.28.1. Verify the installed artifact/entrypoint and relevant fix evidence during implementation rather than relying only on registry dependency paths.

## Follow-ups

- Deferred to [schema and legacy security](security-schema-legacy.md) — patched Zod4/current parser migration, supported old AI/agent/provider family upgrade, jsondiffpatch removal/fix and any specifically recorded incompatible residual edge. That plan includes this acceptance below; complete high/critical audit success stays there.
- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — final whole-graph acceptance, additional browser CI integration and accurately reconciled hosted execution status.
- Issue [#24](https://github.com/justin212407/Conversations/issues/24) — separate optional frontend/voice telemetry privacy hardening; do not fold it into dependency updates.
