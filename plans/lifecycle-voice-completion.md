---
status: blocked
depends: [gemini-live, lifecycle-evidence-reconciliation]
awaits:
  - "GitHub #40: Gemini Live implementation must be merged and its acceptance verified before this draft may become ready for review or merge."
specs:
  - specs/behaviors/service-regression.md
  - specs/behaviors/conversation-lifecycle.md
issues: [25]
---

# Plan: Verify the complete Gemini voice and text lifecycle

## Scope

Track #25's remaining Gemini provider-event, voice failure/recovery and combined lifecycle acceptance in a separate blocked draft. The voice infrastructure changed from Vapi (WAPI/WAP in earlier notes) to Gemini Live under #40. Superseded Vapi #23/PR #35 are historical; no callback/snapshot/final-report guarantee is inherited.

This draft contains planning only. Keep the merged text/browser/service verification and PR #42's evidence reconciliation intact, including the checked standalone text E2E criterion. Do not present historical verification as a new runtime execution.

## Implements

The service-regression and conversation-lifecycle specifications' owned, ordered, durable voice/text behavior and honest automated-versus-live evidence boundaries. Preserve the [existing evidence matrix](../docs/lifecycle-evidence.md), including synthetic signed-session automation versus separately recorded actual Clerk acceptance.

## Approach

1. Keep the PR draft and blocked until #40's implementation is merged to main and its required acceptance is verified. Do not mark ready, enable auto-merge or merge earlier. The completed provider-only probe is not this prerequisite's application acceptance.
2. After #40, update this worktree from main and audit the real implementation/tests before adding coverage. Complete remaining domain/provider-event translation, transcript identity/deduplication, ownership, cross-mode races and stable outbox/history checks where missing.
3. Verify voice-specific expired/unauthorized/cross-account access, quota/provider failure, repeated turns, interruption, late events, disconnect/restart and contextual recovery. Reuse the existing deterministic service/browser boundaries without production authentication bypasses.
4. Record separate actual application microphone/audio, PostgreSQL durable transcripts, reload/reopen/new-session context and text-after-denial/failure evidence. Neither synthetic fixtures nor the private provider probe substitute for these checks.
5. Reconcile the full voice/text lifecycle, current source/checks and actual hosted-CI state. Coordinate final deployment/release evidence with #26; keep unavailable checks explicit. Independent review and the central ignored journal remain required before issue/parent completion.

## Validation

- [ ] #40 implementation is merged to main and its required acceptance is verified; the explicit draft/merge block can be removed.
- [ ] Remaining Gemini provider-event, ownership, transition and stable transcript deduplication criteria are verified against actual implementation.
- [ ] Voice failure, access, interruption, late delivery, restart and contextual recovery coverage passes.
- [ ] Separate real application microphone/audio and PostgreSQL reload/reopen/context smoke is recorded.
- [ ] Complete voice/text evidence, review and hosted execution status support the original #25 acceptance; unmet deployed requirements remain visible under #26.

## Risks / unknowns

Native input transcription ordering and finality require #40's accepted contract; fixtures cannot manufacture provider guarantees. The layered deterministic text sign-in boundary does not automate Clerk-hosted login UI. No missing credential or quota authorizes a paid fallback or auth bypass. Hosted execution remains billing-blocked under the existing local-check waiver, not passed.

## Notes

The owner explicitly requested this blocked successor draft/worktree after PR #42. All completed predecessor plans and already verified text acceptance remain unchanged. No product code, tests, dependencies, environment or provider/account configuration are changed by this planning draft.

## Follow-ups

- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — final deployed combined-flow, cutover and release evidence after feature verification.
