import { expect, test, beforeEach, afterEach, vi } from "vitest"
import agentTest from "@convex-dev/agent/test"
import baseline from "../test/fixtures/agent-0.1.16-schema.json"
import display from "../test/fixtures/legacy-display.json"
import { legacyDisplayMessages } from "../../../apps/widget/modules/widget/lib/legacy-messages"

beforeEach(() =>
  vi.stubGlobal("fetch", () => {
    throw Error("External network disabled")
  })
)
afterEach(() => vi.unstubAllGlobals())

function includes(old, next) {
  if (next.type === "any") return true
  if (old.type === "union")
    return old.value.every((child) => includes(child, next))
  if (next.type === "union")
    return next.value.some((child) => includes(old, child))
  if (old.type !== next.type) return false
  switch (old.type) {
    case "object":
      return (
        Object.entries(old.value).every(([key, field]) => {
          const target = next.value[key]
          return (
            target &&
            (!field.optional || target.optional) &&
            includes(field.fieldType, target.fieldType)
          )
        }) &&
        Object.entries(next.value).every(
          ([key, field]) =>
            field.optional || (old.value[key] && !old.value[key].optional)
        )
      )
    case "array":
      return includes(old.value, next.value)
    case "record":
      return (
        includes(old.keys, next.keys) &&
        includes(old.values.fieldType, next.values.fieldType)
      )
    case "id":
    case "literal":
      return JSON.stringify(old) === JSON.stringify(next)
    case "number":
    case "string":
    case "boolean":
    case "null":
    case "int64":
    case "bytes":
    case "any":
      return true
    default:
      throw Error("Unclassified component validator")
  }
}

test("published component accepts every old validator shape and preserves all indexes", () => {
  for (const [name, old] of Object.entries(baseline.tables)) {
    const next = agentTest.schema.tables[name]
    expect(next, name).toBeDefined()
    expect(includes(old.validator, next.validator.json), name).toBe(true)
    for (const key of ["indexes", "searchIndexes", "vectorIndexes"])
      expect(next[key], name + key).toEqual(old[key])
  }
})

test("widget projection retains old IDs, repeated text, grouped no-delimiter content and failed/empty rows", () => {
  expect(legacyDisplayMessages(display.documents)).toEqual(display.expected)
  const streaming = display.documents.map((row) =>
    row._id === "final" ? { ...row, streaming: true } : row
  )
  expect(
    legacyDisplayMessages(streaming).find((row) => row.id === "final").status
  ).toBe("streaming")
  expect(
    legacyDisplayMessages([{ ...display.documents[0], message: undefined }])
  ).toEqual([])
})

test("actual patched schema conversion and AI generation/stream paths remain coherent", async () => {
  const { z } = await import("zod")
  const { zodSchema } = await import("@ai-sdk/provider-utils")
  const { generateText, streamText, modelMessageSchema } = await import("ai")
  const { mockModel, toModelMessage } = await import("@convex-dev/agent")
  const source = z
    .object({
      name: z.string().min(1),
      options: z.record(z.string(), z.boolean()).optional(),
    })
    .strict()
  const converted = zodSchema(source)
  expect((await converted.validate({ name: "fixture" })).success).toBe(true)
  expect(
    (await converted.validate({ name: "fixture", unknown: true })).success
  ).toBe(false)
  expect(converted.jsonSchema.additionalProperties).toBe(false)
  for (const row of display.documents.filter((row) => row.message)) {
    expect(
      modelMessageSchema.safeParse(toModelMessage(row.message)).success
    ).toBe(true)
  }
  const result = await generateText({
    model: mockModel({
      content: [{ type: "text", text: "Synthetic response" }],
    }),
    prompt: "fixture",
    maxRetries: 0,
  })
  expect(result.text).toBe("Synthetic response")
  const streamed = streamText({
    model: mockModel({
      content: [{ type: "text", text: "Synthetic response" }],
    }),
    prompt: "fixture",
    maxRetries: 0,
  })
  let text = ""
  for await (const chunk of streamed.textStream) text += chunk
  expect(text).toBe(result.text)
})
