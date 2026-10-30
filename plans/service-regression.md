---
status: in-progress
depends: [service-foundation, persistence-auth, conversation-api, text-generation, realtime, observability]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/behaviors/service-foundation.md
  - specs/behaviors/observability.md
  - specs/api/conversations.md
issues: [25]
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

- [ ] Repository-owned CI/local commands cover build/type/lint/focused tests, isolated migrations/integration and portable container regression without real service credentials.
- [ ] Deterministic provider fixtures prove persisted success/context continuation, failure/retry/idempotency and socket recovery across service containers without production bypasses.
- [ ] Ownership/authentication/diagnostic privacy and bounded metrics remain enforced through real signed verification and existing public contracts.
- [ ] Run-specific ports/projects/volumes/credentials/scrape files are isolated; successful and interrupted/failed cleanup preserve unrelated state and expose no secret artifacts.
- [ ] Dependency scanning and required-gate documentation exist, with unresolved findings and unavailable hosted execution reported honestly.
- [ ] Focused automation tests and actual local run pass under the hosted-CI exception; no new unscoped dependency resolution changes occur.
- [ ] Dependent real workspace/browser and voice E2E are integrated after their features merge, with live provider/deployment evidence retained in #23/#26.

## Risks / unknowns

The host has significant memory/I/O pressure. Keep heavy checks serial and never stop unrelated services. PR32 is unmerged only because its real Clerk instance still requires organization selection; do not touch that worktree or add an auth bypass. No hosted CI access, Railway signup, Vapi upgrade or owner browser session is needed for this independent foundation. Audit findings may require later frontend dependency work after #22 merges; do not silently suppress them.

## Notes

Base b89756d includes the reviewed diagnostics foundation and representative actual-container proof. Its one-off external verifier is evidence, not a committed repeatable gate; this plan closes that automation gap with deterministic substitutes. Existing public APIs/domain/provider boundaries must remain compatible. User explicitly permits independent nonconflicting worktree work while requiring dependent features to await merge.

## Follow-ups

#22 supplies the real personal workspace/browser flow; #23 supplies provider-event/voice/live-smoke acceptance. #26 retains production cutover/deployment. #25 remains open until those requirements and hosted execution status are accurately reconciled.
