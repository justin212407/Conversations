import assert from "node:assert/strict"
import { test } from "node:test"
import { decodeTrace, serviceSpans } from "../regression/trace.mjs"

test("supported V3 packet decoding retains service/operation spans across packets", () => {
  const packet = (service) => ({
    result: {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: service } },
            ],
          },
          scopeSpans: [
            {
              spans: [
                {
                  name: "provider.generate",
                  attributes: [
                    { key: "operationId", value: { stringValue: "operation" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  })
  const trace = decodeTrace(
    JSON.stringify(packet("conversations-worker")) +
      "\n" +
      JSON.stringify(packet("conversations-api"))
  )
  assert.equal(trace.spans.length, 2)
  const spans = serviceSpans(trace, "conversations-worker")
  assert.equal(spans.length, 1)
  assert.equal(spans[0].attributes[0].value.stringValue, "operation")
})
test("collector errors, substring-only bodies and malformed scope/span payloads fail closed", () => {
  for (const raw of [
    "",
    '"provider.generate"',
    JSON.stringify({
      error: { message: "provider.generate" },
      result: { resourceSpans: [] },
    }),
    JSON.stringify({ message: "provider.generate" }),
    JSON.stringify({ result: { resourceSpans: "provider.generate" } }),
    JSON.stringify({
      result: { resourceSpans: [{ scopeSpans: [{ spans: [{}] }] }] },
    }),
  ])
    assert.throws(() => decodeTrace(raw))
  assert.equal(
    decodeTrace(JSON.stringify({ result: { resourceSpans: [] } })).spans.length,
    0
  )
})
