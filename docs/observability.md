# Service diagnostics and failure investigation

API, worker and realtime use the same server-only diagnostics boundary. JSON Pino logs retain fixed event names and safe IDs, OpenTelemetry carries causal context through HTTP/admission, durable job publication, worker/provider execution, finalization, event relay and socket delivery, and each process owns an isolated Prometheus registry. Durable history/retry/fencing remain authoritative when collectors are down. No prompt, title, response, provider exception, credential, URL/query, baggage or tracestate is captured by default.

The current foundation covers merged text and realtime services. Frontend evaluation waits for #22, voice spans for #23 and actual deployed HTTPS/WSS/diagnostics evidence for #26. This document does not claim those gates passed. The owner temporarily waived hosted CI; reviewed local tests remain required.

## Enable local collectors

Ordinary services need neither collector nor metrics credential. Trace export stays disabled while `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is empty; `/metrics` returns 404 while `METRICS_BEARER_TOKEN` is empty. Metrics registries and logs remain local and bounded. Never reuse the Clerk, provider or internal realtime credential for scrapes.

1. Generate at least 32 random bytes encoded as base64url and place the distinct result in the ignored root `.env` as `METRICS_BEARER_TOKEN`. Do not paste it into commands, issue comments or diagnostics. Set `OBSERVABILITY_UID`/`OBSERVABILITY_GID` to the current user's numeric IDs (for example, obtain those with `id -u`/`id -g`).
2. Run `pnpm observability:prepare`. It writes only `.local-observability/prometheus.yml`, with directory 0700/file 0600. That ignored directory is excluded from Docker build context. The script prints no credential. Prometheus runs with the matching UID/GID so the private bind mount remains readable without widening its mode.
3. Use the opt-in overlay/profile:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up --build -d
   ```

   Inspect the intended project and review a Docker mutation plan before running this in a shared environment. Services have no collector dependency and continue without it. The overlay explicitly permits HTTP on its local private Docker bridge; production flags default false.

4. Open Jaeger at `http://localhost:16687` and Prometheus at `http://localhost:19090`. OTLP HTTP accepts host-process traces at `http://127.0.0.1:14318/v1/traces`; container services use `http://jaeger:4318/v1/traces`. Ports are loopback-only and configurable. The pinned Jaeger 2.22 configuration caps in-memory traces at 2000 with a memory limiter; Prometheus 3.13.5 LTS uses bounded memory/queries and ephemeral 192 MiB storage with 6 h/128 MB retention. Restart clears local collector history.
5. Stop only collectors with the same project/files/profile and `stop jaeger prometheus`. Leave service/PG/Redis volumes intact. Disabling the overlay and clearing export/token environment settings removes diagnostics exposure; no data migration is involved.

The collector receives only safe spans; Prometheus receives only the scrape token. Neither receives Clerk, model, internal realtime, database or Redis credentials. Treat collector UIs as local operational data; their loopback binding is not production authentication. Do not print `docker compose config` with real interpolated secrets; use validation-only output or synthetic configuration when reviewing it.

## Follow one operation

Use the 202 response's `operationId` and `conversationId`, or a safe error response's server-generated `requestId`. Search JSON service logs for these exact fields. `command.admit.finished` records admitted operation/message IDs. Follow `job.publish.finished`, `job.execute.finished`, `provider.generate.finished`, `operation.finalize.finished`, `event.publish.finished` and `event.deliver.finished`; each includes the applicable IDs plus trace/span IDs. A publication attempt and a domain operation are different identities: repeated delivery can create another span while remaining one operation/provider execution. Logs never contain the response text.

In Jaeger select `conversations-api`/`conversations-worker`/`conversations-realtime` or search the trace ID from those logs. The producer/consumer parent edges continue across durable boundaries, even after HTTP has finished. Provider failure marks the provider/job spans with a safe failure code; finalization can succeed while persisting a failed response. Event delivery means the server's WebSocket send completed, not that a browser rendered/acknowledged it. Public frames retain their existing application shape and only request ID correlation; traceparent/tracestate remain internal.

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

Keep all secret-bearing env/scrape files ignored and outside images. The telemetry package is server-only; shared application contracts import no SDK. Optional frontend telemetry from the workspace must retain its disabled replay/log/PII defaults and removed tunnel behavior when evaluated later. Dependency scanning remains #25 and rate limiting remains Slice 2.

Primary guidance: [OpenTelemetry propagation](https://opentelemetry.io/docs/languages/js/propagation/), [Prometheus naming/cardinality](https://prometheus.io/docs/practices/naming/), [Jaeger 2.22 quick start](https://www.jaegertracing.io/docs/2.22/getting-started/) and [Prometheus Docker setup](https://prometheus.io/docs/prometheus/latest/installation/).
