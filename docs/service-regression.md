# Service regression gates

These gates cover the PostgreSQL/API/text-worker/realtime/diagnostics foundation and the browser workspace against isolated actual services. Synthetic identity and deterministic provider fixtures require no cloud credentials. Actual Clerk sign-in evidence remains separate; Vapi voice and deployed HTTPS remain #23/#26. The owner has temporarily waived hosted Actions execution because account access/billing is unavailable; a local pass is recorded as local evidence only.

## Prerequisites and commands

Use Node.js 22, pnpm 10.4.1, Docker Engine/Desktop and Docker Compose >=2.24.4. The container command resolves the selected Docker context with inherited Docker overrides removed, verifies a local Unix/npipe endpoint or loopback Docker Desktop endpoint, and pins every command/cleanup to that endpoint. Remote contexts fail before any mutation. It never changes the global context.

Run the following from the repository root in order:

```sh
pnpm install --frozen-lockfile
pnpm services:build
pnpm services:typecheck
pnpm services:lint
pnpm services:gate-lint
pnpm services:gate-test
pnpm services:test
pnpm services:smoke
pnpm services:regression
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm workspace:browser-install
pnpm workspace:regression
pnpm workspace:browser-test
pnpm dependencies:audit
```

Focused service tests and process smoke use PostgreSQL/Redis at their documented loopback defaults or explicit `TEST_DATABASE_URL` / `TEST_REDIS_URL` test overrides. PostgreSQL must permit creating isolated temporary databases. Package integration tests run serially, including separate test files, to avoid resource-related timeouts. The existing service workflow supplies fresh PostgreSQL17 and Redis7.4 services for those focused tests.

`services:regression` instead owns a fresh Docker stack and needs no existing database or app `.env`. It builds the normal services image, mounts an explicit test-only worker entrypoint, verifies actual API/realtime startup and real synthetic RSA Clerk signature validation, and executes the application-owned provider interface deterministically. That provider has no production selector and is excluded from normal images. No Google, Clerk, Vapi or Railway credential is needed and no model credits are consumed. Public package/image pulls may require network access.

## What the container gate proves

The verifier checks streaming, durable success, replay without duplicate provider execution, service restart/reopen and exact completed-context fingerprints. It then checks persisted failure discovery, controlled retry preserving the original user, realtime restart/reconciliation, cross-account denials, expired/pending/invalid authentication and separate metrics credentials. Actual JaegerV3 spans must show the eight causal stages across three services with parent/failure evidence; Prometheus must scrape three healthy targets. SQL and counters check domain identities alongside telemetry. Transcript/credential/ticket canaries must stay out of diagnostic captures. Collector outage must preserve domain completion and readiness; service exits and socket cleanup are checked.

Every invocation generates unique project/volume/network/queue names, reserved loopback ports and signing/internal/metrics/database credentials. The private temporary directory is 0700; keys/configs are 0600. Only the public test fixture copy is 0644 so image UID 1000 can read it on CI hosts with another UID. All private fixtures remain outside Git and build context. Existing root/app environment files and `.local-observability/prometheus.yml` are never loaded or overwritten.

Inherited temporary roots are resolved before writing any fixtures. A root inside the build context or a Git checkout, including a symlink alias, is rejected. Command deadlines terminate owned process groups on POSIX (or use the owned process tree on Windows) and bound captured-pipe settlement so a descendant cannot prevent cleanup. Local verification covers Linux; Windows process-tree behavior has not been exercised locally.

The command prints one allowlisted JSON result with stage, fixed failure code, safe counts, run-owned project name and cleanup status. Raw Compose output, keys, transcripts, exceptions, traces and rendered configuration are not printed or uploaded. Startup/build/assertion failures, deadlines and SIGINT/SIGTERM enter the same bounded cleanup path. Cleanup uses only the verified endpoint and exact project labels/tag; it never prunes host resources. A failed cleanup remains nonzero and its project identifier is retained for investigation.

For reproducible cleanup checks after startup:

```sh
pnpm services:regression --fault=after-up
pnpm services:regression --fault=signal-after-up
pnpm services:regression --fault=interrupt-after-up
pnpm services:regression --fault=startup-timeout
```

These commands are expected to fail (exit 1 for assertion/deadline,130 for signals) with `cleanup:true`. An unexpected zero exit or `cleanup:false` is a failure. External SIGINT/SIGTERM is also supported. Preserve unrelated sentinel resources/configuration while checking cleanup; never stop unrelated local services to make a run pass.

## Browser layers and authentication boundary

`workspace:regression` reuses the same owned Compose/runtime modules with a separate fresh project, preserving the foundation's fixed operation, SQL, trace, collector-outage and shutdown assertions. Run both commands. The first browser layer retains eight renderer flows with stubbed transport. The second runs the real shared production session provider, store, API client, native browser fetch/WebSocket, API, PostgreSQL, Redis, worker and realtime services. The fixture supplies only identity, token, navigation and configuration inputs; the Clerk/Next adapter and its live sign-in are outside this synthetic proof. No production test-auth switch or extra application route is introduced.

Fresh generated RSA tokens go through actual backend Clerk signature, status, expiry and authorized-party checks. The browser uses its real ephemeral loopback origin; that exact origin is the test stack's CORS/authorized-party configuration. No Origin spoof, wildcard production origin or live Clerk key is used. Full-document reloads must have a new document marker. Completed message identities and order, the second prompt's complete context fingerprint, streaming before durability, controlled failure/retry and real realtime restart/reconciliation are asserted.

