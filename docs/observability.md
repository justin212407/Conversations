# Service diagnostics and failure investigation

API, worker and realtime use the same server-only diagnostics boundary. JSON Pino logs retain fixed event names and safe IDs, OpenTelemetry carries causal context through HTTP/admission, durable job publication, worker/provider execution, finalization, event relay and socket delivery, and each process owns an isolated Prometheus registry. Durable history/retry/fencing remain authoritative when collectors are down. No prompt, title, response, provider exception, credential, URL/query, baggage or tracestate is captured by default.

The current foundation covers merged text and realtime services, with optional bounded frontend error summaries described below. Voice spans follow #23; actual deployed HTTPS/WSS/diagnostics evidence remains #26. This document does not claim those gates passed. The owner temporarily waived hosted CI; reviewed local tests remain required.

## Enable local collectors

Ordinary services need neither collector nor metrics credential. Trace export stays disabled while `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is empty; `/metrics` returns 404 while `METRICS_BEARER_TOKEN` is empty. Metrics registries and logs remain local and bounded. Never reuse the Clerk, provider or internal realtime credential for scrapes.

1. Generate at least 32 random bytes encoded as base64url and place the distinct result in the ignored root `.env` as `METRICS_BEARER_TOKEN`. Do not paste it into commands, issue comments or diagnostics. Set `OBSERVABILITY_UID`/`OBSERVABILITY_GID` to the current user's numeric IDs (for example, obtain those with `id -u`/`id -g`).
2. Run `pnpm observability:prepare`. It writes only `.local-observability/prometheus.yml`, with directory 0700/file 0600. That ignored directory is excluded from Docker build context. The script prints no credential. Prometheus runs with the matching UID/GID so the private bind mount remains readable without widening its mode.
3. Use the opt-in overlay/profile:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up --build -d
   ```

   Inspect the intended project and review a Docker mutation plan before running this in a shared environment. Services have no collector dependency and continue without it. The overlay explicitly permits HTTP on its local private Docker bridge; production flags default false.

4. Open Jaeger at `http://localhost:16687` and Prometheus at `http://localhost:19090`. OTLP HTTP accepts host-process traces at `http://127.0.0.1:14318/v1/traces`; container services use `http://jaeger:4318/v1/traces`. Ports are loopback-only and configurable. The pinned Jaeger 2.22 configuration caps in-memory traces at 2000 with a memory limiter; Prometheus 3.13.5 LTS uses bounded memory/queries and ephemeral 192 MiB storage with 6 h/128 MB block retention and 16 MB WAL segments. Smaller WAL segments leave room for its retained write-ahead logs; block retention alone does not cap WAL/checkpoint/head storage. Restart clears local collector history.
5. Stop only collectors with the same project/files/profile and `stop jaeger prometheus`. Leave service/PG/Redis volumes intact. Disabling the overlay and clearing export/token environment settings removes diagnostics exposure; no data migration is involved.

The collector receives only safe spans; Prometheus receives only the scrape token. Neither receives Clerk, model, internal realtime, database or Redis credentials. Treat collector UIs as local operational data; their loopback binding is not production authentication. Do not print `docker compose config` with real interpolated secrets; use validation-only output or synthetic configuration when reviewing it.

## Follow one operation

Use the 202 response's `operationId` and `conversationId`, or a safe error response's server-generated `requestId`. Search JSON service logs for these exact fields. `command.admit.finished` records admitted operation/message IDs. Follow `job.publish.finished`, `job.execute.finished`, `provider.generate.finished`, `operation.finalize.finished`, `event.publish.finished` and `event.deliver.finished`; each includes the applicable IDs plus trace/span IDs. A publication attempt and a domain operation are different identities: repeated delivery can create another span while remaining one operation/provider execution. Logs never contain the response text.

In Jaeger select `conversations-api`/`conversations-worker`/`conversations-realtime` or search the trace ID from those logs. The producer/consumer parent edges continue across durable boundaries, even after HTTP has finished. Provider failure marks the provider/job spans with a safe failure code; finalization can succeed while persisting a failed response. Event delivery means the server's WebSocket send completed, not that a browser rendered/acknowledged it. Public frames retain their existing application shape and only request ID correlation; traceparent/tracestate remain internal.

