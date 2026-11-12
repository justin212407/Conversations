# Patched schema and retained legacy dependency evidence

This stage implements the [accepted compatibility mapping](dependency-security-schema-mapping.md) after PR #36 and the frontend privacy PR #37 actually merged. It retains all current and legacy workspace owners, component data and application capabilities. It does not run Convex dev, generation, deployment or stored-data migration.

## Resolutions and contracts

| Owner or edge                          | Tested resolution                             | Compatibility boundary                                                          |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| All direct Zod owners                  | 4.6.7                                         | Patched v4 parser; shared broad UUID/integer/UTC contracts                      |
| Retained backend and widget Agent      | 0.2.12 with exact declaration-only pnpm patch | Existing component records/indexes and raw paginated MessageDocs                |
| AI / provider-utils                    | 5.0.285 / 3.0.44                              | Supported Agent peers; actual schema conversion and synthetic generation/stream |
| Google / OpenAI providers              | 2.0.108 / 2.0.140                             | Coherent AI 5 family; configured Google prompt policy preserved                 |
| `@ai-sdk/provider-utils@3.0.44>undici` | 6.29.1                                        | Exact reviewed out-of-range edge; guarded default fetch exercised               |
| Convex / convex-test                   | 1.42.0 / 0.0.54                               | Newest inspected test release whose peer supports the unchanged runtime         |
| Vitest / Vite / edge VM                | 5.1.0 / 8.3.6 / 5.0.0                         | Offline registered-component fixtures on Node 22                                |

Node 22.18.0 and pnpm 10.4.1 remain the tested toolchain. Root/services retain TypeScript 5.9.3; backend/math retain 6.0.3. No unsupported peer override, audit exclusion or legacy parser fallback is introduced. AI 5's installed shipped entrypoint has no jsondiffpatch consumer; the retained functionality moves to the supported replacement family.

The old public validator/index baseline and synthetic provider/display fixtures are committed as data, without installing the vulnerable old SDK family. Current registered-component tests prove the real supported Agent context, prompt/storage and recovery paths. Historical fields remain untouched except the expected pending-to-failed/Restarting recovery fields. Configured Google omits reasoning as before, while the raw historical reasoning/signatures remain stored and readable. This is not a claim of universal lossless conversion for unrelated providers.

Legacy pending recovery admits no current prompt/model until the final one-row probe is empty and the checked budget remains valid. Ten mutation batches, eleven probes and a checked five-second budget bound admission work. An awaited RPC can finish after the budget; subsequent generation then fails closed. A caller must explicitly retry `RECOVERY_INCOMPLETE`. Actual tests cover 101 pending rows, bounded failure at 1001, one-row convergence on a fresh call, unchanged historical IDs/content and exactly one new user/assistant pair.

The Undici child test exercises the actual parent default-fetch path with synthetic DNS and transport confined to an owned loopback server. The real lookup callback rejects private and mixed DNS answers before HTTP. Redirect, byte and abort bounds remain active. The outer deadline and awaited Agent/socket/server cleanup detect leaks. No real provider request is part of these tests.

Environment URL tests assert parsed output and effective endpoint/credentials, including patched trim and tab/LF/CR removal. Existing protocol, production TLS/origin and telemetry credential/query guards remain enforced. Raw configuration bytes are not promised unchanged.

The [upstream model-union declaration issue](https://github.com/convex/agent/issues/417) also affects this exact older Agent family with the current gateway ID list. A three-line source/declaration patch reuses the existing Config model union through NonNullable; runtime JavaScript is unchanged. Portable actual compiler tests accept Google V2, gateway IDs and a complete V2 model, and reject complete V1/V3 models plus four invalid required-option cases.

## Verification status

Final frozen-source verification and isolated container/browser evidence are being completed. The active [plan](../plans/security-schema-legacy.md) keeps its acceptance boxes unchecked until the corresponding evidence is available.

The full scanner must return a valid complete-workspace report with zero high/critical findings. Lower severities remain visible. pnpm 10.4.1 JSON mode exits nonzero for any vulnerability before its text-mode severity filter; the separately tested scanner correction applies the unchanged high/critical threshold to the complete validated report and preserves malformed/unavailable failures.

Shared UI's inherited 23 diagnostics and the widget's inherited TS2367 remain explicit baseline limitations. The current migration must introduce no additional diagnostics. Hosted Actions remain unavailable under the owner's billing-related waiver; local results do not imply a hosted or production pass. Voice provider capability, deployment and the rest of #25 acceptance are separate outstanding work.
