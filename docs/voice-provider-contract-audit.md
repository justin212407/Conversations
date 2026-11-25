# Voice provider contract audit

Reviewed 2026-11-25 against public official documentation and SDK source. This is research for the **blocked proposal**, not acceptance of a provider adapter. The earlier controlled request returned HTTP 400 with credits unavailable; it yielded no call, join token, media, or transcript evidence. Current usable balance remains unknown. The source-only research made no account requests or calls; the separate read-only inventory check is recorded in the plan.

## Credit visibility

No read-only usable-credit balance endpoint authenticated by a project private key was identified in the [public reference index](https://docs.vapi.ai/llms.txt). This is a bounded documentation finding, not proof that no API exists. Use the selected organization's Dashboard billing view: [Billing & Payment](https://docs.vapi.ai/billing/manage-billing-and-credits), or the older [Settings → Billing & Add-Ons](https://docs.vapi.ai/billing/manage-pay-as-you-go-billing). Successful API authentication does not establish available call credits. Do not guess endpoints or change billing.

## Creation and browser join

The current [Create Call contract](https://docs.vapi.ai/api-reference/calls/create.md) documents private-key `POST /call`, saved `assistantId`, `assistantOverrides`, and Daily transport `{provider: "daily"}`. It does not list a request `type: "webCall"`. The response transport offers `callUrl`; `callToken` is server-set and documented for video recording, not as a universal expiring join capability. The same contract says `modelOutputInMessagesEnabled: false` uses assistant-speech transcription rather than model output for history.

Pinned [2.5.2 generated API source](https://github.com/VapiAI/client-sdk-web/blob/v2.5.2/api.ts) exposes `POST /call/web` with assistant selection and overrides. In [2.5.2 browser source](https://github.com/VapiAI/client-sdk-web/blob/v2.5.2/vapi.ts), `start()` creates that call; `reconnect(webCall)` instead joins the supplied `webCallUrl` without another creation. Its `WebCall` shape has no separate token, and its Daily join supplies URL only. Map a returned transport URL explicitly; never use `start()` to join an already registered call.

[Current main](https://github.com/VapiAI/client-sdk-web/blob/main/vapi.ts) conditionally passes `transport.callToken` to Daily. This newer implementation does not establish 2.5.2 token support, token lifetime, room privacy, or successful joining of our proposed server-created call. Those remain unproven.

## Callback authentication

[Server authentication](https://docs.vapi.ai/server-url/server-authentication) retains credentials for saved-resource URLs. Request-supplied URLs, including inline assistants and URL overrides, withhold credentials. The rule applies to organizations created from 2026-09-23 UTC, with phased rollout to older organizations. High-volume message types suppress the withholding **log**, not withholding itself; missing transcript logs prove nothing about authentication. Inference: saved assistant URL/credential plus model-only overrides should retain authentication because no URL is supplied. Verify the received header; do not promote this inference to observed behavior.

## Conversation authority and gaps

[Server events](https://docs.vapi.ai/server-url/events) describes `conversation-update` as committed conversation history with raw `messages` and `messagesOpenAIFormatted`; transcripts separately have partial/final status. Optional model/interruption `turnId` relates to LLM turns. This does not establish a stable ID for every spoken turn, immutable successor-sealed prefixes, seed-marker retention, repeated-text identity, or exact interruption cutoff. An ordered array alone cannot establish a stable cross-snapshot ordinal mapping.

The [end-of-call report](https://docs.vapi.ai/server-url/end-of-call-report) documents post-processing artifacts: plaintext transcript, timed messages including tool traffic, and OpenAI-formatted messages. It can be duplicated and is sent once without retries by default. The guide does not specify an exact seed/live boundary or guarantee equality between prior committed snapshots and final spoken history. Preserve roles and array order, but test the proposed normalization rather than treating it as guaranteed.

## Required capability evidence

- [ ] Read the correct organization's existing usable balance in Dashboard; keep purchases and auto-reload unchanged.
- [ ] After authorization and available free credits, capture one bounded server-created call's sanitized response shape; verify URL/token exposure, expiry, and registration before browser join.
- [ ] Prove actual 2.5.2 join, microphone/media, stop, and cleanup; do not infer success from source signatures.
- [ ] Verify callback bearer authentication with saved configuration and model-only context overrides.
- [ ] Compare authenticated snapshots and final artifacts across seeded history, repeated equal turns, interruption, and multiple live turns; establish boundary, role/order, revisions, and safe committed prefix.
- [ ] Keep implementation blocked if identity or commitment remains ambiguous; revise the proposal from captured evidence before accepting an adapter.
