# Whole-workspace dependency security

## Scope and principles

The complete current and retained legacy dependency graph remains subject to the repository's high/critical audit gate. Include production, development, optional and transitive dependencies across services, the personal workspace, shared UI, widget and Convex packages. Preserve existing application contracts, retained functionality and stored data while removing known vulnerable resolutions. An inactive package is not excluded from the scan.

Prefer supported compatible releases and small reviewable changes. Do not delete dependencies/features, omit legacy importers, suppress advisories, change the severity threshold, hide registry errors or automatically apply audit fixes to obtain a passing result. No provider/cloud credential, paid feature, live migration or deployment is required for dependency remediation.

## Evidence and audit results

The existing free whole-workspace audit and its fail-closed classification remain unchanged: a valid report without high/critical findings can pass; high/critical findings and malformed/unavailable scans remain nonzero and distinguishable. Lower-severity findings remain visible. Record the exact lockfile, advisory/package/version information, affected owners and actual gate results used for a remediation decision.

Public summaries may cap paths or advisory output for privacy/size. Such caps do not establish an exhaustive graph inventory. When assigning work, supplement capped evidence with the actual lockfile graph or privately parsed uncapped scanner data, then publish only safe package/version/owner metadata. No root environment, provider key or raw registry/driver error is needed in a public report.

Remediation may land in explicitly owned stages. An intermediate stage can reduce findings without passing the full audit, provided every residual is named and owned by a committed downstream plan and its issue remains open. Do not turn that expected nonzero result into success or claim complete security/#25/Slice1 acceptance. Newly introduced high/critical vulnerable packages or incompatible resolutions block that stage; newly disclosed baseline issues must be distinguished from graph changes and explicitly reconciled.

## Resolution changes and compatibility

Update supported direct dependencies and compatible transitive ranges before considering overrides. Keep related peer families coherent and preserve the pinned Node/pnpm toolchain. Do not move to an unrelated major release merely because it is latest. Exact chosen releases and material lockfile changes are recorded in the implementation plan and review evidence.

An override outside a parent's declared range requires an exact scoped edge, upstream API/engine/export evidence, a compatibility rationale and meaningful runtime/type verification of that parent. Do not apply a blanket major override, silence peer conflicts or treat installation success as compatibility proof. If a compatible fix is unavailable within a bounded stage, retain the failing audit evidence and assign the edge to the downstream compatibility plan before merge.

Published packages that bundle dependencies require shipped-artifact review. A vulnerable path disappearing from an npm dependency graph does not establish that the code was removed or patched. Verify the relevant shipped code or an authoritative upstream remediation; a bundled vulnerable implementation remains residual security work even if the registry audit no longer sees it.

## Schema and retained legacy boundaries

The patched validation library must actually execute patched parsing code. Replacing a package version while importing its vulnerable legacy compatibility parser is not a fix. Preserve valid/invalid public payload behavior, strict unknown-field handling, cardinality/context bounds, UUID conventions, JSON/state serialization and safe error projections through any validator migration. Differences required by a deliberate security fix are specified and tested rather than silently inherited from a major release.

Old AI/agent/provider consumers move together only onto an upstream-supported peer family. Prove their exported API and serialized message/component compatibility, rather than forcing a new validator through unsupported old peers. Preserve existing stored component/message shapes and the current backend/widget response semantics. Retained Convex data is never imported, altered, deleted or migrated as part of dependency work.

Do not run Convex dev, code generation, component migration or deployment for validation. The legacy backend's existing build command performs remote work and is not an offline gate. Use local TypeScript/build analysis and synthetic representative data/provider fixtures; establish the original baseline first. A pre-existing failure stays visible and cannot justify a new regression or a claimed passing legacy gate. If compatibility requires stored-data changes or cannot be proven offline, stop that portion for explicit review and leave its residual findings open.

## Preserved validator and retained widget contracts

The validator upgrade preserves the existing application contract rather than importing stricter library defaults implicitly:

- Resource and request IDs accept the existing case-insensitive hexadecimal 8-4-4-4-12 spelling, including nil/max IDs and non-RFC version/variant combinations. API normalization to lowercase and browser/shared preservation of parsed string values remain unchanged.
- Existing shared integer fields preserve finite `Number.isInteger` acceptance, including representable integers outside the safe-integer interval, together with their current positive/nonnegative and explicit limit checks. This does not change the separate cursor/database checks or increase any configured bound.
- Existing UTC timestamp validators accept valid calendar dates with `HH:mmZ` or `HH:mm:ss[.fraction]Z`, preserving the previously accepted omitted-seconds form. Invalid dates, unsupported local/offset spellings and other previously rejected values remain rejected.
- Patched URL validation at environment boundaries trims surrounding whitespace and removes tab, LF and CR characters on successful parsing. Parsed URL strings need not remain byte-identical to supplied configuration. Representative ordinary, whitespace and control-character inputs must retain their interpreted protocol, host and credentials; existing endpoint, protocol, authentication and production-origin guards remain enforced. Do not restore an unsafe raw string or use the vulnerable parser to force output equality.
- Strict request/event/storage objects still reject unknown properties. Optional keys, omitted-key/default behavior, numeric coercion, record keys and safe error projection retain their current meaning. Configuration errors expose field names, never supplied values or raw provider errors.

