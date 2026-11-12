# Schema and legacy AI compatibility mapping

This accepted mapping is implemented in the second security stage after PR #36 merged as 55f4258 and PR #37 merged as 6234559. Root accepted the concrete provider/storage/recovery mapping before repository migration, then separately accepted URL normalization, the exact Undici edge and the declaration-only Agent patch. A clean frozen install and the portable compatibility gates now pass. The observations below use published artifacts or isolated synthetic fixtures, with no private application configuration, provider request, Convex deployment or data access. Final isolated lifecycle/browser evidence is tracked in the active plan and companion evidence record.

## Selected supported family

| Package                | Selected version | Confirmed constraint                                                              |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------- |
| zod                    | 4.6.7            | Patched v4 parser; first patched release 4.6.6                                    |
| @convex-dev/agent      | 0.2.12           | AI ^5.0.29; provider-utils ^3.0.7; existing Convex ^1.23/helper ^0.1.103 families |
| ai                     | 5.0.285          | Zod ^3.25.76 or ^4.1.8; published internal schemas import zod/v4                  |
| @ai-sdk/provider-utils | 3.0.44           | Same Zod peer; v4 conversion dispatches to patched v4 parsing                     |
| @ai-sdk/google         | 2.0.108          | Same Zod peer; Google .chat remains exported; internal schemas import zod/v4      |
| @ai-sdk/openai         | 2.0.140          | Same Zod peer; OpenAI .chat remains exported                                      |

All six downloaded artifacts passed their published SHA-512 integrity checks. A separate private no-scripts install runs this exact coherent family. Existing Convex 1.42.0, helpers 0.1.119 and React 19.2.4 remain supported; helper Zod peers already permit v4. AI 5's published graph removes the AI 4/jsondiffpatch consumer through an upstream-supported replacement, with actual synthetic generation/stream verification. Keep root/services TypeScript 5.9.3 and backend/math 6.0.3 unchanged.

Provider-utils retains unused v3 compatibility dispatch/conversion support. The implementation constructs application/provider schemas on patched v4 and tests the published v4 conversion path; it does not use zod/v3 as a replacement parser. The fresh complete-workspace scan passes with zero high/critical findings; lower severities remain visible. Portable tests exercise the actual patched parser and conversion paths.

## Actual component storage proof

Compared the installed published agent 0.1.16 schema with the integrity-verified 0.2.12 component, loading their real Convex validators offline. All 17 old table validators are included by the candidate under 646 recursive structural comparisons: threads, messages, streamingMessages, streamDeltas, memories, files, ten embedding-dimension tables and apiKeys. Every database/search/vector index is unchanged. The comparison rejects removed fields, narrowed unions, newly required fields, changed ID tables and unsupported validator kinds; it does not merely compare type names or assert a success flag.

Existing deprecated message/thread fields remain accepted. New stream format and result metadata are optional; stream delta validation broadens. Old tool-result result/isError and prompt/completion/total token metadata remain readable. Validator inclusion establishes storage compatibility, not universal model-context conversion; provider behavior is checked separately below. The upstream tagged changelog independently declares data-at-rest backward compatibility. No stored-record migration is required by this observed mapping, and no data/schema/codegen/deployment command was run. Retain a reproducible baseline validator fixture and synthetic old message conversion regressions in the implementation PR.

## Minimal application adaptations

| Boundary                                  | Current behavior to preserve                                                           | Proposed adaptation                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current shared/browser IDs                | Broad canonical hexadecimal UUID spelling, no implicit RFC variant/version restriction | Shared v4-backed application UUID schema reused by shared contracts and workspace API/pending validation                                                           |
| Shared event sequence/revision/checkpoint | Existing Number.isInteger acceptance plus current sign/limit rules                     | v4-backed integer predicate instead of the new safe-integer-only primitive; bounded config integers remain unchanged                                               |
| Shared/browser UTC timestamps             | Valid HH:mmZ and HH:mm:ss[.fraction]Z                                                  | Union of patched v4 UTC datetime validators for minute and second precision                                                                                        |
| Objects/config/forms                      | Strict unknown-field behavior, defaults/coercion, safe field-name errors               | Preserve existing shapes/refinements; no blanket codemod, raw issue logging or provider error changes                                                              |
| Agent construction                        | Same Gemini model and instructions                                                     | chat becomes languageModel; provide stable required agent name support                                                                                             |
| Thread/greeting/generation/list           | Same createThread, saveMessage, prompt call and raw paginated query interface          | Keep the existing public calls and raw query DTO; add bounded pending recovery before generation and a Google-specific context hook; no listUIMessages replacement |
| Widget message rendering                  | Exact old text, role/order and group final-message ID                                  | App-owned narrow display projection over raw MessageDocs; keep useThreadMessages and existing pagination                                                           |
| Major-family peers                        | Existing legacy capability on supported peers                                          | Pin coherent AI/provider-utils owners for backend/widget; all direct Zod owners resolve to patched v4                                                              |

