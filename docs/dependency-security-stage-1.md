# Compatible dependency security evidence

This is the bounded first stage of issue #25. It reduces the complete audit graph without claiming final security acceptance. The unchanged scanner still exits nonzero: **2 high / 0 critical, 27 moderate / 7 low**, compared with **87 high / 10 critical, 81 moderate / 17 low** before remediation. No new high/critical advisory IDs appeared in the actual scan. The remaining work belongs to [schema and legacy security](../plans/security-schema-legacy.md).

## Supported direct changes

| Consumer                      | Selected release / reason                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both Next apps                | Next 16.4.5; matching lint plugin 16.4.5; existing React 19 and Clerk APIs retained                                                                      |
| Workspace diagnostics         | Sentry 10.78.0; unchanged privacy hooks and disabled upload wrapper/tunnel                                                                               |
| Lint family                   | ESLint 9.39.5; typescript-eslint/parser/plugin 8.72.1                                                                                                    |
| Workspace CSS                 | PostCSS 8.5.32                                                                                                                                           |
| Shared UI tools               | shadcn 4.23.0 and @turbo/gen 2.11.10; preserve CSS export and generator capability                                                                       |
| Legacy Convex SDK             | Backend/widget 1.42.0, the first existing-major parent pinning patched ws 8.21.0; current agent/helper peers permit it, no component/source/data changes |
| Explicit backend schema peer  | Zod 3.25.76 preserves the previously installed AI 4 peer; an implicit peer otherwise rebound to incompatible Zod 4 after tooling updates                 |
| Explicit optional peers       | Worker MCP SDK 1.32.2; backend/widget Hono 4.12.25 retain previously auto-installed optional capabilities                                                |
| Explicit workspace build peer | Webpack 5.112.0 satisfies changed schema-utils 4.8.2 peer ^5.112.0 and Sentry build-tool supported 5.x peers                                             |

Node 22.18.0 / pnpm 10.4.1 are the verified toolchain. Root/services retain TypeScript 5.9.3; backend/math retain their already-locked 6.0.3. No broad `latest` refresh occurred. Next requires Node >=20.9.0 and shadcn >=20.18.1; this evidence does not claim every version in the inherited root Node >=20 range.

## Bounded override selectors

Each selector below is present in root package.json and the frozen lockfile. All actual selected parent edges stay within their original published dependency or peer ranges. Optional MCP/Hono peers are explicitly owned rather than disappearing from the graph; no ignore, exclusion, audit threshold change or unsupported major override is used.

| Selector                                                | Resolution |
| ------------------------------------------------------- | ---------- |
| `minimatch@3.1.2`                                       | 3.1.5      |
| `flatted@3.3.3`                                         | 3.4.2      |
| `picomatch@2.3.1`                                       | 2.3.2      |
| `@google/genai@2.32.0>ws`                               | 8.22.1     |
| `brace-expansion@1.1.12`                                | 1.1.20     |
| `brace-expansion@5.0.6`                                 | 5.0.12     |
| `fast-uri@3.1.2`                                        | 3.1.7      |
| `ip-address@10.2.0`                                     | 10.3.1     |
| `nanoid@3.3.11`                                         | 3.3.18     |
| `source-map-js@1.2.1`                                   | 1.2.2      |
| `@babel/helper-compilation-targets@7.28.6>browserslist` | 4.29.3     |

## Actual parent range ledger

Original ranges come from installed published package manifests, not overridden lockfile peer declarations. Duplicate peer-context instances are deduplicated here; all 27 unique selected edges satisfy the original ranges.

