---
status: done
depends: [workspace, workspace-browser-regression]
specs:
  - specs/architecture.md
  - specs/behaviors/conversation-lifecycle.md
issues: [40]
pr: 41
---

# Plan: Verify zero-cost Gemini Live voice capability

## Scope

Execute the owner's authorized Gemini Live quota/authentication investigation and bounded real audio/transcript probe. This is operational capability evidence, not a delivered workspace voice feature. Preserve existing text behavior, personal account authorization, provider resources and Convex data. Do not activate billing, add a card, use paid models or fall back to paid inference.

## Implements

The architecture's private-credential/provider-adapter rules and the lifecycle's trusted transcript, interruption and persisted-context requirements are evaluated as candidate integration constraints. Existing Vapi-specific draft contracts are not silently treated as Gemini guarantees. A successful probe must be followed by a reviewed Gemini implementation contract and issue before product work.

## Approach

1. Check current official pricing, active quota, authentication, transcription, interruption and session documentation plus the pinned Google SDK. Keep documentation findings separate from observed account behavior.
2. Match or provision a dedicated key on a visibly Free Tier project without billing changes. Read the actual model quota. A metadata request, existing text generation or a public free-tier row alone cannot authorize inference.
3. Generate synthetic speech locally as mono PCM16LE/16kHz WAVs. Keep all raw captures, keys, handles and connection material in private operator storage outside Git. Never request the owner's microphone for this probe.
4. Gate the probe on recent project/key/quota evidence. Use backend-held credentials, the fixed Gemini Developer API origin and one selected free model, with no tools or automatic retries. Permit at most two sequential Live sockets and 135 seconds total; bound setup, utterance and shutdown waits.
5. Seed completed synthetic context, send actual paced PCM speech, retain received transcription events and decode provider PCM output. Exercise repeated equal utterances and a spoken interruption; record observed ordering/finality without inventing turn identifiers or heard-audio guarantees.
6. Persist unambiguous completed probe turns locally and seed a fresh connection from that record. Distinguish this provider-level persistence experiment from PostgreSQL/product recovery, which remains implementation work.
7. Review and document the actual result, including failed or partial capabilities. Create/reconcile the Gemini successor issue and retire Vapi tracking only with the original remaining scope preserved. Update the central ignored change journal after each completed stage.

## Validation

- [x] The existing local Google credential passes a read-only model-metadata request; no inference is claimed by that check.
- [x] Synthetic speech fixtures are generated locally in the required PCM format without microphone access or external speech-generation requests.
- [x] The exact probe key/project, Free Tier billing state and usable Live quota are verified before inference.
- [x] Bounded real voice input, provider transcription and decodable audio output are observed with retained private evidence.
- [x] Repeated utterances, interruption/finality ordering and fresh-session completed-context recall are evaluated; ambiguity stays explicit.
- [x] Probe-owned sockets/processes/resources close within their bounds, with no paid fallback or billing mutation.
- [x] Provider/issue decisions and remaining Slice 1 work are reconciled without claiming the application voice feature is complete; local-only change records are updated.

## Risks / unknowns

Project-specific quota, free-tier verification, SDK setup deadlines, independent transcript timing and interrupted output require observation. A valid key does not establish a free project. Temporary provider resumption is not application persistence. Prototype transcript records and browser captions do not prove the production API/database/account path.

## Notes

The owner explicitly authorized this investigation, authentication setup, a small voice/transcript probe and successor issue tracking on 2026-11-26. Existing Vapi usage is frozen at zero credits; no paid funding is authorized. Normal Brave account access is verified. The exact configured key matches the selected existing Free Tier project; its model table shows usable Gemini 3.8 Live quota, and billing reports no billing account. The actual two-connection probe passes in 34.358 seconds with both clean closes. See [safe observed evidence](../docs/gemini-live-probe.md). #40 carries all original unfinished voice scope from #23; the Vapi issue/proposal is retired as superseded, never completed. No product feature or deployed acceptance is claimed.

Both independent specification/claims and standards reviews clear functional documentation source `c383bfd`. Scoped formatting, changed diff, plan graph, local links and secret-value checks pass. PR #41 records this completed operational scope; no product/runtime acceptance is included. Hosted run 46005132149 did not start any job steps because the account is billing-locked; the existing reviewed-local-check waiver applies, not a hosted pass.

## Follow-ups

- Deferred to [gemini-live](gemini-live.md) — implement the reviewed activity/finality/transport contract, browser audio, PostgreSQL/outbox durability, diagnostics, regression coverage and real application voice/context proof under #40/#24/#25. The planned implementation record absorbs these requirements in this closeout commit.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — deferred production transport, cutover, deployment and release evidence after voice and dependent closeout.
