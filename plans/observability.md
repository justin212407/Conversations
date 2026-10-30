---
status: done
depends:
  [
    service-foundation,
    persistence-auth,
    conversation-api,
    text-generation,
    realtime,
  ]
specs:
  - specs/architecture.md
  - specs/behaviors/service-foundation.md
  - specs/api/conversations.md
  - specs/behaviors/observability.md
issues: [24]
pr: 33
---

# Plan: Correlated service diagnostics and security basics

## Scope

Implement #24's independent API/worker/realtime observability and security foundation using merged service boundaries. Keep logs safe, trace HTTP/queue/provider/event delivery, expose bounded useful metrics, and provide opt-in local collectors and a reproducible failure investigation. Frontend telemetry evaluation must wait until PR #32 merges; voice-specific coverage follows the voice adapter. Actual production verification stays explicit in #26.

## Implements

The architecture's Pino/OpenTelemetry/Prometheus choices, safe operational boundaries, and #24 acceptance. Add a bounded observability behavior specification before implementation and have root review it.

## Approach

1. Audit existing structured logging, command/job/event contracts, provider and transport seams, CORS/origin validation, configuration, secret redaction and deployment defaults. Propose the concrete behavior specification first.
2. Add server-only diagnostics interfaces/runtime with bounded labels and safe attributes. Reuse existing domain and provider seams; no browser SDK, transcript capture, Redis-only authoritative history, or realtime database client.
3. Propagate verified trace context through HTTP commands, durable handoff, worker/provider execution and realtime publication/delivery. Preserve request/operation/conversation correlation without putting account/conversation IDs into metric labels.
4. Add opt-in local trace/metric collectors, safe metrics exposure and instructions to follow a conversation or investigate a failure. Instrumentation/exporter failure must not break durable commands or shutdown indefinitely.
5. Verify existing auth/CORS/input/parameterized database boundaries and explicit development versus HTTPS/WSS production settings. No rate limiter, deployment provisioning, payment upgrade, credential rotation or Convex cutover.
6. Exercise actual isolated services/collectors with a synthetic failing provider path and confirm useful correlated diagnostics with no transcript/secret leakage. Use unique dependency resources and ports, never shared test queues or databases.
7. After PR #32 merges, integrate its safe optional frontend telemetry configuration evaluation without reverting its removed tunnel/default PII behavior. Absorb voice-specific diagnostics when #23 is available, retaining pending evidence explicitly.
8. Run appropriate build/type/lint/tests and review, publish one scoped PR, update local-only journal after each small change, and wait for root merge.

## Validation

- [x] Request/job/connection/provider/event logs expose useful bounded correlation and exclude credentials, URLs with secrets and transcript content by default.
- [x] Real HTTP-to-job-to-provider and event-delivery traces preserve causal context, including safe failure diagnostics.
- [x] Metrics cover request latency/errors, jobs, connection/recovery activity and response/provider failures with bounded labels.
- [x] Opt-in local collectors and runbook let an operator locate one synthetic conversation's cross-service diagnostics.
- [x] Existing auth/ownership, explicit CORS/origin, validation and parameterized persistence remain enforced; production HTTP/WS configuration rejects unsafe settings while local development stays explicit.
- [x] Failure/cleanup regressions and relevant prior checks pass under the user's hosted-CI waiver.
- [ ] Frontend optional telemetry evaluation and voice-path diagnostics are integrated after their prerequisite feature merges, with production release evidence tracked honestly in #26.

## Risks / unknowns

Root is independently verifying PR #32 in another worktree; do not touch its source or run another Next build. The host has severe memory pressure: serialize heavy commands and coordinate Docker/browser work. Observability must stay best effort and bounded. Railway is unavailable and deferred; no claim of deployed security or traces is justified by local evidence.

## Notes

Base a03a4d9 is merged main through PR31. #24 depends on completed #17/#18 and is independent of the pending personal-accounts dashboard setting for #22. The user explicitly permits nonconflicting worktree work while dependent features remain sequential. Keep all existing lockfile resolutions unless a scoped addition requires otherwise.

The independent service foundation is implemented in [PR #33](https://github.com/justin212407/Conversations/pull/33). Accepted spec 8ffbfcf led implementation 133bc9a; root review correction a983d41 makes malformed request IDs searchable without exposing paths, and 14ebaf6 fits Prometheus WAL segments to the bounded local store. Both review axes are clear. Frozen installation, service build/typecheck/lint (zero warnings), formatting and separate-process smoke passed. The 69-test foundation plus the added passing router-error regression gives 70 service tests; the complete runtime suite passes 16/16 after the correction. The in-process integration independently checks causal parent edges, failure persistence, replay and safe OTLP capture.

A clean corrected services image was exercised with actual API/worker/realtime entrypoints, fresh isolated PostgreSQL/Redis and the pinned Jaeger/Prometheus profile. Signed RSA fixture authentication uses the real Clerk verifier; a real provider request with a synthetic invalid credential produces one persisted safe failure. Jaeger's supported v3 API contains all eight causal stages across the three services, Prometheus reports three healthy targets, and SQL confirms exactly one operation/job/failure event after replay. Logs/exported spans/metrics exclude transcript and credential canaries, public frames retain only request-ID correlation, and sockets return to zero. The actual packaged router-error completion record and effective 16 MiB WAL setting also pass. With only collectors stopped, all services remain ready and replay remains idempotent. Service containers then exit zero without OOM. These are local representative checks using no real project credentials, not production deployment or real personal-user/voice proof.

The final frontend/voice criterion remains unchecked: PR #32 has not merged and actual Clerk personal-account configuration remains root/user-owned; voice #23 is also unavailable. No apps/web, shared UI, workspace plan or umbrella file was changed. Issue #24 therefore stays open after this bounded foundation until remaining feature/deployed evidence is verified. Production configuration validation is local evidence only; TLS termination/cloud enforcement belongs to #26.

The maintained Prometheus package is @prometheus-io/client 0.16.1 (the renamed official successor to deprecated prom-client). OTel uses a coherent 2.12 SDK/core/resources family and 0.223 HTTP exporter with existing API 1.9.1. Only 152 additive lock lines were needed; legacy resolutions remain unchanged. The first parallel app run hit fixture timeouts under severe host pressure; final application verification ran serially and passed 41/41. Older fixtures were updated for actual child-span causality and explicit HTTPS internal production transport, with stronger parent/policy assertions added.

## Follow-ups

- Issue [#24](https://github.com/justin212407/Conversations/issues/24) — integrate optional frontend evaluation after #22 merges and voice-specific diagnostics after #23; retain the safe privacy/tunnel defaults. This PR does not close the issue.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — verify deployed TLS/proxy/network policy and cross-service diagnostic evidence; Railway remains deferred.
- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — broader dependency scanning and full regression coverage. Rate limiting remains Slice 2.
