# Service regression gates

These gates cover the merged PostgreSQL/API/text-worker/realtime/diagnostics foundation. They do not claim real Clerk workspace sign-in, browser acceptance, Vapi calls or deployed HTTPS. Those remain #22, #23, #25 and #26. The owner has temporarily waived hosted Actions execution because account access/billing is unavailable; a local pass is recorded as local evidence only.

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
pnpm dependencies:audit
```

Focused service tests and process smoke use PostgreSQL/Redis at their documented loopback defaults or explicit `TEST_DATABASE_URL` / `TEST_REDIS_URL` test overrides. PostgreSQL must permit creating isolated temporary databases. Package integration tests run serially, including separate test files, to avoid resource-related timeouts. The existing service workflow supplies fresh PostgreSQL17 and Redis7.4 services for those focused tests.

`services:regression` instead owns a fresh Docker stack and needs no existing database or app `.env`. It builds the normal services image, mounts an explicit test-only worker entrypoint, verifies actual API/realtime startup and real synthetic RSA Clerk signature validation, and executes the application-owned provider interface deterministically. That provider has no production selector and is excluded from normal images. No Google, Clerk, Vapi or Railway credential is needed and no model credits are consumed. Public package/image pulls may require network access.

## What the container gate proves

The verifier checks streaming, durable success, replay without duplicate provider execution, service restart/reopen and exact completed-context fingerprints. It then checks persisted failure discovery, controlled retry preserving the original user, realtime restart/reconciliation, cross-account denials, expired/pending/invalid authentication and separate metrics credentials. Actual JaegerV3 spans must show the eight causal stages across three services with parent/failure evidence; Prometheus must scrape three healthy targets. SQL and counters check domain identities alongside telemetry. Transcript/credential/ticket canaries must stay out of diagnostic captures. Collector outage must preserve domain completion and readiness; service exits and socket cleanup are checked.

Every invocation generates unique project/volume/network/queue names, reserved loopback ports and signing/internal/metrics/database credentials. The private temporary directory is 0700; keys/configs are 0600. Only the public test fixture copy is 0644 so image UID 1000 can read it on CI hosts with another UID. All private fixtures remain outside Git and build context. Existing root/app environment files and `.local-observability/prometheus.yml` are never loaded or overwritten.

The command prints one allowlisted JSON result with stage, fixed failure code, safe counts, run-owned project name and cleanup status. Raw Compose output, keys, transcripts, exceptions, traces and rendered configuration are not printed or uploaded. Startup/build/assertion failures, deadlines and SIGINT/SIGTERM enter the same bounded cleanup path. Cleanup uses only the verified endpoint and exact project labels/tag; it never prunes host resources. A failed cleanup remains nonzero and its project identifier is retained for investigation.

For reproducible cleanup checks after startup:

```sh
pnpm services:regression --fault=after-up
pnpm services:regression --fault=signal-after-up
pnpm services:regression --fault=interrupt-after-up
pnpm services:regression --fault=startup-timeout
```

These commands are expected to fail (exit 1 for assertion/deadline,130 for signals) with `cleanup:true`. An unexpected zero exit or `cleanup:false` is a failure. External SIGINT/SIGTERM is also supported. Preserve unrelated sentinel resources/configuration while checking cleanup; never stop unrelated local services to make a run pass.

## Dependency audit and acceptance status

`dependencies:audit` runs free `pnpm audit --json --audit-level high` against the complete workspace dependency graph, including legacy frontend/widget dependencies. It returns 0 only for a valid scan without high/critical findings, 1 for findings and 2 for malformed/unavailable scans. Reports retain bounded package/advisory/severity/version/path metadata; registry errors never count as clean. No automatic fixes, blanket ignores, paid scanning or unrelated upgrades are used.

The first resumed local scan on 2026-11-06 reported 87 high and 10 critical vulnerability counts, with 180 advisory records (plus 17 low and 81 moderate counts). These are actual findings, not a passed gate; counts can change with registry advisories. #25 owns scoped remediation across the legacy/current graph and later frontend integration. Passing deterministic tests does not waive audit findings or establish that no new advisories were introduced. Hosted execution, actual browser/voice acceptance and production verification remain separately outstanding.

See [observability](observability.md) for operator configuration and [local services](development.md) for the development stack. The verifier deliberately bypasses operator configuration in favor of its own private scrape mount.
