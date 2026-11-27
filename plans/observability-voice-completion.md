---
status: blocked
depends: [gemini-live, production-transport-validation]
awaits:
  - "GitHub #40: Gemini Live implementation must be merged and its acceptance verified before this draft may become ready for review or merge."
specs:
  - specs/behaviors/observability.md
  - specs/architecture.md
issues: [24]
---

# Plan: Complete Gemini voice observability and security evidence

## Scope

Track the remaining #24 work in a blocked draft after the merged foundations, frontend privacy and transport hardening. The voice infrastructure has changed from Vapi (also called WAPI/WAP in earlier notes) to Gemini Live under #40. Historical Vapi #23 and unmerged PR #35 are superseded; their callback and final-report contracts are not the Gemini design.

This draft currently contains planning only. Existing merged PRs #33, #37, #39 and #43 remain completed. Do not repeat their implementation or uncheck verified issue criteria.

## Implements

The observability specification's safe correlated diagnostics and security rules for the implemented Gemini voice path. Actual production HTTPS/WSS, proxy/private-network and secret-store evidence remains necessary for #24 closure and must be collected with deployment work under #26.

## Approach

1. Keep this PR draft and blocked while #40 is open or its implementation/acceptance is incomplete. Do not mark ready, enable auto-merge or merge before #40's implementation is on main and its required acceptance is verified. Completion of the provider probe alone does not clear this gate.
2. After the gate clears, bring this worktree up to date with main and audit the actual Gemini admission, provider connection, transcript ingestion, interruption, ending and recovery paths. Extend the existing allowlisted logs, trace stages and bounded metrics where coverage is missing; do not invent provider callbacks or log transcript/audio/credential/handle/URL/raw-error payloads.
3. Verify representative failure correlation, quota/provider failure, privacy and bounded resource cleanup against the implemented provider adapter. Instrumentation must not duplicate generation or alter durable conversation state.
4. Coordinate actual production transport, secrets and operational evidence with #26. A local configuration test does not establish deployed security. Keep all unmet issue acceptance unchecked until verified.
5. Record exact source, checks and independent review evidence; update the central ignored journal after each small change. Re-evaluate every original #24 criterion before issue closure and parent reconciliation.

## Validation

- [ ] #40 implementation is merged to main and its required acceptance is verified; the explicit draft/merge block can be removed.
- [ ] Actual Gemini voice paths have safe correlated diagnostics and bounded useful metrics without sensitive payloads.
- [ ] Representative failures, privacy, cleanup and instrumentation noninterference pass appropriate checks.
- [ ] Actual production HTTPS/WSS, proxy/private-network, secret handling and runbook evidence is recorded with #26.
- [ ] The exact completed feature passes review and required checks; #24 acceptance and epic tracking are reconciled without premature completion.

## Risks / unknowns

Gemini voice implementation and detailed event/finality contracts are not yet complete. Design diagnostics against that accepted implementation after #40, rather than the historical Vapi proposal. Removing this merge gate later does not waive production acceptance or the owner's review requirements. Hosted CI remains subject to the existing documented local-verification exception, never a fabricated hosted pass.

## Notes

The owner explicitly requested this separate blocked draft and worktree after PR #43. This is a new remaining-work plan; completed predecessor plans remain frozen. No runtime, dependency, environment, credential, provider-resource or conversation-flow change is made by opening it.

## Follow-ups

- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — coordinate production transport/security and final deployed operational evidence after feature readiness.
