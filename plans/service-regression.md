---
status: done
depends:
  [
    service-foundation,
    persistence-auth,
    conversation-api,
    text-generation,
    realtime,
    observability,
  ]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/behaviors/service-foundation.md
  - specs/behaviors/observability.md
  - specs/api/conversations.md
  - specs/behaviors/service-regression.md
issues: [25]
pr: 34
---

# Plan: Reproducible service and container regression gates

## Scope

Complete the independent service CI/regression foundation of #25 on merged main. Turn the verified external container lifecycle/diagnostics checks into portable repository-owned automation, using deterministic provider substitutes and synthetic signed identities. Add dependency scanning and clear gate documentation. Workspace/browser and voice acceptance remain dependent on #22/#23; hosted execution remains explicitly waived until Actions access returns, and production deployment remains #26.

## Implements

The architecture/lifecycle and #25 requirements for isolated integration tests, reliable CI gates, failure/recovery/ownership evidence and honest acceptance tracking. Add a bounded regression behavior specification before code and obtain root's review.

## Approach

1. Audit the existing services workflow, scripts and 70 service tests; identify concrete automation and coverage gaps. Specify desired credential-free local/CI behavior first.
2. Provide portable container lifecycle/diagnostic verification using existing APIs, migrations, worker/provider interfaces, recovery transport and optional collector profile. Use an explicit test-only provider fixture/entrypoint outside production selection; never introduce an auth bypass or a production fake-success flag.
3. Exercise create/submit/stream/persist/reopen/continue context, controlled failure/retry without duplicate input, account/subscription isolation and disconnect recovery across actual service containers. Verify safe cross-service diagnostics/metrics and retain meaningful existing focused tests rather than duplicating them indiscriminately.
4. Isolate every run's Compose project, volumes, queues, free loopback ports, signing fixture and scrape credentials. Never read root.env/provider keys or overwrite the operator's prepared scrape file. Cleanup on success/failure/signals must affect only the run's owned resources. Keep synthetic secrets and captures private and outside Git/images.
5. Wire documented build/type/lint/unit/integration/container gates into the existing workflow, with sensible serialization and time bounds. Add free dependency scanning, report actual findings/errors and retain unresolved advisories visibly; no blanket allowlist, paid feature, unrelated version churn or fabricated hosted pass.
6. Verify automation locally from the repository entrypoint, including failure cleanup and dependency-scan behavior. Coordinate Docker/heavy checks with root and use reviewed mutation plans. Public CI configuration must require no live Clerk/Google/Vapi/Railway credentials.
7. Publish a scoped PR after frozen install/gates/self-review. Root performs independent review/fixes/merge. Keep #25 open for actual workspace/browser/voice acceptance and report hosted-CI waiver separately from local evidence.

## Validation

- [x] Repository-owned CI/local commands cover build/type/lint/focused tests, isolated migrations/integration and portable container regression without real service credentials.
- [x] Deterministic provider fixtures prove persisted success/context continuation, failure/retry/idempotency and socket recovery across service containers without production bypasses.
- [x] Ownership/authentication/diagnostic privacy and bounded metrics remain enforced through real signed verification and existing public contracts.
- [x] Run-specific ports/projects/volumes/credentials/scrape files are isolated; successful and interrupted/failed cleanup preserve unrelated state and expose no secret artifacts.
- [x] Dependency scanning and required-gate documentation exist, with unresolved findings and unavailable hosted execution reported honestly.
- [x] Focused automation tests and actual local run pass under the hosted-CI exception; no new unscoped dependency resolution changes occur.
- [ ] Dependent real workspace/browser and voice E2E are integrated after their features merge, with live provider/deployment evidence retained in #23/#26.

## Risks / unknowns

The host has significant memory/I/O pressure. Keep heavy checks serial and never stop unrelated services. PR32 is unmerged only because its real Clerk instance still requires organization selection; do not touch that worktree or add an auth bypass. No hosted CI access, Railway signup, Vapi upgrade or owner browser session is needed for this independent foundation. Audit findings may require later frontend dependency work after #22 merges; do not silently suppress them.

## Notes

Implemented in [PR #34](https://github.com/justin212407/Conversations/pull/34), source frozen at `3b86fe5` on merged diagnostics base `b89756d`. The accepted specification is `79728df`; production API/provider/domain behavior and dependency resolutions are unchanged. The private deterministic fixture is mounted only by the credential-free verifier, not selected by production configuration.

Local evidence: frozen installation, service build/typecheck/lint, harness lint, 70 service tests plus 13 harness tests, process smoke and changed-file formatting passed. Focused integrations used fresh isolated PostgreSQL/Redis ports and storage and verified cleanup. The final actual container run passed exact context after restart, failure/retry, ownership, socket recovery, eight causal trace stages, three healthy scrape targets, per-operation SQL identities, privacy through collector outage/shutdown and graceful exits.

Normal, injected assertion, SIGTERM, SIGINT and startup-deadline runs returned expected exits with verified owned cleanup. Unrelated sentinel network/volume identities and synthetic environment/operator-config hashes remained unchanged. The external sentinel driver needed a file-versus-directory housekeeping correction after those checks; its exact synthetic leftovers were then removed, and no regression runtime resources remain.

Self-review corrected premature asynchronous trace completeness, SQL accidentally counting completed user events, socket/output privacy capture and real pnpm versioned/workspace-link report formats. A guard around dynamic lifecycle loading keeps missing-build failures sanitized. Docker/Compose commands resolve and pin a verified local target with inherited overrides removed; loopback TCP requires Docker Desktop identity.

Actual whole-workspace audit remains **failing**: 87 high and 10 critical vulnerability counts, with 180 advisory records overall (plus 17 low/81 moderate counts). The bounded sanitized report preserves 898 high/critical importer/dependency chains, with no unknown chains in that observed scan. No suppression, automatic fix, paid scan or unrelated version change was used. Adding the audit gate is complete; remediation is not.

The last validation box is intentionally unchecked: real Clerk workspace/browser and Vapi voice E2E require #22/#23 to merge and remain owned by #25. Hosted Actions execution is unavailable under the owner's explicit local-verification exception and is not reported as passed. Production HTTPS, actual deployed diagnostics and durable voice/text verification remain #26. This plan closes only the independent service regression foundation, not the complete Slice 1 issue.

## Follow-ups

- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — remediate actual dependency findings, integrate real workspace/browser/voice acceptance as features merge, and reconcile hosted execution status when access returns.
- Issue [#22](https://github.com/justin212407/Conversations/issues/22) — complete actual personal Clerk sign-in/workspace acceptance; mandatory organization selection currently blocks that evidence.
- Issue [#23](https://github.com/justin212407/Conversations/issues/23) — implement and verify provider-event translation, free-plan Vapi lifecycle and live voice smoke after #22 merges.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — provision/deploy when Railway access is available and verify deployed durable voice/text flow, HTTPS and diagnostics.