Retained legacy agent records remain readable without rewriting stored data or changing component indexes. The public paginated message query keeps the existing MessageDoc/page/cursor interface; it is not replaced with a new SDK UI-message response. The retained widget preserves displayed text exactly, including concatenation without inserted spaces, message role/order, repeated-identical utterance identity, the existing final-message ID of a grouped assistant/tool turn, skipped rows without a message, and visible failed/empty/streaming behavior. An upstream UI helper's changed delimiter or grouping identity does not silently redefine that presentation contract.

The supported agent/provider upgrade retains the configured model, instructions, thread creation, greeting save, prior-context generation and list/pagination behavior. Historical tool/file/reasoning/usage fields remain stored and readable. Preserve this application's configured Google prompt/context semantics, including its prior omission of reasoning from subsequent prompts and its existing tool-response body behavior; do not claim universal lossless third-party SDK conversion, fabricate signatures or reconstruct metadata from visible text/IDs. An offline synthetic provider proves generation/result/stream interfaces without any model request. No proof from this stage claims a deployed component or changes actual Convex data.

### Bounded legacy pending recovery

Before the retained legacy action starts generation, it explicitly completes the existing pending-to-failed/Restarting recovery transition through supported component operations. Probe pending state with a one-row query and drain successive provider-library batches of at most 100 rows, with at most ten batches and a five-second recovery budget. Check the budget before and after awaited internal calls; await an in-flight call rather than race a background mutation. Generation starts only after a final probe confirms no pending rows and the recovery budget remains valid.

If work or deadline limits prevent recovery, return the safe legacy `RECOVERY_INCOMPLETE` error requiring an explicit new call. Do not start a model, automatically retry it, save the current prompt or resave historical messages. This guard sits before the legacy Agent's prompt-admission write; the existing preceding legacy authorization checks perform reads only. It does not change the primary PostgreSQL REST admission protocol. Completed recovery batches retain their normal pending-to-failed updates; every historical ID/content remains unchanged. A later explicit bounded call may finish the remaining recovery and then admit exactly one current prompt/assistant pair.

## Required verification and preserved behavior

Use a clean frozen install after lockfile changes, with the current Node 22/pnpm 10.4.1 toolchain and no application/provider environment loading. Run service build/typecheck/lint, the existing focused service/harness tests, process smoke and isolated actual-container regression appropriate to changes. All temporary databases/Redis/projects/ports/configuration remain run-owned; never use a shared live service or operator configuration to make these checks pass.

Verify personal workspace build/typecheck/lint, its existing unit/controller integration and reusable browser fixture where available, plus shared UI/widget type/build behavior and targeted CLI/import smoke for changed tooling. This does not claim browser CI coverage already exists or replace real Clerk/provider acceptance. Use synthetic fixtures instead of live cloud services. Record uncovered checks and inherited failures honestly.

Targeted security/compatibility checks must cover behavior that ordinary compilation misses: validator bound enforcement, legacy AI schema/message conversion, retained streaming/result interfaces, vulnerable parser/prototype-sensitive paths and changed CLI packaged entrypoints as applicable. Do not add tests that merely mirror version strings. Existing Sentry privacy hooks and disabled build wrapper/tunnel remain intact; broader telemetry privacy hardening is separate work.

No audit finding justifies weakening ownership, request idempotency, text/voice response ownership, worker fencing, socket recovery, diagnostics privacy or the application/provider boundaries. Hosted CI remains unavailable under the owner's explicit local-verification exception; report local and hosted results separately.

## Primary guidance

- [pnpm audit](https://pnpm.io/cli/audit) documents whole-graph auditing and failure thresholds.
- [pnpm overrides](https://pnpm.io/settings#overrides) documents targeted dependency-edge overrides; it does not prove API compatibility.
- [Zod advisory GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identifies affected versions below 4.6.6; [Zod 4 migration guidance](https://zod.dev/v4/changelog) documents validation API/semantic changes.
- [jsondiffpatch advisory GHSA-j4fx-xxwh-2485](https://github.com/advisories/GHSA-j4fx-xxwh-2485) identifies vulnerable patch APIs below 0.7.6.
- [Sentry advisory GHSA-mchm-gjx6-7h55](https://github.com/advisories/GHSA-mchm-gjx6-7h55) identifies the patched Next integration line. Package versions/peer/engine metadata come from the public npm registry; runtime compatibility still requires verification.