| Parent                                   | Dependency                | Original range     | Selected |
| ---------------------------------------- | ------------------------- | ------------------ | -------- |
| @ai-sdk/provider-utils@2.2.8             | nanoid                    | `^3.3.8`           | 3.3.18   |
| @babel/helper-compilation-targets@7.28.6 | browserslist              | `^4.24.0`          | 4.29.3   |
| @eslint/config-array@0.21.2              | minimatch                 | `^3.1.5`           | 3.1.5    |
| @eslint/eslintrc@3.3.7                   | minimatch                 | `^3.1.5`           | 3.1.5    |
| @google/genai@2.32.0                     | @modelcontextprotocol/sdk | `^1.25.2`          | 1.32.2   |
| @google/genai@2.32.0                     | ws                        | `^8.18.0`          | 8.22.1   |
| @hono/node-server@2.1.6                  | hono                      | `^4 \|\| ^5.0.0-0` | 4.12.25  |
| @modelcontextprotocol/sdk@1.32.2         | hono                      | `^4.11.4`          | 4.12.25  |
| @sentry/bundler-plugins@10.78.0          | webpack                   | `>=5.0.0`          | 5.112.0  |
| @sentry/webpack-plugin@5.4.1             | webpack                   | `>=5.0.0`          | 5.112.0  |
| @tailwindcss/node@4.1.18                 | source-map-js             | `^1.2.1`           | 1.2.2    |
| ajv@8.20.0                               | fast-uri                  | `^3.0.1`           | 3.1.7    |
| convex-helpers@0.1.119                   | hono                      | `^4.0.5`           | 4.12.25  |
| convex@1.42.0                            | ws                        | `8.21.0`           | 8.21.0   |
| eslint-plugin-react@7.37.5               | minimatch                 | `^3.1.2`           | 3.1.5    |
| eslint@9.39.5                            | minimatch                 | `^3.1.5`           | 3.1.5    |
| express-rate-limit@8.7.3                 | ip-address                | `^10.2.0`          | 10.3.1   |
| flat-cache@4.0.1                         | flatted                   | `^3.2.9`           | 3.4.2    |
| micromatch@4.0.8                         | picomatch                 | `^2.3.1`           | 2.3.2    |
| minimatch@10.2.5                         | brace-expansion           | `^5.0.5`           | 5.0.12   |
| minimatch@3.1.5                          | brace-expansion           | `^1.1.7`           | 1.1.20   |
| minimizer-webpack-plugin@5.14.0          | webpack                   | `^5.1.0`           | 5.112.0  |
| postcss@8.5.23                           | source-map-js             | `^1.2.1`           | 1.2.2    |
| postcss@8.5.32                           | source-map-js             | `^1.2.2`           | 1.2.2    |
| schema-utils@4.8.2                       | webpack                   | `^5.112.0`         | 5.112.0  |
| socks@2.8.10                             | ip-address                | `^10.1.1`          | 10.3.1   |
| update-browserslist-db@1.3.4             | browserslist              | `>= 4.21.0`        | 4.29.3   |

All AI 4 / old provider peer instances in backend and widget-linked trees retain supported Zod 3.25.76: @ai-sdk/google 1.2.22, @ai-sdk/openai 1.3.23, provider-utils 2.2.8, react 1.2.12, ui-utils 1.2.11 and ai 4.3.19. No unsupported Zod 4 legacy peer is accepted.

## Shipped tools and supported parent fixes

Root inspected the published shadcn 4.23.0 tarball: 21 files, about 58 KB compressed, no embedded node_modules. It retains the `tailwind.css` export consumed by shared UI and declares MCP/server ^2.3.1, Zod ^4.2.0, PostCSS ^8.5.23 and browserslist ^4.29.3. Its installed help entrypoint runs with isolated HOME. The workspace production build verifies the retained CSS consumption.

@turbo/gen 2.11.10 has 13 files, about 929 KB compressed and a roughly 2.44 MB bundled CLI. The actual shipped CLI contains patched version literals Handlebars 4.7.10, minimatch 9.0.7, brace-expansion 5.0.12, node-plop 0.32.3 and proxy-agent 8.0.2, matching its published build inputs. Old Handlebars 4.7.8/4.7.9 and basic-ftp/lodash/tmp markers were absent; absence alone is not a complete code audit. These positive patched-input matches supplement the smaller registry graph; graph disappearance alone is not treated as proof. The installed CLI help entrypoint passes with isolated HOME, without generator mutation.

