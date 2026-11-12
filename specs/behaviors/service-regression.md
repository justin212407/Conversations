# Reproducible service regression gates

## Scope and principles

The repository provides repeatable local and pull-request gates for the implemented API, PostgreSQL, queue, text worker, realtime and diagnostics boundaries. Focused state/concurrency/authentication tests remain authoritative for their bounded cases; the container gate verifies composition and lifecycle across independently running services. Neither substitutes for the other.

Preserve the architecture's durable-history, personal ownership, explicit-provider and honest-evidence principles. The gate must detect lost context, duplicate turns, unsafe diagnostics and failed cleanup rather than obtaining a green result by weakening the public contract. Existing public API/socket/job/event compatibility and generation fencing remain intact.

Real workspace/browser and voice acceptance remain pending their merged feature prerequisites. Synthetic JWT verification is not a claim of live Clerk sign-in, and deterministic text execution is not real Vapi/Gemini smoke. Production deployment/cutover stays #26. The owner's hosted-CI exception permits reviewed local evidence while hosted execution is unavailable; no unavailable check is reported as passed.

## Local and CI commands

Documented repository commands cover frozen installation, service build/typecheck/lint, focused unit/database/API/queue/realtime tests, migration/process smoke, container lifecycle/diagnostics and dependency scanning. Heavy integration/container checks run with explicit serialization and deadlines appropriate to the local/CI resources. Migration tests use isolated storage, including clean setup and upgrade/consistency checks. Failures retain a nonzero exit and an identifiable bounded stage.

The pull-request workflow declares these service gates and uses isolated PostgreSQL/Redis for focused integrations. Container verification owns separate dependencies and requires no preexisting service stack. Node/pnpm versions and Docker/Compose prerequisites are explicit. Ordinary gates require no Clerk, Google, Vapi or Railway credentials, cloud signup, paid feature or owner browser state. Builds/installations may access public package/image registries; deterministic conversation execution does not call external providers.

## Local Docker precondition

Before any build/start/restart/stop/remove mutation, the container verifier establishes an available local Docker/Compose target. Inherited DOCKER_HOST/DOCKER_CONTEXT/TLS settings cannot silently redirect it to a remote daemon. Resolve and pin the intended endpoint independently of untrusted inherited variables; permit local Unix/npipe or verified loopback Docker Desktop endpoints and reject remote/ambiguous endpoints before mutation. Standard hosted runners' local daemons satisfy this rule.

Every mutation and cleanup uses that same verified target and a unique run-owned Compose project. An unavailable/unsupported/local-target failure is explicit; the verifier never provisions a remote daemon, changes global context or spends on a remote environment. Review the Docker mutation plan before executing the gate in a shared workspace.

## Isolation and private configuration

Each invocation owns unique project/volume/network identities, queue/Redis namespaces, available loopback ports, signing material, synthetic identities, internal realtime credentials, scrape credentials and trace IDs. No main/review project, host-wide resource, existing database or old Convex state is migrated, truncated, stopped or removed. Ports cannot fall back to the ordinary development stack's fixed bindings. Images/tags used or removed by a run are explicitly owned or treated as shared read-only cache; no global prune or unrelated tag replacement occurs.

Child processes receive a small documented environment allowlist plus generated test settings. The verifier never reads or loads the root .env, harness provider keys or app-local env files. Compose interpolation receives its own explicit private env/config source so automatic project .env loading cannot import real credentials. Operator configuration, including .local-observability/prometheus.yml, remains untouched: collector scrapes use a separate private run-specific mount.

Synthetic signing keys, tokens, rendered env/Compose/scrape files and raw diagnostic captures live only in an owned private temporary directory with restrictive modes, outside Git and image build context. Secret values are not command-line arguments. Console/CI artifacts contain only allowlisted stage/result/count/cleanup summaries or sanitized advisory metadata; raw failed logs, request/provider contents, private fixtures, exception messages/stacks and rendered secret configuration are never printed or uploaded.

## Explicit test provider boundary

Container execution uses the application-owned provider interface through an explicit test-only fixture entrypoint, not a production-selectable fake-success mode or a new product endpoint. The fixture refuses non-test use and is excluded from normal production startup/selection. It can be mounted privately for the test; it grants no authentication or ownership capability. Actual API/realtime entrypoints, Clerk signature verification, database migrations, queue fencing and common finalization/event transitions remain exercised.

The deterministic provider proves the exact completed context delivered to it without logging/transmitting that context as diagnostics. A successful response reflects a reproducible fingerprint of its ordered role/content input; a controlled midstream failure retains a safe partial/failed result. Controlled retry can then succeed against the original user turn. Provider invocation evidence is bounded and lets the gate distinguish replay from another execution. No test control selects an external model or consumes provider credits.

## Required container lifecycle evidence

