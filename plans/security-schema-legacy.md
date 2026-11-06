---
status: planned
depends: [security-dependencies]
specs:
  - specs/architecture.md
  - specs/behaviors/service-regression.md
  - specs/behaviors/dependency-security.md
issues: [25]
---

# Plan: Patched schema and legacy AI compatibility

## Scope

After the compatible dependency stage actually merges, eliminate its named remaining high/critical validation/legacy/transitive findings through supported parser and AI/agent/provider compatibility changes. Preserve current REST/socket/job/storage behavior and retained widget/backend component/message semantics. No Convex data/schema migration, code generation, dev command, deployment or paid/provider call is authorized.

This plan absorbs [compatible security fixes](security-dependencies.md): Zod 3, AI 4/jsondiffpatch and specifically documented unresolved compatibility-sensitive edges remain actual failing audit work here. Do not start before the prerequisite merge or claim the preceding audit became green.

## Implements

The patched validation/legacy compatibility and complete audit acceptance of [dependency security behavior](../specs/behaviors/dependency-security.md).

## Approach

1. Rebase the prepared worktree on the prerequisite's merged main and read its exact residual ledger/lockfile, offline failure baseline, shipped-artifact evidence and current advisory metadata. Preserve the actual baseline compiler split: root/services TypeScript 5.9.3 and backend/math TypeScript 6.0.3; do not refresh the legacy `latest` declarations implicitly. Confirm complete ownership of remaining findings before edits. If compatibility scope is materially larger than this bounded migration, partition/amend plans before implementation rather than silently expanding.
2. Target Zod 4.6.7 (first patched4.6.6) on all applicable current/legacy consumers. Current upstream3.x ends at3.25.76; the security fix touchesv4 core, so do not import embedded zod/v3 to evade the scan. Review UUID/number/integer/record/default/error changes and preserve the application's explicit version1 validation contracts, bounded contexts and safe errors through application-owned compatibility predicates where needed. Add meaningful oversized constrained-collection and valid/invalid contract regressions; version assertions alone are insufficient.
3. Use the smallest registry-confirmed supported peer family as the initial target, not the newest major: @convex-dev/agent 0.2.12 with ai5.0.285, @ai-sdk/provider-utils3.0.44, @ai-sdk/google2.0.108 and @ai-sdk/openai2.0.140, with patched Zod 4.6.7. Agent 0.1.18 still requires AI 4 and its validator3 peers. Confirm current primary release/migration/support guidance and actual imports before final resolution; a maintained compatible patch within the chosen family is acceptable with recorded rationale. Avoid AI 7/agent0.7 merely because they are latest.
4. Read backendAGENTS and generated Convex guidelines. Compare published agent component schemas and representative serialized messages/results across current0.1.16 and the selected family. Verify createThread/saveMessage/list/stream APIs, Google model configuration and widget useThreadMessages/toUIMessages behavior with offline fixtures/type/build analysis. Preserve table/field/ID/message response meanings and existing stored component data. Do not run remote backendbuild/codegen/deploy or auto-migrate data. If the selected family requires stored-data/schema changes or compatibility cannot be proved offline, leave this part blocked/failing for explicit review rather than inventing a migration.
5. Upgrading the supported AI family may remove jsondiffpatch0.6 legitimately; verify its consumer path and shipped behavior. If another parent retains it, use a scoped patched0.7.7 edge only with API/export/engine and patch/unpatch/message-diff compatibility/security proof. Fix any specifically transferred sharp/basic-ftp/tmp/ip-address/tooling-bundle edge from the prerequisite through supported parents or exact reviewed compatibility tests, never a blanket override or deletion/exclusion.
6. Retain old Convex/widget source/features/data and all audited importers. Preserve current Clerk/personal workspace and core worker/provider separation; do not fix security by removing legacy dependencies or weakening parsers. Any minimal source adaptation is justified by the supported dependency API and tested against the baseline, not an unrelated refactor.
7. Run frozen installation, the current service/workspace/unit/integration/process/container/browser/UI/widget gates appropriate to affected consumers, plus offline legacy compiler/bundle/data-shape and AI/schema/provider-conversion fixtures. Use no root.env/live services; providers are deterministic test substitutes. Document inherited offline failures and reject new regressions. Serialize heavy checks and verify owned resource cleanup.
8. Require a valid fresh full-workspace audit with zero high/critical findings and verified shipped-artifact remediation before complete dependency-security acceptance. Registry failure is nonzero, not a waiver. If any residual cannot be safely removed, keep #25/this criterion open with exact owner/evidence. Freeze/publish one scoped PR; root independently reviews/fixes/merges, never this agent. Maintain the central ignored journal throughout.

## Validation

- [ ] Every residual from security-dependencies is absorbed explicitly and all affected owners remain in the audit graph.
- [ ] Patched Zod 4 executes patched parsing; current public valid/invalid payload semantics and bounded resource handling pass meaningful regressions without vulnerablev3 fallback.
- [ ] Supported AI/agent/provider peers pass offline API/type/runtime and serialized component/message compatibility checks; retained data/schema/source behavior is preserved without Convex remote work.
- [ ] jsondiffpatch and transferred compatibility-sensitive edges are genuinely fixed/removed by supported consumers or proven scoped overrides, including shipped artifacts.
- [ ] Full affected service/frontend/widget/UI/legacy gates have actual evidence, inherited limitations stay visible and no new regressions or live/provider/config/data mutation is introduced.
- [ ] A fresh valid complete-workspace audit has zero high/critical findings without ignores/exclusions/scanner weakening; otherwise final acceptance and #25 remain open.

## Risks / unknowns

Registry peers establish a candidate family, not component data compatibility. Agent 0.2 / AI 5 changes may require API adaptation and could expose pre-existing legacy defects. The current source must be statically inventoried before modifying it; actual stored data must not be touched. Zod 4 defaults/coercion/UUID/integer/error semantics can change public validation even when compilation passes. Some transitive compatibility fixes may lack supported parent releases; stop and review a genuine blocker rather than force an unsupported major or fabricate a green audit.

## Notes

Planned companion authored before implementation, as requested. It is deliberately downstream of the compatible stage's merge. Candidate version evidence comes from primary npm registry metadata and the relevant Zod/jsondiffpatch advisories; final selected resolutions and compatibility results must be recorded during implementation.

## Follow-ups

- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — final complete lifecycle/browser/voice acceptance and unavailable hosted execution remain distinct from dependency audit success.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — production deployment evidence remains deferred; no offline dependency result claims a deployed migration or voice capability.
