import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import {
  uuidSchema,
  integerSchema,
  utcTimestampSchema,
  probeJobSchema,
  messageDataSchema,
} from "../dist/index.js"

const id = "12345678-1234-0234-0234-123456789ABC"
const minute = "2024-02-29T12:34Z"
test("canonical IDs preserve old version/variant and case contracts", () => {
  for (const value of [
    id,
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ])
    assert.equal(uuidSchema.parse(value), value)
  for (const value of [
    " " + id,
    id + "\n",
    id.replace("-", ""),
    id.replace("A", "G"),
    null,
  ])
    assert.equal(uuidSchema.safeParse(value).success, false)
})
test("finite integer contracts retain unsafe representable integers and individual sign checks", () => {
  for (const value of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1e30])
    assert.equal(integerSchema.parse(value), value)
  for (const value of [NaN, Infinity, 1.5, "1"])
    assert.equal(integerSchema.safeParse(value).success, false)
  const message = {
    id,
    conversationId: id,
    sequence: 1e30,
    role: "user",
    modality: "text",
    content: "",
    state: "completed",
    createdAt: minute,
    updatedAt: minute,
  }
  assert.deepEqual(messageDataSchema.parse(message), message)
  assert.equal(
    messageDataSchema.safeParse({ ...message, sequence: 0 }).success,
    false
  )
  assert.equal(
    messageDataSchema.safeParse({ ...message, unknown: true }).success,
    false
  )
})
test("UTC calendar and minute/second/fraction timestamps retain strict envelope validation", () => {
  for (const value of [
    minute,
    "2024-02-29T12:34:56Z",
    "2024-02-29T12:34:56.123Z",
  ])
    assert.equal(utcTimestampSchema.parse(value), value)
  for (const value of [
    "2023-02-29T12:34Z",
    "2024-02-29T24:00Z",
    "2024-02-29T12:34+01:00",
    "2024-02-29T12:34",
  ])
    assert.equal(utcTimestampSchema.safeParse(value).success, false)
  const job = { version: 1, probeId: id, sentAt: minute }
  assert.deepEqual(probeJobSchema.parse(job), job)
  assert.equal(
    probeJobSchema.safeParse({ ...job, secret: "synthetic" }).success,
    false
  )
})
test("patched array/map/set cardinality bounds reject before visiting oversized contents", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=128",
      "--input-type=module",
      "-e",
      `
    import assert from "node:assert/strict";
    import {z} from "zod";
    let visits = 0;
    const element = z.any().superRefine(() => visits++);
    const oversized = Array.from({length: 100000}, (_, i) => i);
    for (const [schema, input] of [
      [z.array(element).max(2), oversized],
      [z.set(element).max(2), new Set(oversized)],
      [z.map(element, element).max(2), new Map(oversized.map(i => [i, i]))],
    ]) {
      visits = 0;
      const result = schema.safeParse(input);
      assert.equal(result.success, false);
      assert.equal(result.error.issues.length, 1);
      assert.equal(visits, 0);
    }
    const nested = z.object({values: z.array(z.object({name: z.string().min(1)}).strict()).max(2)}).strict();
    assert.deepEqual(nested.parse({values:[{name:"ok"}]}), {values:[{name:"ok"}]});
    assert.equal(nested.safeParse({values:[{name:""}]}).success,false);
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      timeout: 5000,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
    }
  )
  assert.equal(child.error, undefined)
  assert.equal(child.signal, null)
  assert.equal(child.status, 0, child.stderr)
})
