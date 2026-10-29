---
status: in-progress
depends: [service-foundation, persistence-auth, conversation-api, text-generation, realtime]
specs:
  - specs/architecture.md
  - specs/behaviors/service-foundation.md
  - specs/api/conversations.md
  - specs/behaviors/observability.md
issues: [24]
---

# Plan: Correlated service diagnostics and security basics

## Scope

Implement #24's independent API/worker/realtime observability and security foundation using merged service boundaries. Keep logs safe, trace HTTP/queue/provider/event delivery, expose bounded useful metrics, and provide opt-in local collectors and a reproducible failure investigation. Frontend telemetry evaluation must wait until PR32 merges; voice-specific coverage follows the voice adapter. Actual production verification stays explicit in #26.

## Implements

The architecture's Pino/OpenTelemetry/Prometheus choices, safe operational boundaries, and #24 acceptance. Add a bounded observability behavior specification before implementation and have root review it.

## Approach

1. Audit existing structured logging, command/job/event contracts, provider and transport seams, CORS/origin validation, configuration, secret redaction and deployment defaults. Propose the concrete behavior specification first.
2. Add server-only diagnostics interfaces/runtime with bounded labels and safe attributes. Reuse existing domain and provider seams; no browser SDK, transcript capture, Redis-only authoritative history, or realtime database client.
3. Propagate verified trace context through HTTP commands, durable handoff, worker/provider execution and realtime publication/delivery. Preserve request/operation/conversation correlation without putting account/conversation IDs into metric labels.
4. Add opt-in local trace/metric collectors, safe metrics exposure and instructions to follow a conversation or investigate a failure. Instrumentation/exporter failure must not break durable commands or shutdown indefinitely.
5. Verify existing auth/CORS/input/parameterized database boundaries and explicit development versus HTTPS/WSS production settings. No rate limiter, deployment provisioning, payment upgrade, credential rotation or Convex cutover.
6. Exercise actual isolated services/collectors with a synthetic failing provider path and confirm useful correlated diagnostics with no transcript/secret leakage. Use unique dependency resources and ports, never shared test queues or databases.
7. After PR32 merges, integrate its safe optional frontend telemetry configuration evaluation without reverting its removed tunnel/default PII behavior. Absorb voice-specific diagnostics when #23 is available, retaining pending evidence explicitly.
8. Run appropriate build/type/lint/tests and review, publish one scoped PR, update local-only journal after each small change, and wait for root merge.

## Validation

- [ ] Request/job/connection/provider/event logs expose useful bounded correlation and exclude credentials, URLs with secrets and transcript content by default.
- [ ] Real HTTP-to-job-to-provider and event-delivery traces preserve causal context, including safe failure diagnostics.
- [ ] Metrics cover request latency/errors, jobs, connection/recovery activity and response/provider failures with bounded labels.
- [ ] Opt-in local collectors and runbook let an operator locate one synthetic conversation's cross-service diagnostics.
- [ ] Existing auth/ownership, explicit CORS/origin, validation and parameterized persistence remain enforced; production HTTP/WS configuration rejects unsafe settings while local development stays explicit.
- [ ] Failure/cleanup regressions and relevant prior checks pass under the user's hosted-CI waiver.
- [ ] Frontend optional telemetry evaluation and voice-path diagnostics are integrated after their prerequisite feature merges, with production release evidence tracked honestly in #26.

## Risks / unknowns

Root is independently verifying PR32 in another worktree; do not touch its source or run another Next build. The host has severe memory pressure: serialize heavy commands and coordinate Docker/browser work. Observability must stay best effort and bounded. Railway is unavailable and deferred; no claim of deployed security or traces is justified by local evidence.

## Notes

Base a03a4d9 is merged main through PR31. #24 depends on completed #17/#18 and is independent of the pending personal-accounts dashboard setting for #22. The user explicitly permits nonconflicting worktree work while dependent features remain sequential. Keep all existing lockfile resolutions unless a scoped addition requires otherwise.

## Follow-ups

Voice #23 supplies the provider-call seam; deployment/cutover #26 supplies actual HTTPS/WSS and production verification. Broader CI dependency scanning belongs to #25 and rate limiting remains Slice2.
