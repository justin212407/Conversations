import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const compiler = require.resolve("typescript/bin/tsc")
const runCompiler = (name) =>
  spawnSync(
    process.execPath,
    [
      compiler,
      "-p",
      fileURLToPath(new URL(`./types/${name}.json`, import.meta.url)),
    ],
    {
      env: Object.fromEntries(
        ["PATH", "SystemRoot", "SYSTEMROOT"]
          .filter((name) => process.env[name])
          .map((name) => [name, process.env[name]])
      ),
      timeout: 45000,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    }
  )

test(
  "patched actual Agent declarations retain model/required-option guards without type expansion",
  { timeout: 100000 },
  () => {
    const positive = runCompiler("positive")
    assert.equal(positive.error, undefined)
    assert.equal(positive.signal, null)
    assert.equal(positive.status, 0, positive.stdout + positive.stderr)
    const negative = runCompiler("negative")
    assert.equal(negative.error, undefined)
    assert.equal(negative.signal, null)
    assert.equal(negative.status, 2)
    const output = negative.stdout + negative.stderr
    assert.ok(!output.includes("TS2590"))
    const source = readFileSync(
      new URL("./types/negative.ts", import.meta.url),
      "utf8"
    ).split("\n")
    const expected = source.flatMap((line, index) =>
      line.startsWith("new Agent(") ? [index + 1] : []
    )
    assert.equal(expected.length, 6)
    const actual = [
      ...new Set(
        [...output.matchAll(/negative\.ts\((\d+),\d+\): error TS/g)].map(
          (match) => Number(match[1])
        )
      ),
    ].sort((a, b) => a - b)
    assert.deepEqual(actual, expected)
    for (const [name, version] of [
      ["completeV1", "v1"],
      ["completeV3", "v3"],
    ]) {
      const line =
        source.findIndex(
          (line) => line.startsWith("new Agent(") && line.includes(name)
        ) + 1
      const chunk = output.match(
        new RegExp(
          String.raw`negative\.ts\(${line},[\s\S]*?(?=\n[^\n]*negative\.ts\(|$)`
        )
      )?.[0]
      assert.ok(chunk)
      assert.ok(chunk.includes(`specificationVersion: "${version}"`))
      assert.ok(chunk.includes("not assignable"))
      assert.ok(!chunk.includes("is missing"))
    }
  }
)
