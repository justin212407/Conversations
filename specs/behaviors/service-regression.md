# Reproducible service regression gates

## Scope and principles

The repository provides repeatable local and pull-request gates for the implemented API, PostgreSQL, queue, text worker, realtime and diagnostics boundaries. Focused state/concurrency/authentication tests remain authoritative for their bounded cases; the container gate verifies composition and lifecycle across independently running services. Neither substitutes for the other.

Preserve the architecture's durable-history, personal ownership, explicit-provider and honest-evidence principles. The gate must detect lost context, duplicate turns, unsafe diagnostics and failed cleanup rather than obtaining a green result by weakening the public contract. Existing public API/socket/job/event compatibility and generation fencing remain intact.

The personal workspace has merged with separate real Clerk/Google evidence. Required portable browser automation must additionally exercise that workspace against the actual isolated services; a stub renderer or controller-only test does not establish this coverage. Synthetic JWT verification is not a claim of live Clerk sign-in, and deterministic text execution is not real Vapi/Gemini smoke. Voice acceptance remains dependent on its own provider capability and merged feature prerequisites. Production deployment/cutover stays #26. The owner's hosted-CI exception permits reviewed local evidence while hosted execution is unavailable; no unavailable check is reported as passed.

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

## Repository-owned workspace browser gate

A clean checkout provides a documented browser command using an exact repository-pinned Playwright library and its matching installed Chromium. Required local/CI evidence cannot depend on an unpinned global CLI, an external private driver, an already running app or an owner's browser/profile. Missing binaries or operating-system prerequisites fail explicitly. Public browser/package downloads are separate from deterministic runtime execution; no live account, Clerk/model/Vapi key, cloud or paid resource is required.

Keep two separately identified layers. The existing eight renderer checks cover older history, keyboard submission, failed response retry, uncertain delivery replay, rename, archive/unarchive, reconnect feedback and mobile navigation/composer. Their in-memory API/connection doubles remain renderer evidence. The service-backed browser layer exercises the shared production session/context orchestration, normal workspace screen/store, typed API client and shared connection/reducer with real browser fetch/WebSocket and actual isolated API, PostgreSQL, Redis, worker and realtime. It cannot replace these boundaries with a fixture API, socket or successful admission DTO.

The browser layer reuses the verified Docker/runtime orchestration and its isolation/cleanup rules. Its operations run in a separate fresh project from the foundation lifecycle, so the latter's fixed invocation/SQL/metric counts, collector-outage proof and graceful-shutdown assertions retain their meaning. A browser phase cannot contaminate those counts, weaken their checks or reuse a stopped foundation stack implicitly. Any shared orchestration extraction preserves the existing service command and fault behavior.

### Test identity and actual origin

A test-only UI adapter may supply freshly generated signed session JWTs through the existing getToken seam. Signing material stays in the driver; only scoped tokens reach its owned browser context. Actual backend Clerk SDK signature, issuer, authorized-party, completed-session and expiry verification remain in use. This adapter is not Clerk sign-in, a replacement Clerk protocol, a production auth flag or a new product route. Production Clerk integration and the already recorded real-user evidence stay distinct. The browser cannot establish production token-refresh/account-replacement behavior by separately recreating lifecycle glue. A minimal shared session/context module owns the same identity-keyed token source, token-callback refresh, stable store, start/stop lifecycle and subscription for both production and test inputs. Same-user token refresh retains draft, pending request identity and store; identity replacement stops the old connection, clears visible scope and fences late callbacks. The unchanged Clerk/Next adapter still supplies its normal identity/token/navigation and actual environment configuration. Strict API-origin validation remains before client/store creation, with no new production mode or fixture selector. The synthetic wrapper does not claim to verify Clerk hooks, sign-in screens or Next routing; build and separate real-user evidence cover those boundaries.

Discover the fixture listener's real ephemeral loopback origin before finalizing the private stack configuration. Configure that exact origin for API CORS, JWT authorized parties and realtime origin checks, and sign the matching azp. Browser requests and WebSocket handshakes use their native Origin; neither injected Origin headers nor a wildcard/relaxed production origin policy can make the check pass. Missing/invalid, expired, pending and wrong-authorized-party credentials fail actual verification. A valid foreign account cannot read or subscribe to another account's history or mutate its conversations.

### Required service-backed browser evidence

Create a durable conversation through normal UI actions. Observe provisional message.snapshot streaming from the actual realtime transport and then the authoritative completed answer with stable message/operation identities. A nonempty answer alone is insufficient: compare the deterministic worker's exact ordered role/content fingerprint.

Perform a full document reload, return to the list, reopen and continue with a second prompt. Wait for a fresh-document marker and reconciled account/history state rather than treating a navigation acknowledgement as a new document. Original message IDs/content/order remain stable and unique; the second answer proves the full prior completed context plus its new input exactly once.