## Observed compatibility fixtures

Eight synthetic old documents exercise repeated identical user messages, assistant/tool/result/final grouping, failed, pending-without-message and empty assistant records. Seven records containing a message convert through the candidate published model-message validator/serializer. Generation and streaming both return the expected synthetic output through the actual AI 5/mock-model interfaces. Published provider-utils converts a strict v4 schema, accepts its valid fixture and rejects an unknown field. A clean-environment rerun blocks all network access; observed network/provider requests are zero.

The old display helper emits the grouped assistant ID final with 11 concatenated text characters; the new upstream helper emits ID call with 12 characters after injecting a space. Repeated identical user IDs remain distinct in both. The application-owned display seam preserves the old projection exactly instead of accepting those implicit UI changes. Regression fixtures cover tool groups, parts/metadata, failure/streaming state, empty rows and ordering against the old baseline.

A 39-case public primitive comparison finds five differences requiring preservation: two non-RFC UUID spellings, two integers above the safe-integer interval and one valid timestamp without seconds. Sampled valid/invalid email and URL forms match; actual configuration/default/coercion and form integration still require implementation gates. Preserve unknown-field rejection and public error shapes throughout.

## Actual registered Agent/component and provider proof

The stronger fixture uses the actual old and candidate Agent classes and registered published Convex components through real in-memory action/query/mutation contexts, rather than a fake storage implementation. It runs exact existing Convex 1.42.0 with convex-test 0.0.54 (the newest release whose declared peer supports 1.42), current compatible Vitest 5.1.0 and edge VM 5.0.0. Root explicitly selected the supported runtime match over the newest convex-test release, whose peer requires Convex 1.43. No Convex minor change, unsupported peer override or remote command is needed.

An actual thread/greeting save followed by 115 seeded old rows yields 116 baseline rows. The old, unadapted candidate and proposed compatible paths each select exactly 100 successful records in the same descending seed order, apply the same orphan filtering, preserve repeated identical turns and media bytes/MIME, and include the current prompt exactly once. Each successful call adds exactly one user and one final assistant. The candidate assistant retains its actual pending ID at completion. Historical fields/IDs/content remain unchanged apart from the same pre-existing pending-to-failed/Restarting transition performed by the baseline. Strict assertions inspect actual component queries, results and stored rows; no success flag substitutes for these checks.

Actual Google 1 versus Google 2 request builders run behind synthetic fetch handlers with external network blocked. Canonical prompt contents and system instructions match after allowing only Google 2's additive explicit tool call/response IDs. Google 1 did not forward stored reasoning/signatures/redacted details, tool isError or experimental rich tool content; those fields remain stored/readable and are not inferred or fabricated. Google 2 would newly forward reasoning. A small configured-Google contextHandler omits reasoning parts, preserving the old prompt behavior while retaining the SDK's default context ordering/selection. Existing tool response content, files/media and visible text remain unchanged. This makes a scoped configured-provider claim, not a universal lossless SDK conversion claim.

The default candidate without the compatibility hook demonstrably forwards extra reasoning; without explicit recovery it also leaves the old pending row unchanged. These negative controls prove why the implemented seams are needed. The compatible path keeps automatic SDK context selection and normal prompt-only storage; it does not pass historical messages as new inputs, reload/reconstruct context from text or IDs, or resave history.

### Explicit bounded recovery and retry outcome

The supported candidate bulk-failure operation handles at most 100 old pending rows per call, while the baseline collected them together. The compatibility wrapper therefore probes one pending row, drains successive empty saveMessages calls with failPendingSteps enabled, and re-probes before generation. It permits at most ten mutation batches (1,000 rows), eleven one-row probes and a five-second recovery admission budget checked before and after every awaited internal RPC. In-flight RPCs are awaited; they are not raced into background writes. An over-budget result prevents model admission even if the last internal call completed late.

This is an explicit bounded recovery contract rather than a claim that the upstream 100-row behavior is identical. If recovery is incomplete, the legacy action returns safe RECOVERY_INCOMPLETE and requires an explicit new call. Existing successful history is never resaved, and the current prompt has not yet been admitted: this wrapper precedes Agent.generateText, and the earlier public legacy action only checked authorization/conversation state. The primary PostgreSQL REST operation/admission path is unaffected.

Actual registered-component fixtures prove the boundaries:

