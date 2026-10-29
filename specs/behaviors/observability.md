# Correlated service diagnostics and security

## Scope and principles

API, worker and realtime expose safe diagnostics for the implemented conversation lifecycle. Durable PostgreSQL state remains authoritative; telemetry is best effort and cannot authorize work, change response ownership, retry a paid generation, alter ordering or delay shutdown indefinitely. Realtime remains database-free. Frontend telemetry and voice-specific spans are integrated only after their feature prerequisites merge; local text evidence does not claim production or voice coverage.

Follow the architecture's ownership, provider-adapter and explicit-evidence principles. Prefer bounded, allowlisted operational metadata over capturing payloads and attempting to redact them later. A diagnostic outage must preserve the user's existing durable admission/recovery behavior.

## Structured logs

Every service emits Pino JSON with service name, severity and a stable diagnostic event name. HTTP completion includes a server-generated request ID, normalized route template, method, status and elapsed time. Unmatched/malformed paths use one fixed route category; raw paths, query strings and request URLs never enter logs. Returned request IDs can be used to find the request's diagnostics. Untrusted request-ID headers do not become trusted log fields.

Job execution, provider execution, event publication and socket lifecycle diagnostics include applicable internal conversation, operation, message, event, connection and request identities. Trace/span IDs are included when tracing is active. Identities have bounded syntax/length and appear as searchable log fields or span attributes, never metric labels. Internal account identity is included only where needed to investigate the ownership boundary; Clerk subjects, session IDs and personal profile details are excluded.

Default logs and spans exclude bearer/session/one-use tickets, cookies, authorization headers, provider/internal/metrics credentials, database/Redis/exporter URLs, raw request/response bodies, conversation titles, prompt/history/transcript/generated content and provider/driver exception messages or stacks. Safe failures use a fixed event plus bounded stage/outcome/failure-code values. Caller headers, payload objects and caught errors are never spread into diagnostic records. Pino redaction remains a second defense. Repeated partial snapshots do not create an unbounded per-token log stream.

## Trace context and causality

OpenTelemetry spans cover implemented HTTP routes, durable command admission, job publication and execution, provider streaming as one bounded operation, durable finalization, event publication and realtime delivery. HTTP spans identify normalized routes and response status, and safe errors mark the relevant failed stage without recording raw exceptions. Health/scrape traffic may be excluded from tracing to avoid diagnostic self-noise.

Valid W3C trace context may continue an inbound trace; malformed or oversized context is discarded and a new trace begins. Incoming sampling flags cannot force unbounded export: a configured bounded sampling policy applies to remote and local roots. Request IDs remain server-generated. Baggage and arbitrary caller attributes are not propagated. Tracestate is not logged or exported as an application attribute; only bounded standards-valid propagation state is eligible for forwarding.

The active admission context is persisted in the existing validated job correlation metadata so that a worker restarting after the HTTP response can continue the causal chain. Worker provider/finalization spans and emitted result events carry that causal context. Event relay and realtime delivery continue the originating event context; repeated delivery produces distinct attempt spans with the same stable event/operation identities rather than pretending there was another domain operation. A connection trace and a delivered event trace are distinct; delivery may link to the connection context without making all conversations one trace.

Provisional publication/delivery instrumentation is bounded to the generation/connection lifecycle or aggregate counts. Durable event sequences and provisional revisions retain their existing meaning. Telemetry does not promise exactly-once span delivery or capture browser rendering/receipt acknowledgements.

## Metrics

Each process owns an isolated Prometheus registry. Metrics report HTTP request count/duration/status class, job publication/execution outcomes and duration, generation/provider outcomes and duration, event publication/delivery outcomes, active sockets, subscription/reconciliation-related activity, and socket closures/recovery causes. Durations use seconds. Active gauges return to zero after cleanup.

Labels use closed sets: service, normalized route, implemented method, status class, stage, outcome and documented safe failure/recovery code where applicable. No user/account/conversation/message/operation/event/connection/request IDs, raw URLs, provider model strings, error strings or dynamic queue names become labels. Unknown values map to a fixed category. Histogram buckets and metric families are fixed so malicious paths or payload values cannot grow registry cardinality.

Metrics exposure is opt-in, independent of user authentication, and protected by a separate server-only high-entropy bearer credential when enabled. An absent/incorrect credential receives a generic rejection without exposing metric content. This operational credential cannot access product/internal realtime routes and is never sent to browsers. Scrapes do not log credentials or emit self-referential request metrics. Health availability does not depend on a metrics scraper or trace collector.

## Export and local investigation

Trace export is disabled until explicitly configured; logs and enabled process-local metrics continue without a collector. Configured export uses bounded batching, queue size, timeout and sampling. Collector disconnection, a full exporter queue or export errors cannot fail commands, repeat provider calls, expose payloads or retain unbounded memory. Export/shutdown flush has a deadline inside the existing service shutdown budget. Startup/configuration failures identify field names or fixed failure classes without printing supplied values.

An opt-in local Compose profile provides a trace collector/viewer and Prometheus with loopback-published ports, bounded retention and no dependency from ordinary services to collectors. The profile passes only its operational scrape credential and safe telemetry configuration; it does not receive Clerk/provider/database secrets. The runbook describes enabling the profile, finding a request/operation/conversation across JSON logs and traces, querying bounded counters, interpreting missing samples and stopping only the owned resources.

A reproducible isolated verification uses real HTTP, durable storage, Redis/queue and socket delivery with a synthetic failing provider. It demonstrates the same conversation/request/operation correlation across request, publication, worker/provider, finalized failure and event delivery, plus safe metrics and collector ingestion where enabled. Secret/transcript canaries must be absent from captured logs, exported spans and metric text. The verification cleans up only its unique resources. Live credentials are unnecessary; deployed diagnostics remain separate evidence.

## Security configuration

Existing real Clerk verification, ownership, one-use tickets, exact CORS/Origin allowlists, bounded input/control frames and parameterized database writes remain mandatory. Telemetry never adds an authentication bypass or a transcript/debug endpoint. Request failures and socket rejection keep the safe common error behavior.

Development explicitly permits local HTTP/WS origins and loopback collector access. Production requires explicit HTTPS frontend origins and WSS public socket URLs; wildcard/credential-bearing origins remain invalid. Internal realtime-to-API transport requires HTTPS in production unless an explicit server-only trusted-private-network option permits HTTP behind the deployment's private boundary. Public TLS termination and trusted-proxy settings must be documented; arbitrary forwarded headers are not trusted by default. Production collector transport requires HTTPS or an explicit private-network allowance. URLs carrying credentials/query/fragment are rejected. These validations do not claim a certificate, proxy or cloud deployment exists.

Secret values stay in ignored environment/runtime configuration and are not embedded in shared/browser contracts, logs, metrics, examples or images. Hosted CI remains temporarily waived in favor of reviewed local checks. Rate limiting, broad dependency scanning and actual deployment/HTTPS verification retain their existing Slice 2/#25/#26 ownership.

## Primary references

- [OpenTelemetry JavaScript propagation](https://opentelemetry.io/docs/languages/js/propagation/) describes trace-context propagation across custom boundaries.
- [Prometheus metric naming](https://prometheus.io/docs/practices/naming/) and [instrumentation guidance](https://prometheus.io/docs/practices/instrumentation/) explain fixed metric names, base units and bounded label cardinality.
