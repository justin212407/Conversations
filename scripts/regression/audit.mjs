import { run, childEnvironment, json } from "./runtime.mjs"
const severities = ["info", "low", "moderate", "high", "critical"]
const packageName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i
const safeVersion = (value) =>
  typeof value === "string" &&
  value.length <= 160 &&
  /^[0-9a-zA-Z.*+<>=|^~() -]+$/.test(value)
    ? value
    : "unknown"
const workspacePaths = new Map([
  ["@conversations/api", "apps/api"],
  ["@conversations/worker", "apps/worker"],
  ["@conversations/realtime", "apps/realtime"],
  ["web", "apps/web"],
  ["widget", "apps/widget"],
  ["@workspace/backend", "packages/backend"],
  ["@workspace/ui", "packages/ui"],
  ["@conversations/shared", "packages/shared"],
  ["@conversations/database", "packages/database"],
  ["@conversations/service-runtime", "packages/service-runtime"],
  ["@workspace/math", "packages/math"],
  ["@workspace/eslint-config", "packages/eslint-config"],
  ["@workspace/typescript-config", "packages/typescript-config"],
])
const roots = new Set([".", ...workspacePaths.values()])
function packageSegment(value) {
  const linked = value.match(/^((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)@link:(.+)$/)
  if (!linked) return value
  const target = workspacePaths.get(linked[1])
  return target &&
    [target, "../../" + target, "../" + target.split("/").at(-1)].includes(
      linked[2]
    )
    ? linked[1]
    : "invalid/link"
}
function chain(value) {
  if (typeof value !== "string" || value.length > 2000) return "unknown"
  const parts = value.split(">").map((part) => packageSegment(part.trim()))
  return parts.length <= 20 &&
    parts.every(
      (part) =>
        roots.has(part) ||
        (part.length <= 300 &&
          /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:@[0-9][0-9a-zA-Z.+_-]*)?$/.test(
            part
          ))
    )
    ? parts.join(">")
    : "unknown"
}
export function auditReport(data, exitCode) {
  const unavailable = {
    status: "unavailable",
    code: "scan_unavailable",
    counts: {},
    advisories: [],
  }
  if (
    !data ||
    typeof data !== "object" ||
    data.error ||
    !data.metadata?.vulnerabilities ||
    !data.advisories ||
    typeof data.advisories !== "object" ||
    Array.isArray(data.advisories) ||
    ![0, 1].includes(exitCode)
  )
    return unavailable
  const counts = {}
  for (const severity of severities) {
    const count = data.metadata.vulnerabilities[severity]
    if (!Number.isInteger(count) || count < 0) return unavailable
    counts[severity] = count
  }
  const all = Object.values(data.advisories)
  const advisories = all.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.module_name !== "string" ||
      !packageName.test(item.module_name) ||
      item.module_name.length > 214 ||
      !severities.includes(item.severity)
    )
      return undefined
    const id =
      typeof item.url === "string"
        ? item.url.match(
            /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})$/i
          )?.[1]
        : undefined
    return {
      package: item.module_name,
      severity: item.severity,
      advisory: id ?? "unknown",
      vulnerable: safeVersion(item.vulnerable_versions),
      patched: safeVersion(item.patched_versions),
      affected: (Array.isArray(item.findings) ? item.findings : [])
        .slice(0, 20)
        .map((finding) => ({
          version: safeVersion(finding.version),
          chains: (Array.isArray(finding.paths) ? finding.paths : [])
            .slice(0, 20)
            .map(chain),
        })),
    }
  })
  if (
    advisories.some((item) => item === undefined) ||
    (all.length === 0 && Object.values(counts).some((count) => count > 0)) ||
    (all.length > 0 && !Object.values(counts).some((count) => count > 0)) ||
    (exitCode === 1 && all.length === 0)
  )
    return unavailable
  const failed =
    counts.high > 0 ||
    counts.critical > 0 ||
    advisories.some((item) => ["high", "critical"].includes(item.severity))
  // pnpm 10.4.1 JSON mode exits 1 for any vulnerability before its text-mode
  // audit-level filter. Apply our threshold to the complete validated report.
  return {
    status: failed ? "findings" : "passed",
    counts,
    advisories: advisories.slice(0, 200),
    ...(all.length > 200 ? { truncated: true } : {}),
  }
}
export async function scanDependencies({ execute = run, cwd } = {}) {
  try {
    const result = await execute(
      "pnpm",
      ["audit", "--json", "--audit-level", "high"],
      {
        cwd,
        env: childEnvironment(),
        stage: "dependency-scan",
        timeoutMs: 90000,
        acceptExitCodes: [0, 1],
      }
    )
    const report = auditReport(
      json(result.output, "dependency-scan"),
      result.code
    )
    return {
      report,
      exitCode:
        report.status === "passed" ? 0 : report.status === "findings" ? 1 : 2,
    }
  } catch {
    return {
      report: {
        status: "unavailable",
        code: "scan_unavailable",
        counts: {},
        advisories: [],
      },
      exitCode: 2,
    }
  }
}
