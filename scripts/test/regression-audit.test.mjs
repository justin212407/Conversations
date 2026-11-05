import assert from "node:assert/strict"
import { test } from "node:test"
import { auditReport, scanDependencies } from "../regression/audit.mjs"
const advisory = {
  module_name: "example-package",
  severity: "high",
  url: "https://github.com/advisories/GHSA-abcd-1234-abcd",
  vulnerable_versions: "<2.0.0",
  patched_versions: ">=2.0.0",
  findings: [{ version: "1.0.0", paths: ["apps/web>example-package"] }],
}
const report = (items = {}, counts = {}) => ({
  advisories: items,
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      ...counts,
    },
  },
})
test("audit findings and package paths remain visible with nonzero high/critical result", async () => {
  const result = await scanDependencies({
    execute: async (_command, args, options) => {
      assert.deepEqual(args, ["audit", "--json", "--audit-level", "high"])
      assert.ok(!Object.keys(options.env).some((key) => key.includes("TOKEN")))
      return {
        output: JSON.stringify(report({ one: advisory }, { high: 1 })),
        code: 1,
      }
    },
  })
  assert.equal(result.exitCode, 1)
  assert.equal(result.report.status, "findings")
  assert.equal(result.report.advisories[0].advisory, "GHSA-abcd-1234-abcd")
  assert.equal(
    result.report.advisories[0].affected[0].chains[0],
    "apps/web>example-package"
  )
  assert.equal(
    auditReport(
      report({ one: { ...advisory, severity: "moderate" } }, { moderate: 1 }),
      0
    ).status,
    "passed"
  )
})
test("registry failures, malformed reports and contradictory exit codes never become clean scans", async () => {
  for (const data of [
    { advisories: [], metadata: { vulnerabilities: {} } },
    { advisories: {}, metadata: { vulnerabilities: { high: 0 } } },
    {},
    { error: { message: "PRIVATE_ERROR_CANARY" } },
    report({}, { high: 1 }),
    report({}, { high: -1 }),
  ])
    assert.equal(auditReport(data, 1).status, "unavailable")
  assert.equal(
    (
      await scanDependencies({
        execute: async () => {
          throw new Error("PRIVATE_NETWORK_CANARY")
        },
      })
    ).exitCode,
    2
  )
  assert.equal(
    (
      await scanDependencies({
        execute: async () => ({ output: "PRIVATE_INVALID_JSON", code: 1 }),
      })
    ).report.status,
    "unavailable"
  )
  assert.equal(
    (
      await scanDependencies({
        execute: async () => ({ output: JSON.stringify(report()), code: 0 }),
      })
    ).exitCode,
    0
  )
  assert.equal(auditReport(report(), 1).status, "unavailable")
})
test("audit summaries reject raw exceptions and unsafe registry-controlled fields", () => {
  const result = auditReport(
    report(
      {
        one: {
          ...advisory,
          title: "PRIVATE_TITLE",
          url: "https://unsafe/PRIVATE_TOKEN",
          vulnerable_versions: "PRIVATE\nCANARY",
          findings: [
            { version: "1.0.0", paths: ["/home/private/PRIVATE_CANARY"] },
          ],
        },
      },
      { high: 1 }
    ),
    1
  )
  assert.ok(!JSON.stringify(result).includes("PRIVATE"))
  assert.equal(result.advisories[0].advisory, "unknown")
})

test("real pnpm versioned importer chains retain package ownership and reject unsafe paths", () => {
  const data = report(
    {
      one: {
        ...advisory,
        findings: [
          {
            version: "3.1.2",
            paths: [
              "apps/api > eslint@9.39.2 > @eslint/config-array@0.21.1 > minimatch@3.1.2",
              "/home/private/token",
              "https://unsafe/token",
            ],
          },
        ],
      },
    },
    { high: 1 }
  )
  const result = auditReport(data, 1)
  assert.deepEqual(result.advisories[0].affected[0].chains, [
    "apps/api>eslint@9.39.2>@eslint/config-array@0.21.1>minimatch@3.1.2",
    "unknown",
    "unknown",
  ])
})

test("known pnpm workspace links preserve names without exposing arbitrary filesystem targets", () => {
  const data = report(
    {
      one: {
        ...advisory,
        findings: [
          {
            version: "1.0.0",
            paths: [
              "apps/web > @workspace/backend@link:../../packages/backend > example-package@1.0.0",
              "packages/database > @conversations/shared@link:../shared > example-package@1.0.0",
              "apps/web > @workspace/backend@link:/private/token > example-package@1.0.0",
            ],
          },
        ],
      },
    },
    { high: 1 }
  )
  assert.deepEqual(auditReport(data, 1).advisories[0].affected[0].chains, [
    "apps/web>@workspace/backend>example-package@1.0.0",
    "packages/database>@conversations/shared>example-package@1.0.0",
    "unknown",
  ])
})
