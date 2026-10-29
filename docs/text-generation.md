# Durable text generation

The API accepts a text operation transactionally, and the separate worker produces its assistant response. The current workspace UI and application WebSocket delivery remain downstream issues. Polling REST history already observes durable completion, failure and interruption.

## Execution and recovery

The worker relays committed PostgreSQL job handoffs to the `conversations-text` BullMQ queue. Job ID is the operation UUID; enqueue succeeds before the handoff is acknowledged. A crash between those steps replays the same identity. Queue retention is bounded to a day/1000 results; PostgreSQL operation state remains authoritative even after queue cleanup.

Before generation, the worker validates the shared job contract and reloads the owned, nondeleted conversation, operation kind, original user input and current state. Only a pending text operation may win a new execution token. Running/terminal duplicates, voice operations, mismatched input/owners and inaccessible resources cannot call the model. No PostgreSQL transaction or connection is held during provider streaming.

Context includes all completed messages in sequence through the operation's original input, including prior voice turns, exactly once. Failed/interrupted messages and later turns after an older retry's cutoff are excluded. Both admission and execution enforce 100 messages and 64000 Unicode code points; admission returns 413 before 202 when already over the bound. History is never silently truncated. Output is bounded to 64000 code points.

The default provider deadline is 60 seconds (configurable 100–120000 ms), shorter than the five-minute operation lease. Timeouts/provider failures persist safe failed state and any valid partial content. Shutdown stops both worker intakes, aborts model work, drains domain finalization, then closes queue clients and the shared PostgreSQL pool. Queue acknowledgements may replay after interruption; execution fencing prevents another paid call. A five-second maintenance loop interrupts up to 25 expired text operations per pass, including pending work and executions stranded by a crash or a finalization outage. Recovery never silently calls the provider again; explicit retry creates a new assistant operation and reuses the original user input.

Terminal persistence and durable message/operation event handoffs commit in one transaction. Expired tokens cannot overwrite that result. History exposes `operationId` and safe `failureCode` on assistant messages so clients can discover retry after reload even when there is no active operation. Raw SDK errors, credentials and transcript contents are not logged.

## Provider configuration

`TEXT_PROVIDER=gemini` is the default. Configure only the server worker with `GOOGLE_GENERATIVE_AI_API_KEY`; it deliberately does not consume a harness-level `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to the stable `gemini-3.5-flash-lite`. `TEXT_GENERATION_TIMEOUT_MS` defaults to 60000. `TEXT_QUEUE_PREFIX` defaults to `conversations`; tests use unique prefixes. API and realtime processes receive no model key from Compose.

The official `@google/genai` SDK uses `generateContentStream`, cancellation, an explicit timeout, one candidate and automatic retries disabled. Application context maps user/assistant roles to Gemini user/model content. Adjacent same-role messages remain separate text parts. Only non-thought text is exposed; a truncated, blocked, empty, incomplete or failed stream cannot claim completed state.

`TEXT_PROVIDER=deterministic` is an explicit development/test substitute and is rejected in production. Isolated smoke sets it directly and requires no provider credentials. Missing development Gemini configuration keeps HTTP liveness available but generation readiness down and accepted work visibly failed; missing production configuration stops startup. A syntactically configured provider can still fail at execution because readiness does not spend quota.

Current primary references: [SDK streaming and configuration](https://github.com/googleapis/js-genai), [generation API](https://ai.google.dev/api/generate-content), [models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), and [project rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). The selected model lists a free tier; actual quotas and availability are project-specific. No upgrade or purchase is required by this feature.

## Provisional streaming boundary

The worker publishes replaceable `message.snapshot` envelopes validated by `provisionalMessageSnapshotSchema` to the shared `provisionalChannel(conversationId)` Redis channel. Publication is best effort, throttled and limited to one in-flight publish; a Redis fan-out failure cannot prevent final database persistence. The payload contains message/operation/public-stream identity, increasing revision, streaming state and accumulated content. It never exposes the execution token.

Envelope `sequence` is the last observed durable conversation checkpoint, possibly 0. It is not a newly allocated event sequence. Consumers order snapshots by stream/revision and give durable terminal state precedence over every late snapshot. Durable event relay and authenticated sockets are #21; browser reconciliation must use persisted REST history. Optional validated request/trace correlation crosses API, job, snapshots and terminal events. Full OpenTelemetry instrumentation belongs to #24.

## Evidence

`pnpm services:test` exercises real isolated PostgreSQL and Redis/BullMQ, actual Clerk SDK signature verification, concurrent execution and publication-before-ack replay, context resume/retry bounds, failure/timeout/output limits, stale recovery, shutdown, and SDK SSE responses through its supported fetch seam. Migration tests upgrade existing 0002 histories through 0003 and verify unique assistant linkage. `pnpm services:smoke` verifies process health, foundation queue execution, startup Redis failure, schema recovery and clean termination.

Separately, the existing project key was checked against the model catalog and one tiny direct real call returnedHTTP 200 with STOP/nonempty output. That access check is distinct from deterministic integration coverage; live worker streaming evidence is recorded only after its actual execution. No real-user Clerk session, browser UI, application socket, voice callback or Railway deployment is implied.