- 101 old pending rows recover in two batches before one normal prompt/assistant pair; original IDs/content remain unchanged except the expected pending-to-failed fields.
- 1,001 pending rows stop after ten batches with one remaining. Before explicit retry, synthetic model requests and current prompt writes are both zero.
- A separate explicit bounded call drains that remaining row and produces exactly one current user/assistant pair overall, with zero remaining pending rows. This is caller-initiated retry, not an automatic model retry.
- A monotonic test clock reaches the five-second budget after one actual batch. The operation stops with one remaining pending row, zero model requests and zero prompt writes; only the expected completed recovery updates occurred.

All these fixtures execute actual component storage and SDK/model conversion code. They do not access deployed data, real accounts, provider keys or a model endpoint. The implementation must retain these meaningful regressions and safe bounds.

## Verification before acceptance

The accepted mapping is implemented only at the owned package/schema/widget/agent seams, with public validation/resource-bound and component/model/display compatibility regressions. Final affected local/integration/container/browser evidence remains tracked by the active plan. The original stage 1 baseline was 104 checks before the separately merged frontend security work; current gate counts are reported individually. Shared UI's inherited 23 diagnostics and widget's inherited TS2367 remain visible. Final acceptance requires a valid whole-workspace scan with zero high/critical findings; no ignore/exclusion/parser shortcut is authorized. Hosted billing CI remains waived, and no deployment or live provider proof is claimed.

## Primary references

- [Tagged agent 0.2.12 changelog](https://github.com/get-convex/agent/blob/v0.2.12/CHANGELOG.md) records backwards-compatible data at rest and UI/API changes.
- [AI SDK 5 migration](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0) explains model/UI message and provider changes.
- [Zod 4 migration](https://zod.dev/v4/changelog) documents UUID, safe integer, defaults and error differences.
- Exact package manifests/source came from the [public npm registry](https://registry.npmjs.org/), with published integrity verification. Candidate metadata establishes supported ranges; actual fixtures establish behavior.

## Scoped AI download edge

The inspected provider-utils 3.0.44, 3.0.45 and 3.0.46 manifests all declare Undici `^5.29.0`. That supported patch family therefore still resolves five high Undici advisories and the high Busboy advisory through Undici 5.29.0. The exact override `@ai-sdk/provider-utils@3.0.44>undici: 6.29.1` is intentionally outside the parent range; it does not replace unrelated Undici consumers.

Undici 6.29.1 publishes a CommonJS `index.js`, no runtime dependencies and Node >=18.17, compatible with the verified Node 22.18.0 toolchain. Provider-utils' real Node path uses `createRequire("undici")`, `Agent({connect:{lookup}})` and `fetch(..., {dispatcher})`; those interfaces remain supported. The [official 6.29.1 release](https://github.com/nodejs/undici/releases/tag/v6.29.1) includes the function-valued Agent option cloning correction, so import/compile success alone is insufficient evidence.

The portable subprocess regression invokes the actual parent default fetch without injecting a fetch implementation. Synthetic DNS responses exercise the real validating lookup callback; only after successful validation does test transport route to an owned loopback HTTP server. Private and mixed public/private DNS answers cause no HTTP request. Public redirects work; private redirect targets, redirect overflow, oversized downloads and an actually reached hung path with a fired abort signal fail. Real Agent resources, sockets and server are awaited on cleanup; an outer child deadline detects leaked resources. No external or provider network request is permitted by this fixture.

Environment URL compatibility tests compare actual parsed output and interpreted endpoint/credentials. Patched trimming and tab/LF/CR normalization are deliberate; protocol, production TLS/origin and telemetry credential/query guards remain enforced. They do not promise byte-identical raw strings.

## Exact declaration-only Agent patch

The selected Agent 0.2.12 declaration intersects optional Config languageModel with a second required LanguageModel union. The installed AI gateway ID list makes that intersection exceed TypeScript's union limit even in a minimal program without application-generated modules. [Upstream issue 417](https://github.com/convex/agent/issues/417) identifies the same constructor design and the guard-preserving correction.

The exact pnpm package patch changes only the required field to `NonNullable<Config["languageModel"]>`: once in published TypeScript source and twice in its options/constructor declarations. It retains the optional Config field, existing provider union and all required options. Published runtime JavaScript remains byte-identical. No compiler downgrade, `any` facade, cast, suppression, generated edit or model-version widening is used to hide the error.

The portable compiler regression accepts the actual Google V2 model, context hook, gateway ID and a complete declared V2 shape. Six separate negative cases reject missing name/model, undefined model, wrong name type and complete V1/V3 shapes differing only in specificationVersion. Diagnostics must identify each case and the incompatible version fields, without missing-method or TS2590 substitutes. Tests live outside deployed Convex modules. The service Docker stage copies the public exact patch before its frozen install so package-manager metadata remains reproducible in that build context.