Next 16.4.5 declares optional sharp ^0.35.5, providing a supported patched parent without forcing sharp across an old 0.x range. Convex 1.42.0 declares ws 8.21.0; its unchanged agent/helper consumer APIs pass offline TypeScript. Neither Convex dev/build, codegen nor deployment was run.

## Exact remaining high findings

The raw full audit reports only the following two high advisories; critical is zero. This is a failing security result, with final acceptance owned by the dependent plan. The rows enumerate every affected importer with its shortest actual reported path, not every alternative dependency path. The earlier baseline summary capped paths and was supplemented with a complete lockfile owner/node traversal (183 baseline reachability paths across 25 package names and 12 owners).

### jsondiffpatch 0.6.0

[GHSA-j4fx-xxwh-2485](https://github.com/advisories/GHSA-j4fx-xxwh-2485); patched range `>=0.7.6`. Owner: [security-schema-legacy](../plans/security-schema-legacy.md).

| Affected importer | Representative resolved chain                                              |
| ----------------- | -------------------------------------------------------------------------- |
| apps/widget       | `apps/widget > @convex-dev/agent@0.1.16 > ai@4.3.19 > jsondiffpatch@0.6.0` |
| packages/backend  | `packages/backend > ai@4.3.19 > jsondiffpatch@0.6.0`                       |

### zod 3.25.76

[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5); patched range `>=4.6.6`. Owner: [security-schema-legacy](../plans/security-schema-legacy.md).

| Affected importer        | Representative resolved chain                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| apps/api                 | `apps/api > @conversations/service-runtime@link:../../packages/service-runtime > zod@3.25.76`      |
| apps/realtime            | `apps/realtime > @conversations/service-runtime@link:../../packages/service-runtime > zod@3.25.76` |
| apps/web                 | `apps/web > zod@3.25.76`                                                                           |
| apps/widget              | `apps/widget > zod@3.25.76`                                                                        |
| apps/worker              | `apps/worker > zod@3.25.76`                                                                        |
| packages/backend         | `packages/backend > zod@3.25.76`                                                                   |
| packages/database        | `packages/database > @conversations/shared@link:../shared > zod@3.25.76`                           |
| packages/service-runtime | `packages/service-runtime > zod@3.25.76`                                                           |
| packages/shared          | `packages/shared > zod@3.25.76`                                                                    |
| packages/ui              | `packages/ui > zod@3.25.76`                                                                        |

## Verification at source freeze

Frozen install and current service build/typecheck/lint pass. The 21 harness tests pass (15 existing plus 6 new security behavior checks), and final harness lint passes after explicit Node URL import. Workspace 12 unit tests, typecheck, lint and production build pass. Backend offline TypeScript and math build pass under their original compilers. Both installed tooling help entrypoints pass in isolated HOME.

Six new behavior regressions cover prototype reference leakage, deep cache reference chains, URI authority confusion, retained Hono CORS, entirely in-memory MCP negotiation, and glob expansion in a memory/time-bounded child. They assert behavior through actual consumer resolutions rather than package version strings.

Shared UI reproduces the original 23 missing optional component/inference diagnostics. Widget typecheck/build reproduce the original TS2367 in widget-footer.tsx. These are failing inherited gates, not passes; source/features were not removed to hide them. Builds use synthetic public Clerk/Convex configuration and an unusable loopback API URL; no private configuration or live service was loaded.

The 70 focused service database/Redis tests, one actual workspace controller integration and process smoke pass on a fresh isolated project, with verified container/network/volume cleanup. At source freeze, the full isolated container gate and standalone browser fixture remain pending actual execution evidence. Plan closeout records completed results later. Hosted CI remains waived/unexecuted. This stage does not close #25 or claim voice/deployment/Slice 1 acceptance.

Primary policy and advisories: [dependency security specification](../specs/behaviors/dependency-security.md), [pnpm overrides](https://pnpm.io/settings#overrides), [npm registry](https://registry.npmjs.org/), [flatted prototype advisory](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh), [flatted recursion advisory](https://github.com/advisories/GHSA-25h7-pfq9-p65f), [fast-uri authority advisory](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx).