Trigger the existing test provider's controlled failure through normal submission, reload persisted history, discover the failed operation and use the visible retry control. A successful retry retains the original user, creates only the expected new operation/assistant and preserves the safe partial/failed result. Real counters and stored identities distinguish a retry from duplicate execution.

For uncertain delivery, first forward the real browser request and verify the actual server accepted and committed its admission. Only then withhold its acknowledgement. A simulated local rejection before the request reaches the server is insufficient. Reload the document with its normal session storage, recover the same account/conversation-scoped intent and UUID, and use Check delivery. The replay returns the same admission identities; SQL/history and provider invocation evidence prove one user, one admitted operation and one execution. The gate never fabricates the upstream response or selects a fresh UUID to recover an uncertain send.

Account/session replacement stops the old store/connection and clears visible old history, drafts and pending/admission state before another owner loads; retained unresolved storage remains scoped to its original internal account. Foreign and rejected-session cases expose the normal unavailable/session-repair states without old content. A real realtime interruption must be visible, then acquire a new ticket and reconcile a missed persisted change after restart, without duplicate or late-terminal regression. Flipping a fixture phase flag does not prove reconnect.

Text browser cases request no microphone access and produce no unexpected page error, external product/provider request or horizontal overflow. Existing renderer coverage remains separate even where it checks the same UI controls.

### Browser privacy and owned cleanup

Browser console/network payloads, tokens, socket/control URLs, screenshots, traces, stacks and synthetic transcript captures are private run data. Keep any bounded raw captures only in owned 0700/0600 locations outside every Git checkout and image context; never upload them as CI artifacts or print them in assertion/tool output. Public results contain only allowlisted stages, fixed failure classifications, counts/booleans and cleanup status. No production debug endpoint is added for inspection.

Ambient browser-tooling debug settings cannot bypass that boundary or open an unowned capture file. Reject unsafe debug controls before the first tooling import, both through the repository command and direct owned-browser helpers, without printing their values.

Include browser-generated credential, ticket, title, input/output and error canaries in actual application log/trace/metric privacy checks while collectors are running. Reuse the existing real browser diagnostics-policy fixture with its in-memory receiver to prove exported frontend envelopes reject dynamic private fields; it must not contact a real DSN or turn a disabled SDK into a claim of enabled-path privacy. Provider output fingerprints are private too.

Every invocation owns its browser process, contexts/pages, HTTP fixture server, profile, control connection and files. Validate a short external temporary location before launching; reject inside-Git/build-context/symlink aliases and handle overlong socket/profile paths explicitly. Never reuse owner authentication/profile files. Use supported public process/close/kill lifecycle APIs, bounded waits and verified owned termination; disconnected automation is not proof the browser exited.

Normal success, assertion failure, SIGINT, SIGTERM and deadline share an idempotent cleanup path that closes browser work and its server/profile and also completes Docker cleanup. Track every result: browser/server/profile cleanup failure makes the overall result nonzero with cleanup:false even when Compose down succeeds. Failure in one cleanup step cannot skip the other owned cleanups. No global process kill, Docker prune or unrelated resource deletion is allowed. Meaningful bounded tests and actual owned-browser fault runs cover all five paths and preserve unrelated sentinels.

These deadlines and cancellation rules also govern fixture bundling and listener startup before a browser or Docker handle exists. Interrupted preparation must terminate and join its owned work before private files are removed; it cannot later create a listener or recreate deleted output. An unverified writer keeps its private directory retained and makes cleanup fail. A detached cleanup rejection must remain observed until the aggregate cleanup result records it.

## Frontend workflow and evidence reporting

Required pull-request configuration adds frontend unit, type, lint and clean synthetic-config production build checks, installs the pinned Chromium/system prerequisites on an explicit supported Linux runner, and executes both renderer and real-service browser layers. Serialize heavy service/frontend/browser work with explicit job dependencies and per-stage/overall deadlines; retain existing service, legacy, audit, container and diagnostic gates. A new browser dependency must retain the tested compiler split, exact existing patches and zero high/critical audit threshold.

Ordinary CI reads no root/app env file or owner credential, mounts no private live fixture and uses no account signup. Public configuration substitutes are build-only and cannot authenticate to a live backend. Hosted access/billing unavailability remains an explicit waiver, not a hosted pass. This stage establishes portable deterministic workspace coverage; real Clerk sign-in, real model/Vapi calls, full voice lifecycle and production deployment retain their separate acceptance evidence and owners.

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

- [Playwright CI guidance](https://playwright.dev/docs/ci) documents browser/system installation, serialized workers and an overall timeout before a job-level cutoff.
- [Playwright browser installation](https://playwright.dev/docs/browsers) ties browser binaries to the installed library and documents Chromium/system dependency installation.
- [Playwright BrowserServer](https://playwright.dev/docs/api/class-browserserver) exposes supported process, graceful close and awaited kill APIs; its control endpoint remains private.
