---
status: in-progress
depends: [observability, frontend-security, workspace-browser-regression]
specs:
  - specs/behaviors/observability.md
  - specs/behaviors/dependency-security.md
issues: [24]
---

# Plan: Reject repaired backend transport configuration

## Scope

Close the independently reproduced backend URL-syntax gap under #24. Intentionally tighten the three transport fields' earlier normalization policy, while preserving patched database/Redis normalization, existing protocol/path and explicit private-network policies. Do not implement voice or claim deployed HTTPS/WSS/secret/runbook acceptance; #40 and #26 remain prerequisites for full issue closure.

## Implements

The observability security configuration's literal URL, secret-safe error and explicit local-versus-production transport rules. Root accepted this bounded scope before implementation. The frontend origin boundary is already strict and remains unchanged.

## Approach

1. Preserve a deterministic no-network regression against the actual `loadConfig` and `loadRealtimeConfig` call sites. Establish that repaired separators, empty credential/query/fragment delimiters and whitespace are currently accepted, before changing the implementation. Reconcile the current dependency-security spec and compatibility test for this explicit transport-policy amendment; keep database/Redis normalization and interpreted credentials intact.
2. Add one server-only parser seam for the three transport URL fields. Check raw syntax before WHATWG parsing, then retain the existing protocol, public path, internal root path, TLS and private-network checks. Do not apply this credential prohibition to PostgreSQL or Redis configuration.
3. Cover hostile syntax, both private-network overrides, valid HTTPS/WSS/IPv6/ports/paths and explicit development HTTP/WS. Ensure all errors exclude synthetic credential canaries and supplied URL values.
4. Document the deployment-readiness policy and safe local reproduction in the observability runbook. Keep configuration validation distinct from actual certificate/proxy/network enforcement and voice telemetry.
5. Run focused regressions, package build/type/lint and applicable prior runtime checks with isolated worktree outputs. Freeze the source for root's separate Command Code/model review and PR handling. Report each small change for the central ignored journal; never copy or commit it.

## Validation

- [ ] Actual backend config regression fails before the fix and passes afterward, without network, real environment files or provider access.
- [ ] All three transport fields reject repaired/credential/query/fragment/control syntax, including empty delimiters, with safe errors.
- [ ] Existing local HTTP/WS and production HTTPS/WSS, path, IPv6/port and distinct private-network policies remain intact.
- [ ] Focused tests, package build/type/lint, formatting and diff/plan checks pass with worktree-local outputs.
- [ ] Runbook records exact local evidence and remaining voice/deployment prerequisites; root reviews the scoped PR before merge.

## Risks / unknowns

WHATWG parsing normalizes some malformed inputs before parsed fields can reveal them. Raw syntax checks therefore precede parsing, while the existing separate domain/protocol policies remain authoritative. This change does not provide a TLS certificate, private network, deployed secret storage or product voice integration.

## Notes

Merged main `6ed523c` accepts actual production configuration such as an internal API URL with a repaired authority separator, empty userinfo and empty query/fragment delimiters, plus a collector URL with leading whitespace. The minimal feedback loop is the package's pure config functions, so no process/network instrumentation is needed. Existing production protocol rejection alone does not detect these repairs.

The prior dependency migration intentionally retained URL normalization, including a runtime compatibility case. The literal transport rule is an explicit security-policy amendment, not a claim that every previous normalization was unintended. Root accepted the current-spec reconciliation before that compatibility test changed; completed historical plans/evidence remain frozen. Voice #40 and deployed production #26 are pre-existing issue prerequisites, not omitted deliverables of this bounded fix.

## Follow-ups

None.
