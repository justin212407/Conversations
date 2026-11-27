# Gemini Live contract audit

Source research checked 2026-11-26, with operational evidence added 2026-11-27. The source-only investigation did not access account credentials or inference. The subsequent authorized [real probe](gemini-live-probe.md) establishes the observed capability separately; no application adapter has shipped.

## Zero-cost eligibility and authentication

Current [pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-live) explicitly makes input/output free on the Free Tier for `gemini-3.8-live`, `gemini-3.8-live-extended-thinking`, and `gemini-3.1-flash-live-preview`. It separately lists `gemini-2.5-flash-native-audio-preview-12-2025` as free-tier eligible. Paid-tier prices still apply to paid projects; these are not unlimited free models. Search has separate pricing, so omit all tools. Free-tier content may improve Google products. This proposal selects only `gemini-3.8-live`, with no fallback.

[Rate limits](https://aistudio.google.com/docs/rate-limits) are project-scoped, model-specific, account-dependent, and not guaranteed. Current public documentation directs developers to AI Studio for active limits rather than promising a universal Live session/day allowance. RPD resets at midnight Pacific. Record the selected project's actual model quota before probing; key creation, successful authentication, text-model quota, and a public pricing row do not establish usable Live quota.

[Billing](https://aistudio.google.com/docs/billing) distinguishes Free Tier from paid tiers and upgrades through billing-account linking/prepayment. The zero-expenditure gate is a project visibly on Free Tier with billing disabled, no card activation, and no paid fallback. Stop on missing entitlement or quota instead of upgrading.

[API-key documentation](https://aistudio.google.com/docs/api-key) says new AI Studio keys default to authorization keys bound to service accounts; unrestricted standard keys are rejected. Imported projects can need verification. [Verification](https://aistudio.google.com/docs/verification) may require a real phone's QR scan; `FREE_TIER_VERIFICATION_REQUIRED` is a gate, not an instruction to enable billing.

Use a backend-held private key. Google describes both backend proxying and direct client connections in the [overview](https://aistudio.google.com/docs/live-api). Our architectural inference: backend ownership of the provider socket gives the application direct evidence of received transcripts and lifecycle events; a browser reporting its own captions does not. [Ephemeral tokens](https://aistudio.google.com/docs/live-api/ephemeral-tokens) protect direct client credentials but do not provide a separate trusted transcript delivery channel.

## Contract and durability limits

The [wire reference](https://aistudio.google.com/api-reference/live#BidiGenerateContentServerContent) says input transcription has no guaranteed ordering against other events. Final output transcription precedes `generationComplete` or `interrupted`, then `turnComplete`; audio/transcript alignment is approximate. Interruption omits `generationComplete`. Transcript objects expose no stable turn ID. `turnComplete` and `generationComplete` differ; neither independently proves audio was heard. Treat disconnect tails as unresolved. These incremental events are not Vapi's committed cumulative snapshots or retrievable terminal call report.

The [capabilities guide](https://aistudio.google.com/docs/live-api/capabilities) allows ordered role-bearing history seeding and warns that one event can contain multiple parts. Process audio and transcripts independently, without `else if`. VAD interruption cancels generation; history keeps content already sent to the client. Clear queued local playback on `interrupted`. This does not establish a word-accurate played cutoff. Native Live responses use AUDIO plus transcription; omit unsupported TEXT response configuration.

The [model page](https://aistudio.google.com/docs/models/gemini-3.8-live) identifies `gemini-3.8-live` as stable, with a 131,072-token input limit. Omit `thinkingConfig`/`thinkingLevel`; configurable thinking belongs to Extended Thinking. Structured output, caching, code execution, Maps, and URL context are unsupported. [Live tools](https://aistudio.google.com/docs/live-api/tools) require explicit configuration; this probe needs none.

[Session management](https://aistudio.google.com/docs/live-api/session-management) documents uncompressed audio-only sessions up to 15 minutes, connections around 10 minutes, and resumption handles valid two hours after termination. Enable `sessionResumption: {}` and retain only a nonempty handle from `resumable: true`. Reconnect using that handle after an idle boundary. Resumption during generation can lose data. This proves neither recovery of a missing application event nor durable history replay.

## Bounded Node probe proposal

Installed `@google/genai` is 2.32.0, inspected through the main checkout's worker dependency. Its [Live source](https://github.com/googleapis/js-genai/blob/v2.32.0/src/live.ts) waits for setup completion inside `connect`, puts the private key in the socket URL, and supplies synchronous send methods. Bound the process/connect externally; sanitize error classification and never print raw socket errors/URLs. Its ephemeral-token branch still warns about `v1alpha`, unlike current token examples, supporting the private-key choice here.

Minimal shapes, following the [SDK getting-started guide](https://aistudio.google.com/docs/live-api/get-started-sdk):

```js
const ai = new GoogleGenAI({ apiKey, vertexai: false,
  httpOptions: { apiVersion: 'v1beta' } });
const session = await ai.live.connect({ model: 'gemini-3.8-live', callbacks,
  config: { responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {}, outputAudioTranscription: {},
    sessionResumption: {}, maxOutputTokens: 512 } });
session.sendRealtimeInput({ audio: {
  data: pcmChunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
session.sendRealtimeInput({ audioStreamEnd: true }); // automatic VAD only
```

Seed once before audio with `sendClientContent({turns: [{role:'user',parts:[{text:'Remember cobalt.'}]},{role:'model',parts:[{text:'Cobalt remembered.'}]}],turnComplete:false})`. Preserve repeated entries and original roles (`assistant` maps to `model`). The [pinned types](https://github.com/googleapis/js-genai/blob/v2.32.0/src/types.ts) include optional transcription `finished`; its presence is not guaranteed. Observe whether it actually arrives before defining finalization.

Proposed run: synthesize a harmless spoken question offline; parse its WAV data chunk as mono PCM16LE/16kHz, excluding RIFF headers. Pace 20–100ms chunks. Require an actual input transcription and decode every output PCM chunk into a 24kHz WAV; text seeding alone cannot pass voice acceptance. Send a second spoken interruption while output is arriving, then wait for idle/resumable state, close, reconnect once, and ask a spoken context-recall question. The authorized operational plan caps two sequential sockets, six speech inputs including the spoken interruption, and 135 seconds total; stop on failure without retries. The actual probe uses documented manual activity start/end boundaries with automatic VAD disabled, including an activity start during received model audio. This measures protocol interruption rather than microphone VAD quality. Retain only synthetic evidence and redacted counts/order, never credentials or handles.

The subsequent [actual probe](gemini-live-probe.md) records verified quota/authentication, controlled repeat/interruption ordering and fresh-session context. Product acceptance still needs a reviewed finality mapping, actual microphone/playback, PostgreSQL persistence/recovery and integration coverage. Historical draft PR #35 contains a Vapi-specific voice spec: callback authentication, registered call retrieval, private seed markers, mutable snapshot tails, and terminal reports cannot simply be renamed for Google. Any replacement durable-history contract needs explicit review after probe evidence.
