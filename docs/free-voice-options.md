# Zero-spend voice options

Research checked **2026-11-26**. This historical comparison did not itself accept a provider decision. The subsequent [2026-11-27 decision and actual probe](gemini-live-probe.md) select Gemini under #40. Constraints: $0 expenditure, no card/billing activation, no paid upgrade, no account/credit cycling. No accounts, configuration, providers, or product code were changed.

## Vapi after the starter credit

**No documented ongoing-free Vapi voice allowance was found for this hobby project.** Current pricing offers $5 “to get you started,” then prepaid **$0.05/minute hosting**, plus model costs. “No Success Package” removes the package subscription fee; usage still costs money. Free WebSocket/Daily transport does not remove hosting. [Vapi pricing](https://vapi.ai/pricing)

At $0 with auto-reload off, Vapi freezes the subscription and blocks new calls until more credits are purchased. That matches the supplied account evidence: $0, frozen wallet, historical `credits_unavailable` response. The reviewed billing/pricing pages do not promise replenishment or specify starter-credit expiry; neither should be assumed. [Billing and credits](https://docs.vapi.ai/billing/manage-billing-and-credits)

BYOK shifts a selected provider’s charges directly to that provider. It does not waive Vapi hosting, so even entirely free model-provider quotas would not solve the empty Vapi wallet. [Provider keys](https://docs.vapi.ai/customization/provider-keys), [usage-based hosting](https://docs.vapi.ai/billing/pricing-and-success-packages)

One official grant exists: the March 2025 **Startups Program** advertises 90,000 free usage minutes, subject to application and qualification. Published criteria include company age under five years, $100K–$5M funding, and voice integration as a core product. This does not establish eligibility for an unfunded hobby project, recurring grants, or coverage of every external provider charge. [Program announcement and application](https://vapi.ai/blog/vapi-ai-startups)

Support can clarify account-specific credit eligibility, but no public hobby/student recurring grant or guaranteed courtesy refill was found in the official sources reviewed. Asking would be optional research, not a reliable free operating plan; no contact was made.

## Alternatives

| Route                                                      | Free boundary                                                                                                              | Fit and friction                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Gemini Live                                         | Eligible Live models have free input/output quotas; this project's actual tier and quota must be checked before a call.    | Best first candidate for the existing TypeScript/Google stack. No extra managed voice platform; custom audio/session handling remains. |
| LiveKit Agents + direct Gemini Live plugin                 | LiveKit has recurring capped cloud allowances; Google eligibility remains separate.                                        | Real bidirectional voice with Node support. Adds room/token/agent lifecycle and transport integration.                                 |
| Browser speech + existing Gemini text path                 | Browser speech availability varies; the existing model's free quota still applies.                                         | Smallest implementation, but dictation/read-aloud is a scope reduction from the planned live voice experience.                         |
| Fully local Pipecat + Ollama + Whisper + Piper             | No cloud inference invoice when every selected component runs locally. Requires existing compute, storage and electricity. | Real voice pipeline, with Python alongside this Node stack. Model speed and interruption quality need measurement.                     |
| Node orchestration + Ollama + whisper.cpp + Piper services | Same local-compute condition.                                                                                              | Keeps application orchestration in TypeScript but requires more custom audio framing, VAD, cancellation and playback integration.      |

Google currently lists free audio input/output for `gemini-3.8-live`, its Extended Thinking variant and `gemini-3.1-flash-live-preview`. This is a quota-limited API tier, not unlimited credit or proof that this project's key has usable Live quota. Free-tier data can be used to improve Google's products. [Gemini pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-live)

Free and paid project tiers are distinct; keys inherit their project's billing settings. Verify the existing project is Free Tier and inspect its actual limits before testing; keep billing disabled and fail visibly on quota exhaustion. No Live call or billing change was made in this research. [Billing](https://aistudio.google.com/docs/billing), [rate limits](https://aistudio.google.com/docs/rate-limits)

Live supplies bidirectional audio, input/output transcription and interruption events. A server relay is the preferred proposed integration here: private key and trusted provider events stay server-side, while the browser captures/plays audio. Browser-direct ephemeral tokens are supported, but browser-only transcript submission would not satisfy this repository's durability contract. [Live overview](https://aistudio.google.com/docs/live-api), [capabilities](https://aistudio.google.com/docs/live-api/capabilities), [ephemeral tokens](https://aistudio.google.com/docs/live-api/ephemeral-tokens)

Google's temporary session-resumption handles are not our durable conversation IDs. Reopening must reconstruct completed context from PostgreSQL; interruption cutoff, transcript ordering and finalization still require a real free-quota probe. [Session management](https://aistudio.google.com/docs/live-api/session-management)

**LiveKit’s free tier is substantive, but bounded.** Build is $0/month without a card; published allowances include 1,000 hosted-agent minutes, 5,000 WebRTC participant minutes and $2.50 of inference credits. These are independent budgets, not 1,000 minutes of unrestricted model inference. [Pricing](https://livekit.com/pricing)

Build allowances hard-stop requests instead of billing overages, reset on the first calendar day monthly, and are shared across a user’s free projects. Free hosted agents can cold-start for 10–20 seconds. [Quotas and limits](https://docs.livekit.io/deploy/admin/quotas-and-limits/)

Use the **Google provider plugin with the user’s own eligible Gemini API key**, rather than assuming LiveKit Inference grants Google’s free quota. The official plugin supports Node.js and Python and connects directly to Gemini API/Vertex AI. Select the Gemini Developer API Free Tier path and current compatible model/plugin versions; account-level quota remains unverified. [Google realtime plugin](https://docs.livekit.io/agents/models/realtime/gemini/)

Browser speech provides recognition and synthesis, but recognition has limited browser compatibility and can depend on a remote service. A read-only check of the owner's current Brave session found both a recognition constructor and speech synthesis; that does not prove working recognition, offline availability or microphone behavior. No microphone was requested. [Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), [recognition compatibility](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

## Project-specific incorporation

The current worker already uses `@google/genai` in [its provider module](../apps/worker/src/provider.ts). PostgreSQL/shared contracts already model voice modality and operation admission. The new workspace's voice feature has not shipped; draft PR #35 contains proposed Vapi contracts, while the old [widget Vapi hook](../apps/widget/modules/widget/hooks/use-vapi.ts) remains a separate legacy surface. These are repository observations, not external provider guarantees.

The research recommended verifying existing Google Free Tier/Live quota, then proposing a bounded direct-Live proof covering audio, trusted transcript commits, repeated turns, interruption and persisted-context resume. Keep Clerk, conversation APIs, storage and application-event delivery. Amend the provider-specific proposal/issue before implementation; no provider migration is accepted by this research alone. LiveKit Build is the alternative if managed media/session tooling is preferred. Fully local voice is the fallback when commercial free quotas are unacceptable; no model download or performance benchmark has been run.

## Local components and licenses

Pipecat’s server is Python, BSD-2-Clause; local extras can require system dependencies. It has a provider-free peer-to-peer SmallWebRTC transport, so Daily/Pipecat Cloud is not mandatory. [Repository](https://github.com/pipecat-ai/pipecat), [SmallWebRTC](https://docs.pipecat.ai/api-reference/server/services/transport/small-webrtc)

Built-in Pipecat Whisper uses faster-whisper/MLX, not whisper.cpp. Its local Ollama and Piper integrations exist; Piper can run in-process or through a local HTTP server. [Whisper](https://docs.pipecat.ai/api-reference/server/services/stt/whisper), [Ollama](https://docs.pipecat.ai/api-reference/server/services/llm/ollama), [Piper](https://docs.pipecat.ai/api-reference/server/services/tts/piper)

Ollama is MIT; whisper.cpp is MIT and requires a model plus native build/runtime. Model licenses need separate selection. Current Piper engine is GPL-3.0-or-later; voices have their own provenance/licensing and must be checked individually. LiveKit’s Node framework is Apache-2.0; its turn models use a separate license. Free frameworks do not make paid STT/LLM/TTS providers free. [Ollama license](https://github.com/ollama/ollama/blob/main/LICENSE), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Piper licensing](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md), [LiveKit licenses](https://github.com/livekit/agents-js)

**Application requirement, across every route:** retain Clerk authorization, server-owned session/turn IDs and ordering, durable PostgreSQL transcript commits, interruption-aware assistant text, and reconstruction from persisted conversation history. Framework events alone do not implement that contract. Full persisted context is still subject to the chosen model’s context limit. Local latency and real interruption behavior remain untested.

The later authorized probe completed the quota/authentication and controlled audio experiment. Its actual evidence and remaining product work are recorded separately; this comparison is not product acceptance.