A fresh signed synthetic account can create a conversation, obtain a scoped one-use ticket and submit text through actual HTTP. The shared browser connection/reducer boundary observes provisional streaming and terminal durable messages from actual realtime delivery. Exact request replay retains the same operation/user/assistant identities and executes the substitute once.

After disconnect/reopen and an actual owned service restart, authoritative snapshots/history retain exactly one completed answer. A subsequent prompt reaches the provider with the complete ordered prior completed context plus its current input exactly once. The gate compares the deterministic context fingerprint rather than accepting any nonempty answer. Cursor/state/recovery semantics remain those of the merged public contract.

A controlled provider failure becomes a persisted failed assistant/operation with a discoverable operation ID and safe failure code. Reloading history and retrying creates a new assistant/operation while retaining one original user message. Duplicate/replayed admission or retry cannot add another user/answer/provider execution. Focused tests continue to cover invalid jobs, leases, interrupted handoff, stale writes and detailed concurrency beyond this representative container path.

Missing/invalid/expired credentials and pending sessions are denied by real verification. Another signed account cannot read, mutate, snapshot or subscribe to the first account's conversation. Metrics credentials cannot authorize product/internal routes. Redis interruption or realtime restart loses continuity explicitly; the client obtains a fresh ticket and reconciles missed persisted state without duplicate/late-terminal regression.

## Diagnostics and privacy evidence

The optional collector path runs actual Jaeger and Prometheus with the reviewed bounded local configuration. Query Jaeger's supported V3 result format and require all implemented causal HTTP/admission/job-publication/execution/provider/finalization/event-publication/delivery stages across the three service resources. Validate meaningful parent edges and failed-stage status, not only a collector health response. Prometheus must report all three intended scrape targets healthy; protected metric text must contain the expected bounded outcomes and return active socket gauges to zero after cleanup.

Correlate SQL/state evidence for one operation, one job identity and one matching terminal event. Check replay and authoritative messages together with traces/metrics so successful telemetry cannot conceal duplicate domain work. Canary credentials, tickets, inbound baggage/tracestate, titles/transcript/output and raw provider errors must be absent from logs, exported traces, metrics and public summaries. Public event frames retain only allowed request correlation. Collector outage must preserve service readiness/domain completion and bounded graceful shutdown; missing samples during that outage are reported honestly.

## Cleanup and verifier failure behavior

Success, assertion failure, startup timeout, SIGINT and SIGTERM all enter one bounded idempotent cleanup path. Stop/drain owned work and remove only the run's containers/networks/temporary volumes/files and explicitly owned tags. Verify that owned runtime resources are gone; do not merely assume that a down command succeeded. Preserve unrelated sentinel resources/configuration while exercising failure and signal cleanup.

Cleanup failure or a daemon outage returns nonzero with a safe run/project identifier and fixed cleanup stage so an operator can find the remaining owned resources. Never fall back to global Docker/process/database cleanup. A cleanup deadline does not justify reporting a clean run. Focused harness tests cover environment/endpoint validation, ownership of generated commands/files, redaction, bounded failure classification and cleanup ordering; actual local evidence additionally exercises normal and interrupted/failed cleanup.

## Dependency scanning and required-gate reporting

A free repository-wide lockfile/dependency audit reports current advisories, affected package/version chains, severity and available fixes using safe bounded fields. The required threshold is high/critical; findings below it remain visible in the report. Scan the actual workspace graph rather than silently excluding legacy frontend/widget dependencies. A high/critical finding, malformed/unavailable registry response or scanner error remains nonzero and distinguishable from a clean report.

No automatic audit fixes, blanket ignores, ignore-registry-errors, unrelated upgrades or paid scanning are introduced to make the gate green. Record unresolved advisories and scoped remediation ownership; findings that depend on the pending frontend feature remain visible under #25. An audit failure is not a passing gate even when the independent test foundation can be reviewed separately. The runbook identifies required commands, their actual local results, the hosted-execution exception and remaining browser/voice/deployment evidence.

The audit adapter interprets the pinned pnpm 10.4.1 JSON result rather than treating every exit code 1 as a high/critical finding or registry failure. In JSON mode pnpm returns 1 for any reported vulnerability, including only lower severities, before applying the text-mode severity filter. A complete valid lower-only report may satisfy this repository's high/critical threshold while retaining those findings in its output. High/critical metadata or advisory records still fail the gate even if pnpm exits 0. Error/malformed reports, unsupported process exits and exit 1 with an empty zero-vulnerability report remain unavailable/nonzero. This does not permit ignoring registry errors, advisories, dependency owners or any severity required by the gate.

## Primary guidance

- [Docker Compose project names](https://docs.docker.com/compose/how-tos/project-name/) describe run isolation and explicit project precedence.
- [pnpm audit](https://pnpm.io/cli/audit) documents the free audit, severity threshold and nonzero findings/errors. Use options supported by the pinned pnpm version.
- [GitHub Actions secret handling](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) explains why command output and uploaded artifacts need explicit care even for generated test credentials.