For lost acknowledgement, the harness first observes an actual 202 from the real server and verifies committed operation/user/assistant/job identities in PostgreSQL, then aborts delivery to the browser. A fresh document discovers and replays the persisted UUID; final SQL/event identities and the protected provider counter must prove one execution. Same-user token refresh retains the actual store, draft and pending UUID. Identity replacement holds a real old account list response until after the new empty scope, then releases it and verifies fencing. The active old document's socket must close and the actual realtime connection gauge must reach zero while the next identity's token is held. Foreign, invalid, expired, pending and wrong-party access is denied through actual browser requests.

Browser title/input/output/token/ticket canaries are scanned in actual service logs, protected metrics and parsed Jaeger V3 spans correlated to the browser's operations under the worker resource. A successful HTTP body containing a span name is insufficient. The real Next browser Sentry SDK and production privacy policy also run with an in-memory envelope receiver; server-only synthetic credentials stay in Node. The cumulative microphone counter is installed before application startup and survives all documents in its browser context. Neither layer may request owner audio.

## Browser prerequisites, ownership and faults

The repository pins the Playwright library and core to 1.65.0; `workspace:browser-install` downloads its matching Chromium. The required gate never uses a global CLI/browser or an owner profile. Local verification targets Linux/Node 22. CI uses Ubuntu 24.04 and `playwright install --with-deps chromium`; Linux system libraries need operator installation on other hosts. Windows browser/process-tree behavior is not locally verified. Use a short validated temporary root such as `/tmp` on POSIX: Playwright's profile/socket path is bounded, and a temporary root longer than 40 bytes is rejected before launch. Git/build-context temporary roots remain forbidden.

The fixture HTTP listeners, Chromium child, fresh profile, BrowserServer control connection/listener and Docker resources all join the same cleanup result. Playwright's automatic signal handlers are explicitly disabled so the runner owns SIGINT/SIGTERM and always reaches Docker cleanup. Process exit alone is insufficient: the public control endpoint is checked for TCP closure without printing its URL. A browser/server cleanup failure remains nonzero even when Docker cleanup succeeds. Reservation, Docker down, each resource inventory, image removal and private-file cleanup are attempted independently; a failed step cannot skip the others.

Raw console/network captures and screenshots stay in a 0700 run directory with 0600 capture files outside Git/build context. They are never uploaded as CI artifacts or printed, and normal cleanup removes them. Only allowlisted stage/count/cleanup summaries go to the terminal.

```sh
pnpm workspace:regression --fault=browser-after-launch
pnpm workspace:regression --fault=browser-deadline
pnpm workspace:regression --fault=browser-sigint
pnpm workspace:regression --fault=browser-sigterm
```

Each fault is injected only after the owned browser is actually live and must return nonzero with `cleanup:true`. `workspace:browser-test` checks all four serially, plus actual microphone accounting across reload and the real Next SDK fixture. It also uses a bounded child wrapper: a five-minute setup budget, eight-minute process deadline and three-minute termination grace fit inside each twelve-minute test. The shared Docker cleanup budgets total at most 120 seconds for down, three inventories and image inspection/removal; browser launch settlement/close/control verification and fixture teardown have their own bounded operations. The normal runner allows 25 minutes; the hosted frontend job allows 100 minutes for the serial build/browser/fault workload. These limits do not turn failed cleanup into success.

The frontend Actions job follows the foundation job to avoid overlapping heavy containers/builds. It includes frontend units/type/lint, a production Next build with synthetic public configuration, browser installation, both labelled browser layers and ownership/fault checks. The foundation keeps its service/legacy/audit coverage and adds the existing actual-controller integration check. Hosted execution remains waived for account billing; local results must not be described as a hosted pass.

## Dependency audit and acceptance status

`dependencies:audit` runs free `pnpm audit --json --audit-level high` against the complete workspace dependency graph, including legacy frontend/widget dependencies. It returns 0 only for a valid scan without high/critical findings, 1 for findings and 2 for malformed/unavailable scans. Reports retain bounded package/advisory/severity/version/path metadata; registry errors never count as clean. No automatic fixes, blanket ignores, paid scanning or unrelated upgrades are used.

The wrapper applies that threshold to the complete validated JSON report. Pinned pnpm 10.4.1 returns raw exit 1 for any JSON-mode vulnerability, including low/moderate findings; its severity filter applies only to text output ([pinned implementation](https://github.com/pnpm/pnpm/blob/v10.4.1/lockfile/plugin-commands-audit/src/audit.ts#L234)). A valid lower-only report therefore passes the repository threshold while preserving its counts/advisories. High/critical evidence still fails regardless of raw exit 0 or 1; malformed/error reports, unsupported exits and an unexplained exit 1 with an empty zero-vulnerability report remain unavailable/nonzero.

The first resumed local scan on 2026-11-06 reported 87 high and 10 critical vulnerability counts. PR #36 reduced these to two high findings; [PR #38](https://github.com/justin212407/Conversations/pull/38) completes the patched schema/legacy compatibility stage. Its fresh full-workspace scan passes the required threshold with **0 high / 0 critical**, retaining **26 moderate / 5 low** and all 31 advisory records. No importer exclusion, advisory ignore or vulnerable compatibility-parser fallback is used. Counts can change with registry advisories; rerun the actual gate rather than treating this observation as permanent.

See the [schema/legacy evidence](dependency-security-schema-evidence.md) for exact resolutions, actual artifact/type/compatibility checks and inherited UI/widget limitations. The browser commands and workflow provide the portable browser gate; full voice/lifecycle acceptance, hosted execution and production deployment remain separately outstanding under #25/#23/#26.

See [observability](observability.md) for operator configuration and [local services](development.md) for the development stack. The verifier deliberately bypasses operator configuration in favor of its own private scrape mount.