For scripted checks against the pinned Jaeger version, use `GET /api/v3/services` and `GET /api/v3/traces/<traceId>` on its query port. Trace responses wrap OTLP data in `result.resourceSpans`; enumerate their `scopeSpans[].spans` and resource service names. The [official query API](https://github.com/jaegertracing/jaeger-idl/blob/main/proto/api_v3/query_service.proto) describes this format.

Sampling defaults to 0.1, applies equally to remote/local trace IDs and ignores the incoming sampled bit. Set `TRACE_SAMPLE_RATIO=1` explicitly for a short local investigation; an absent trace can mean sampling, bounded queue loss or collector outage. Incoming baggage/tracestate are discarded. No global HTTP/SDK auto-instrumentation can accidentally record provider URLs or headers. Export batches are capped at 256 queued spans/64 per export, concurrency 1 and a 750 ms exporter timeout; shutdown allows at most the lesser of 1 s or a quarter of the service shutdown budget. Export failure does not fail admission, repeat generation or become a readiness dependency.

## Read bounded metrics

Scrapes require `Authorization: Bearer <separate metrics credential>`; no cookie or Clerk session grants access. The API advertises `/metrics` in runtime OpenAPI only while configured. Scrapes are excluded from their own metrics/log stream. Registry labels never contain resource IDs, URLs, error strings, model names or dynamic queue prefixes; unknown routes/methods map to fixed categories.

Useful PromQL examples:

```promql
sum by (service, status_class) (rate(conversations_http_requests_total[5m]))
histogram_quantile(0.95, sum by (le, service) (rate(conversations_http_request_duration_seconds_bucket[5m])))
sum by (service, stage, failure_code) (increase(conversations_operations_total{outcome="failed"}[15m]))
conversations_active_connections
sum by (failure_code) (increase(conversations_operations_total{stage="socket.close"}[15m]))
```

Stages include command admission, job publication/execution, provider generation, finalization, event publication/delivery, socket connect/subscribe/close and runtime recovery. Safe failures distinguish provider unavailability/errors, timeout/context/output limits, interruption/expiry, auth/access, Redis interruption, heartbeat, protocol/buffer limits, shutdown and generic dependency failure. Startup/shutdown/dependency-transition events use fixed names. Socket reconnect activity is inferred from repeated admitted subscriptions and closure/recovery causes; the server cannot identify a browser's reconnect attempt without accepting additional browser identity.

## Reproduce a failure without live credentials

Build services, then run:

```sh
pnpm services:build
node --test apps/worker/test/observability.test.mjs
```

The test creates its own temporary PostgreSQL database, queue prefix, Redis keys and free HTTP/socket/OTLP ports. Actual Clerk SDK signature verification gates HTTP; a synthetic provider streams a partial result then fails. Assertions check durable failure, exactly one provider call after replay, all causal span stages/parents, protected metrics, socket cleanup, public schema compatibility and absence of secret/title/transcript canaries in logs, real OTLP export and metric text. Its local receiver is a deterministic protocol capture, not a claim that Jaeger was running.

For an actual collector ingestion check, first start only your owned local collector profile, then set `TEST_OTLP_FORWARD_URL=http://127.0.0.1:14318/v1/traces` for that same test. Its receiver forwards safe captured packets; inspect trace `13579bdf13579bdf13579bdf13579bdf` in Jaeger. Forwarding is best effort; verify collector state independently before claiming success. Keep production evidence separate. The test drops only its own unique database/queue/keys and never reads root secrets or old Convex.

If a command is pending, inspect request/job publication then queue readiness. If provider execution failed, inspect its safe code and the durable assistant/operation status; controlled retry retains the original input. If finalization failed, lease recovery interrupts stale work instead of paying again. If a socket closed for Redis/auth/heartbeat/buffer failure, clients must obtain a fresh ticket and reconcile history; metrics cannot replace that checkpoint. Never recover by deleting shared Redis/PG data or reenqueuing a completed operation.

## Production boundary

Production requires explicit HTTPS frontend origins and WSS public socket URLs. Internal realtime API HTTP and collector HTTP are rejected unless their distinct private-network flags are explicitly true. These flags are trust declarations for an operator-controlled private network, not hostname detection or public TLS substitutes. The local overlay declares its private Docker bridge only; production templates must make their own decision. Configure TLS at the public ingress/platform and restrict health/metrics/internal routes through the deployment network. Services do not trust arbitrary forwarded headers by default. Actual certificate, proxy, ownership/CORS and deployed diagnostic checks remain #26.

Keep all secret-bearing env/scrape files ignored and outside images. The service telemetry package is server-only; shared application contracts import no SDK. Optional frontend diagnostics follow the separate error-only boundary below. Dependency scanning remains #25 and rate limiting remains Slice 2.

## Optional frontend error summaries

Frontend diagnostics are disabled without configured DSNs: `NEXT_PUBLIC_SENTRY_DSN` enables the browser, while server-only `SENTRY_DSN` enables Next.js Node/edge diagnostics. Missing or invalid values skip SDK initialization. Accepted DSNs use HTTPS, an alphanumeric public key, a host and a numeric project ID (an optional plain path prefix is supported); credentials other than the public key, whitespace/control characters, backslashes, query and fragment are rejected. The browser DSN is public configuration, not an application/provider secret. Changing public configuration requires rebuilding the frontend. Never paste real configuration or captures into issues, examples or test commands.

The pinned Sentry 10.78.0 SDK has no enabled default/added integrations. Automatic HTTP/console/user/session/context collection, Node OpenTelemetry setup, tracing/propagation, logs, metrics, replay and client reports are disabled. There is no source-map upload, tunnel or connectivity check. The two installation demonstration routes are removed in every environment; visiting a removed route through Clerk middleware may first require authentication, which is not proof of a route's existence or an HTTP 404.

Explicit global-render and Next.js request-error hooks report only `render_error` or `request_error`. Other captures become `application_error`. Private owned markers select these categories; raw caught errors and request arguments are never forwarded by those hooks. A final transport rebuilds every exported error from a closed runtime/failure category, fixed application message/severity/platform/grouping and fresh diagnostic identity/time. It discards incoming IDs, timestamps, event/envelope/item headers, SDK metadata, dynamic tags, user/domain identities, exceptions/stacks, URLs, breadcrumbs, titles and message content. Sessions, reports, attachments, transactions/spans, profiles, logs, metrics, replay, feedback/check-ins and unknown envelope types are dropped. This final boundary is necessary because SDK enrichment and attachments occur after the error event hook, and several envelope types do not use that hook.

The resulting Sentry issue tells an operator which fixed failure category occurred in which frontend runtime and approximately when. It supplies no stack/source location, user identity, conversation/request identity or browser-to-service trace. Use service request/operation diagnostics for durable flow investigation. No event or error text is safe merely because the SDK labels it an exception. Diagnostic initialization/capture failures are contained; the SDK processing/transport buffers hold at most eight entries, outgoing requests have a 750 ms deadline and abort, and transport flush is capped at that deadline. Export uses POST with omitted credentials/referrer and rejected redirects; it neither retries a domain command nor becomes a readiness dependency.

## Frontend API configuration

`NEXT_PUBLIC_API_URL` is an origin, not a `/v1` prefix. Production requires an explicitly configured HTTPS origin. An optional root slash is normalized away before the existing API client appends `/v1/...`. Literal HTTP(S) authority syntax is required; parser-repaired separators, all raw whitespace/control characters/backslashes, any `@`/`?`/`#` delimiter (even empty), non-root paths, empty ports and malformed URLs are rejected. Values are never trimmed. Errors contain only `NEXT_PUBLIC_API_URL`. Validation happens before workspace client/store creation and its first authenticated request; the build alone does not prove deployed runtime settings.

Development/test keep `http://localhost:4300` only when the value is absent. Explicit empty/invalid values fail. HTTP permits only literal `localhost`, `127.0.0.1` or `[::1]`, optionally with a numeric port; HTTPS is also usable. Production never falls back to localhost. Clerk/CORS/ownership/ticket/WSS contracts are unchanged, and this validation supplies no certificate/proxy/cloud evidence.

## Reproduce frontend privacy checks locally

Run `pnpm --filter web test`, `pnpm --filter web typecheck` and `pnpm --filter web lint` after a frozen installation. The existing test command discovers the separate config/privacy regressions. They exercise the real installed Next.js Node SDK and SDK serializer with synthetic DSNs, an in-memory receiver and content/secret/URL/header/stack canaries. Tests cover enrichment after the event hook, attachments, non-error/unknown envelopes, disabled/invalid setup, closed categories, retained control outcomes, transport rejection/timeouts and finite concurrent request/abort behavior. No Sentry/application/provider endpoint is contacted. The edge-specific installed entrypoint is exercised in a Node host; that is not actual edge deployment evidence.

`apps/web/test/diagnostics-browser.ts` exports a browser check for bundling with esbuild's browser platform and running in a fresh browser profile. Match Next.js's production browser environment definitions/process shim when using standalone esbuild; bundling the framework's Node-only code is not a browser SDK test. The helper uses the actual browser SDK with an in-memory receiver, checks four safe error envelopes, disabled output and unchanged console methods. Permit only the owned loopback fixture origin and reject any external request in the browser runner. Browser tooling is supplied externally for the current manual check; no new repository dependency or hosted/browser CI pass is claimed. Existing workspace interaction checks remain separately reproducible through its standalone fixture.

Primary sources for this boundary: [pinned core client and alternate envelope paths](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/client.ts), [event enrichment](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/envelope.ts), [SDK transport and serialization](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/core/src/transports/base.ts), [Next.js browser initialization](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/client/index.ts), [Node initialization](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/server/index.ts) and [edge initialization](https://github.com/getsentry/sentry-javascript/blob/10.78.0/packages/nextjs/src/edge/index.ts). Options express collection intent; synthetic serialized-output tests establish what the tested version actually exports.

Primary guidance: [OpenTelemetry propagation](https://opentelemetry.io/docs/languages/js/propagation/), [Prometheus naming/cardinality](https://prometheus.io/docs/practices/naming/), [Jaeger 2.22 quick start](https://www.jaegertracing.io/docs/2.22/getting-started/) and [Prometheus Docker setup](https://prometheus.io/docs/prometheus/latest/installation/).
