---
status: planned
depends: [workspace, workspace-browser-regression, gemini-live-probe]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
  - specs/api/conversations.md
  - specs/screens/workspace.md
issues: [40, 24, 25]
---

# Plan: Durable Gemini Live conversation adapter

## Scope

Deliver the original unfinished voice feature through the existing verified Free Tier Gemini Developer API project. Preserve personal account ownership, text behavior, PostgreSQL authority and untouched Convex data. This plan owns the target architecture gap; the provider probe is complete but product implementation has not started.

## Implements

Architecture response ownership, durable lifecycle/context, versioned owned APIs/events and workspace voice behavior. Before implementation, review detailed Gemini behavior/API/session/audio contracts against actual source and probe evidence. Vapi-specific draft contracts in closed PR #35 are historical, not a rename template.

## Approach

1. Specify the server-owned provider socket and authenticated bounded browser audio transport, operation/session admission, manual/automatic activity choice, app-assigned turn identities and fail-closed handling of late/unattributable input transcripts. State exactly which server-observed boundary permits completed persistence; leave interrupted/disconnected tails unresolved where evidence is insufficient.
2. Deepen the existing owned operation, history, transactional outbox and session fence instead of adding a second message-write protocol. Support full ordered completed context, repeated equal turns and one live operation across text/voice, with idempotent start/stop and bounded restart/recovery behavior.
3. Implement a backend-held fixed-origin Google adapter and resource owner. Keep credentials, handles and raw SDK errors private; never fall back to paid inference or activate billing. Bound setup, input/output queues, session duration, quota/failure handling and shutdown. The realtime service remains database-free; final writes remain API-owned.
4. Integrate explicit microphone permission, input PCM, output playback, provisional captions, honest listening/speaking/ending/interrupted states and cleanup in the existing workspace. Preserve draft/history access and text after denial/failure. Account/selection changes fence late work and immediately stop local audio.
5. Add deterministic provider/domain/API/realtime/browser coverage and allowlisted voice diagnostics alongside each stage. Verify repeated turns, input ordering, barge-in, disconnect/restart, lost acknowledgements, cross-account/cross-mode races, bounded queues, privacy and exact resource cleanup.
6. Absorb the completed probe plan’s product deferral: implement the reviewed activity/finality/transport contract, browser audio, PostgreSQL/outbox durability, voice diagnostics and regression coverage. Record separate real application microphone/audio and PostgreSQL reload/reopen/new-session context proof. Review and merge this feature before dependent #24/#25 final voice closeout. Keep production transport, cutover and deployment evidence in #26.

## Validation

- [ ] Detailed Gemini behavior/API/workspace contract reviewed before product code.
- [ ] Private provider/audio transport, owned admission and text/voice exclusion verified.
- [ ] Stable ordered completed history/outbox and honest interruption/disconnect semantics verified.
- [ ] Workspace microphone/audio/captions, denial/failure and cleanup verified.
- [ ] Deterministic integration/browser/privacy tests and voice diagnostics pass.
- [ ] Real application voice plus PostgreSQL reload/reopen/context smoke passes.
- [ ] All product deferrals from [gemini-live-probe](gemini-live-probe.md) are verified through the preceding contract, transport, history, workspace, diagnostics/regression and live-application criteria.
- [ ] Reviewed feature merged; #40 and dependent acceptance reconciled with local-only change records.

## Risks / unknowns

Observed quota is not a capacity guarantee. The provider exposes no stable transcript ID and did not emit finished flags in the probe; input transcription has no universal ordering against other events. A reconnect cannot recover an unreceived transcript from a Vapi-style terminal artifact. Full-context token limits and ambiguous tails need explicit visible failure/recovery rules. Microphone/playback and automatic VAD remain untested. Railway/deployment remains deferred; hosted CI uses the owner's existing reviewed-local-gate waiver, never a fabricated hosted pass.

## Notes

#40 preserves all unfinished voice acceptance from #23. The completed [probe plan](gemini-live-probe.md) and [evidence](../docs/gemini-live-probe.md) establish only provider feasibility. Existing text implementation and completed predecessor plans remain unchanged. Update the central ignored journal after each small change; never commit/copy it or private operator captures.

## Follow-ups

Final deployed security/observability, combined lifecycle and release/cutover evidence remain #24/#25/#26. Later product slices remain out of scope.
