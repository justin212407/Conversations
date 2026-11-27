# Gemini Live free-tier capability evidence

Observed 2026-11-27 on the owner's existing account. This is a completed provider probe, not a shipped application voice feature. Implementation is tracked in [#40](https://github.com/justin212407/Conversations/issues/40), replacing the unfunded Vapi path in [#23](https://github.com/justin212407/Conversations/issues/23).

## Quota and authentication

Official [pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-live) lists free audio input/output for Gemini 3.8 Live on Free Tier. [Limits](https://aistudio.google.com/docs/rate-limits) are per project/model and can change; daily request limits reset at midnight Pacific. Free content may be used to improve Google products. This is an eligible service tier rather than replenishable Vapi trial credit.

Read-only model metadata returned HTTP 200. Separately, signed-in normal Brave key details exactly matched the configured local key. Its key-table row and the selected exact project showed Free Tier. The expanded model table showed:

| Model           | RPM usage / limit | TPM usage / limit | RPD usage / limit |
| --------------- | ----------------- | ----------------- | ----------------- |
| Gemini 3.8 Live | 0 / Unlimited     | 0 / 65K           | 0 / Unlimited     |

These are the observed table labels, not a universal quota or guaranteed unlimited capacity. The billing page reported no billing account. No account/key creation, `.env` edit, card, prepayment, billing activation, fallback or paid resource was needed. Quota exhaustion must produce a visible failure rather than an upgrade. Free-tier verification, if later requested, is a separate [phone/project verification](https://aistudio.google.com/docs/verification) step, not permission to enable billing.

## Actual audio test

The private operator probe used installed `@google/genai` 2.32.0, backend-held credentials, the fixed Gemini Developer API origin, `vertexai: false`, model `gemini-3.8-live`, AUDIO responses and both transcription options. It configured no tools, retries or fallback. A recent exact-key/free-project/quota gate and offline PCM validation preceded network use. Manual activity start/end with automatic VAD disabled made the controlled interruption boundary observable.

Locally synthesized speech was paced as header-free PCM16LE, 16kHz mono. The complete run used two sequential connections in **34.358 seconds**, below its 135-second hard deadline. It sent **499,274 input PCM bytes** and received **512,650 output PCM bytes**. Five received WAVs independently passed 24kHz, mono, 16-bit header/data-length checks. Both connections emitted close code 1000. The run used zero owner microphone access, retries or billing changes.

| Scenario                            | Actual observation                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoken context question             | Input was transcribed; output transcription and PCM recalled the synthetic code supplied in the initial completed context.                                                                                       |
| Same spoken request twice           | Both separate inputs and both audio/transcript replies were observed. Separate probe UUIDs and both repeated user/model entries were retained; equal content did not collapse them.                              |
| Spoken interruption                 | Manual activity start occurred during received counting audio, before generation completion. The provider emitted `interrupted`, then `turnComplete`; it subsequently transcribed and answered the stop request. |
| Fresh connection from saved context | An eight-entry local completed history record seeded connection two. Its spoken follow-up recalled both the initial code and the later repeated word. The interrupted exchange was excluded.                     |
| Cleanup                             | Two connections opened sequentially and both closed cleanly. No owned live call, listener or probe process was retained.                                                                                         |

Private operator artifacts include the exact gated script, locally synthesized fixtures, raw wire events, returned audio and offline verification. They remain in a restricted local cache outside Git. Keys, project identifiers, handles and raw errors are not part of this report. No audio is committed or uploaded.

## Contract findings and limits

No stable transcript IDs or transcription `finished` flags appeared. Ordinary responses emitted output transcription before `generationComplete`, then `turnComplete`. The interrupted response emitted `interrupted` and `turnComplete` without generation completion. This supports an application-owned ordinal/activity mapping for further design; it does not establish a general recoverable cumulative-history protocol. The wire [reference](https://aistudio.google.com/api-reference/live#BidiGenerateContentServerContent) leaves input-transcription ordering independent, so a few observed timely inputs are not a guarantee that every future input arrives before the response boundary.

The private interruption phase aggregates the cut response and following exchange only for observation. It does not assert a completed interrupted transcript, exact word alignment, or what a listener heard. The future adapter must retain honest interrupted/unresolved tails and clear queued playback. Process every message field independently, since PCM and transcript fields may coexist.

A provider resumption handle was observed but not used. The fresh-session test seeded a local JSON record, not PostgreSQL. It demonstrates provider acceptance/recall of ordered prior turns, not durable application persistence or temporary-handle recovery. Actual browser microphone/speaker behavior, automatic VAD, account/session fencing, transactional writes/outbox, reload/reopen recovery, voice diagnostics, deterministic integration and deployed voice acceptance remain #40/#24/#25/#26.

Vapi's callbacks, cumulative snapshots, seed marker and final reports are not Gemini contracts. Historical draft PR #35 must remain unmerged. The [source audit](gemini-live-contract-audit.md), [alternative research](free-voice-options.md) and [implementation plan](../plans/gemini-live.md) preserve the remaining work. Existing personal Clerk sign-in, durable text workspace and Convex data are unchanged.
