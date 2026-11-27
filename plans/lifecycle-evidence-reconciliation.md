---
status: in-progress
depends: [workspace, workspace-browser-regression, gemini-live-probe]
specs:
  - specs/behaviors/service-regression.md
  - specs/behaviors/conversation-lifecycle.md
issues: [25]
---

# Plan: Reconcile delivered text lifecycle evidence

## Scope

Map #25's remaining acceptance wording to the already merged text/browser/service checks and their actual recorded verification. Correct active references to superseded Vapi #23. This is a documentation and acceptance reconciliation; no runtime behavior, tests, credentials or provider resources change. Full Gemini voice and production requirements remain owned by #40/#24/#25/#26.

## Implements

The service-regression specification's separation of deterministic signed-session/browser evidence, real Clerk/provider acceptance and deferred voice/deployed proof. Preserve the lifecycle's account ownership, ordered durable history, replay/context and honest failure boundaries without inventing additional passes.

## Approach

1. Audit #25's eight acceptance clauses against the merged workflow, actual test assertions and frozen verification records. Preserve completed predecessor plans.
2. Pin the source and recorded evidence separately. Check whether application/service/script/workflow source changed after the exact PR #39 functional verification pin; do not call a documentation-only audit a fresh runtime execution.
3. Record an acceptance matrix with exact commands/source references, the narrow standalone text lifecycle criterion and each mixed voice/security/live criterion's remaining owner. Distinguish synthetic session inputs and actual backend signature checks from real Clerk sign-in.
4. Correct active documentation references to #40 and link the matrix from the workspace/regression guides. Keep historical references in completed plans unchanged.
5. Run scoped Markdown, relative-link, diff and plan checks. Root arranges independent model review, issue reconciliation and any publication/merge. The central ignored journal stays outside this worktree and Git.

## Validation

- [x] All eight #25 acceptance clauses map to concrete commands/source and recorded evidence with remaining scope explicit.
- [x] Synthetic signed-session automation and real Clerk/provider observations remain separate; no new live or deployed pass is claimed.
- [x] Active workspace/regression documentation points to #40; completed predecessor plans are unchanged.
- [ ] Scoped Markdown, links, diff and plan checks pass; independent review clears the exact source.
- [ ] The issue-reconciliation handoff identifies the delivered standalone text clause and preserves unfinished voice/security/full-lifecycle acceptance with the actual hosted-CI waiver status.

## Risks / unknowns

Recorded evidence is time/source scoped. The deterministic browser does not automate Clerk-hosted sign-in UI; manual real-Clerk evidence cannot turn that fixture into a hosted-provider E2E. Mixed criteria cannot become complete merely because their text clauses pass. Registry findings can change. No missing credential authorizes bypassing production authentication or purchasing access.

## Notes

At this audit, runtime/script/workflow source at merged main `6ed523c762545622204d1c352eae0e0ab00145e9` is unchanged from PR #39 functional verification `407f8499362f78245da0ce1f3b0016e4942b2aba`. The existing frozen plans preserve actual prior results. This plan does not add speculative runtime tests to make a documentation PR appear functional.

## Follow-ups

- Deferred to [gemini-live](gemini-live.md) — use the reconciled text/authentication baseline while completing actual Gemini audio, authoritative transcript mapping, transactional persistence/recovery and application voice smoke under #40. The planned Gemini record absorbs that requirement in the same commit.
- Issue [#25](https://github.com/justin212407/Conversations/issues/25) — final combined voice/text acceptance after the voice feature, with hosted execution status reported honestly.
- Issue [#26](https://github.com/justin212407/Conversations/issues/26) — production deployment/cutover evidence after its prerequisites; this local evidence audit is not deployment.
