---
status: done
depends: []
specs:
  - specs/architecture.md
  - specs/behaviors/service-foundation.md
issues: [16, 17]
pr: 27
---

# Plan: Service foundation

## Scope

Resolve the foundational Slice 1 choices and implement independently runnable API/worker/realtime services, safe configuration, dependency-aware health, graceful shutdown, local Compose, and documentation. Conversation features belong to the downstream conversation plan and GitHub issues #18–#26.

## Implements

- Architecture: personal workspace, service ownership, fresh PostgreSQL data with untouched Convex data.
- Service foundation: configuration, health, shutdown, minimal queue connectivity, and local orchestration.

## Approach

Keep GitHub #15 and its sub-issues as the user-facing task tracker. Add browser-safe shared contracts and a separate server runtime package. Implement the three service entrypoints, test their boundaries, then build and exercise the isolated Compose project. Record every small change in the ignored local journal.

## Validation

- [x] Scope and responsibilities are recorded consistently in source docs/specs.
- [x] Three services build, typecheck, and run independently.
- [x] Configuration and liveness/readiness behavior pass meaningful tests.
- [x] Graceful shutdown closes resources and exits.
- [x] Compose validates and starts PostgreSQL, Redis, API, worker, and realtime.
- [x] A queue probe verifies the actual worker boundary.
- [x] Startup, migration handoff, environment, and verification instructions are documented.
- [x] The local journal is ignored and remains absent from the Git index.

## Risks / unknowns

- The existing frontend/widget has legacy Convex and configuration dependencies; foundation must not claim those flows migrated.
- Cloud account, Clerk/Vapi credentials, and real voice evidence remain requirements for later issues.
- The provider-specific continuation mapping must be tested in #23 against real events.

## Notes

Work began on 2026-10-28 on slice-1/service-foundation. The user explicitly authorized fresh PostgreSQL data while preserving Convex data untouched.

Local verification completed: scoped build/typecheck/lint, nine runtime tests, real-dependency smoke (including queue round trip, outage behavior, SIGTERM cleanup), Compose image build/start, all three container readiness checks, and an in-container worker probe. Frozen offline installation also succeeded. Independent review identified and verified fixes for query-token leakage in default not-found logs and worker intake continuing during HTTP drain. PR #27 adds a GitHub Actions gate repeating the foundation checks before merge. Its hosted job currently cannot start because of an account-level Actions restriction; no CI test result is claimed. The legacy frontend profile and all conversation features remain outside the verified foundation.

## Follow-ups

Tracked by issues #18–#26 and the conversation plan.
