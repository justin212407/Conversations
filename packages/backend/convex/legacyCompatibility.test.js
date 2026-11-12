import { expect, test, afterEach, beforeEach, vi } from "vitest"
import { convexTest } from "convex-test"
import { componentsGeneric, getFunctionAddress } from "convex/server"
import agentTest from "@convex-dev/agent/test"
import { Agent, saveMessage } from "@convex-dev/agent"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import baseline from "../test/fixtures/legacy-google-request.json"
import {
  legacyGoogleContext,
  recoverLegacyPending,
} from "./system/ai/agents/legacyCompatibility"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")
const seedLoader = () => import("../test/component-fixture")
const response = {
  candidates: [
    {
      content: { role: "model", parts: [{ text: "synthetic final reply" }] },
      finishReason: "STOP",
      index: 0,
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 2,
    totalTokenCount: 3,
  },
}
function rows(pendingCount = 1) {
  const result = []
  for (let turn = 0; turn < 53; turn++) {
    result.push({
      order: turn,
      stepOrder: 0,
      status: "success",
      tool: false,
      ...(turn === 0
        ? {
            id: "old-external-reference",
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            provider: "google.generative-ai",
            model: "gemini-2.5-flash",
          }
        : {}),
      text: "user-" + turn,
      message: { role: "user", content: "user-" + turn },
    })
    result.push({
      order: turn,
      stepOrder: 1,
      status: "success",
      tool: false,
      text: "answer-" + turn,
      message: { role: "assistant", content: "answer-" + turn },
    })
  }
  result.push({
    order: 60,
    stepOrder: 0,
    status: "success",
    tool: true,
    text: "before",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "before" },
        {
          type: "tool-call",
          toolCallId: "fixture-call",
          toolName: "fixture",
          args: { value: 1 },
        },
      ],
    },
  })
  result.push({
    order: 60,
    stepOrder: 1,
    status: "success",
    tool: true,
    message: {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "fixture-call",
          toolName: "fixture",
          result: { problem: "synthetic" },
          isError: true,
          experimental_content: [{ type: "text", text: "rich" }],
        },
      ],
    },
  })
  result.push({
    order: 60,
    stepOrder: 2,
    status: "success",
    tool: false,
    text: "after",
    reasoning: "stored reasoning",
    reasoningDetails: [
      {
        type: "text",
        text: "stored reasoning",
        signature: "synthetic-signature",
      },
    ],
    message: {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "stored reasoning",
          signature: "synthetic-signature",
        },
        { type: "redacted-reasoning", data: "synthetic-redacted" },
        { type: "text", text: "after" },
      ],
    },
  })
  for (const order of [61, 62])
    result.push({
      order,
      stepOrder: 0,
      status: "success",
      tool: false,
      text: "same repeated text",
      message: { role: "user", content: "same repeated text" },
    })
  result.push({
    order: 64,
    stepOrder: 0,
    status: "success",
    tool: false,
    text: "media",
    message: {
      role: "user",
      content: [
        { type: "text", text: "media" },
        {
          type: "file",
          data: new Uint8Array([1, 2, 3]).buffer,
          mimeType: "application/pdf",
          filename: "fixture.pdf",
        },
        {
          type: "image",
          image: new Uint8Array([4, 5, 6]).buffer,
          mimeType: "image/png",
        },
      ],
    },
  })
  result.push({
    order: 70,
    stepOrder: 0,
    status: "success",
    tool: true,
    message: {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "orphan",
          toolName: "fixture",
          result: "orphan",
        },
      ],
    },
  })
  for (const [status, order] of [
    ["failed", 80],
    ...Array.from({ length: pendingCount }, (_, i) => ["pending", 81 + i]),
  ])
    result.push({
      order,
      stepOrder: 0,
      status,
      tool: false,
      text: status + "-must-not-enter-context",
      message: {
        role: "assistant",
        content: status + "-must-not-enter-context",
      },
    })
  return result
}
function canonical(contents) {
  return contents.map((c) => ({
    ...c,
    parts: c.parts.map((p) => {
      if (p.functionCall) {
        const { id, ...call } = p.functionCall
        return { functionCall: call }
      }
      if (p.functionResponse) {
        const { id, ...result } = p.functionResponse
        return { functionResponse: result }
      }
      return p
    }),
  }))
}
async function scenario({
  omitReasoning = true,
  recoverPending = true,
  pendingCount = 1,
  expectRecoveryFailure = false,
  expireAfterBatch = false,
  retryAfterFailure = false,
} = {}) {
  const t = convexTest(schema, modules)
  t.registerComponent("agent", agentTest.schema, {
    ...agentTest.modules,
    "./component/securitySeed.ts": seedLoader,
  })
  const component = componentsGeneric().agent
  const bodies = [],
    calls = []
  const fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }
  const model = createGoogleGenerativeAI({
    apiKey: "synthetic-local-only",
    fetch,
  }).chat("gemini-2.5-flash")
  const agent = new Agent(component, {
    name: "support",
    languageModel: model,
    instructions: "You are a customer support agent",
    contextHandler: omitReasoning ? legacyGoogleContext : undefined,
  })
  const { threadId } = await t.action(async (ctx) => {
    const { threadId } = await agent.createThread(ctx, {
      userId: "fixture-user",
    })
    return { threadId }
  })
  await t.mutation(async (ctx) => {
    await saveMessage(ctx, component, {
      threadId,
      message: {
        role: "assistant",
        content: "Hello, How can I help you today?",
      },
    })
    return null
  })
  const seedRows = rows(pendingCount)
  let originalIds = []
  for (let offset = 0; offset < seedRows.length; offset += 100)
    originalIds.push(
      ...(await t.mutation(component.securitySeed.seed, {
        threadId,
        rows: seedRows.slice(offset, offset + 100),
      }))
    )
  const before = await t.query(component.securitySeed.snapshot, {})
  originalIds = before.map((row) => row._id)
  const recovery = { batches: 0, probes: 0 }
  let recoveryFailed = false,
    clockCalls = 0
  const clock = expireAfterBatch
    ? () => (clockCalls++ < 3 ? 0 : 5000)
    : Date.now
  try {
    await t.action(async (ctx) => {
      if (recoverPending) {
        await recoverLegacyPending(
          {
            ...ctx,
            runQuery: async (ref, args) => {
              recovery.probes++
              return ctx.runQuery(ref, args)
            },
            runMutation: async (ref, args) => {
              const result = await ctx.runMutation(ref, args)
              recovery.batches++
              return result
            },
          },
          agent,
          threadId,
          clock
        )
      }
      await agent.generateText(
        {
          ...ctx,
          runQuery: async (ref, args) => {
            calls.push({
              kind: "query",
              address: getFunctionAddress(ref),
              args,
            })
            const result = await ctx.runQuery(ref, args)
            if (args.paginationOpts) {
              expect(args.paginationOpts).toEqual({
                numItems: 100,
                cursor: null,
              })
              expect(args.statuses).toEqual(["success"])
              expect(args.order).toBe("desc")
              expect(result.page).toHaveLength(100)
              calls.push({
                kind: "selected-history",
                seedIndices: result.page.map((row) =>
                  originalIds.indexOf(row._id)
                ),
              })
            }
            return result
          },
          runMutation: async (ref, args) => {
            calls.push({
              kind: "mutation",
              address: getFunctionAddress(ref),
              args,
            })
            const result = await ctx.runMutation(ref, args)
            if (result.messages)
              calls.push({
                kind: "mutation-result",
                rows: result.messages.map((row) => ({
                  id: row._id,
                  role: row.message?.role,
                  status: row.status,
                })),
              })
            return result
          },
        },
        { threadId },
        { prompt: "synthetic-current-only", maxRetries: 0 }
      )
      return null
    })
  } catch (error) {
    if (!expectRecoveryFailure) throw error
    expect(String(error)).toContain("RECOVERY_INCOMPLETE")
    recoveryFailed = true
  }
  const after = await t.query(component.securitySeed.snapshot, {})
  if (expectRecoveryFailure) {
    expect(recoveryFailed).toBe(true)
    expect(bodies).toHaveLength(0)
    expect(after).toHaveLength(before.length)
    expect(after.some((row) => row.text === "synthetic-current-only")).toBe(
      false
    )
    expect(after.filter((row) => row.status === "pending")).toHaveLength(
      pendingCount - recovery.batches * 100
    )
    expect(after).toEqual(
      before.map((row) =>
        row.status === "pending" &&
        row.order >= 81 + pendingCount - recovery.batches * 100
          ? { ...row, status: "failed", error: "Restarting" }
          : row
      )
    )
    let retried
    if (retryAfterFailure) {
      const nextRecovery = { batches: 0, probes: 0 }
      await t.action(async (ctx) => {
        await recoverLegacyPending(
          {
            ...ctx,
            runQuery: async (ref, args) => {
              nextRecovery.probes++
              return ctx.runQuery(ref, args)
            },
            runMutation: async (ref, args) => {
              const result = await ctx.runMutation(ref, args)
              nextRecovery.batches++
              return result
            },
          },
          agent,
          threadId
        )
        await agent.generateText(
          ctx,
          { threadId },
          { prompt: "synthetic-current-only", maxRetries: 0 }
        )
        return null
      })
      expect(nextRecovery.probes).toBe(2)
      const converged = await t.query(component.securitySeed.snapshot, {})
      expect(converged.filter((row) => originalIds.includes(row._id))).toEqual(
        before.map((row) =>
          row.status === "pending"
            ? { ...row, status: "failed", error: "Restarting" }
            : row
        )
      )
      const created = converged.filter((row) => !originalIds.includes(row._id))
      expect(created).toHaveLength(2)
      expect(
        created.filter(
          (row) =>
            row.message.role === "user" &&
            row.message.content === "synthetic-current-only"
        )
      ).toHaveLength(1)
      expect(
        created.filter(
          (row) =>
            row.message.role === "assistant" &&
            row.status === "success" &&
            row.text === "synthetic final reply"
        )
      ).toHaveLength(1)
      expect(converged.filter((row) => row.status === "pending")).toHaveLength(
        0
      )
      expect(bodies).toHaveLength(1)
      expect(
        JSON.stringify(bodies[0].contents).match(/synthetic-current-only/g)
      ).toHaveLength(1)
      retried = {
        explicitNewCall: true,
        recoveryBatches: nextRecovery.batches,
        currentUserMessages: 1,
        assistantMessages: 1,
        pendingRemaining: 0,
        historicalIdsAndContentPreserved: true,
      }
    }
    return {
      failedClosed: true,
      historicalPending: after.filter((row) => row.status === "pending").length,
      recoveryBatches: recovery.batches,
      recoveryProbes: recovery.probes,
      syntheticRequestsBeforeRetry: 0,
      retried,
    }
  }
  expect(recoveryFailed).toBe(false)
  expect(bodies).toHaveLength(1)
  const text = JSON.stringify(bodies[0].contents)
  expect(text.match(/synthetic-current-only/g)).toHaveLength(1)
  expect(text).not.toContain("must-not-enter-context")
  expect(text).not.toContain("orphan")
  if (omitReasoning) expect(text).not.toContain("stored reasoning")
  else expect(text).toContain("stored reasoning")
  expect(text.match(/same repeated text/g)).toHaveLength(2)
  expect(after.filter((row) => originalIds.includes(row._id))).toEqual(
    before.map((row) =>
      row.status === "pending" &&
      recoverPending &&
      row.order >= 81 + pendingCount - recovery.batches * 100
        ? { ...row, status: "failed", error: "Restarting" }
        : row
    )
  )
  const added = after.filter((row) => !originalIds.includes(row._id))
  expect(added).toHaveLength(2)
  expect(
    added.filter(
      (row) =>
        row.message.role === "user" &&
        row.message.content === "synthetic-current-only"
    )
  ).toHaveLength(1)
  expect(
    added.filter(
      (row) => row.message.role === "assistant" && row.status === "success"
    )
  ).toHaveLength(1)
  expect(added.filter((row) => row.status === "pending")).toHaveLength(0)
  expect(added.find((row) => row.message.role === "assistant").text).toBe(
    "synthetic final reply"
  )
  {
    const pendingIds = calls
      .filter((c) => c.kind === "mutation-result")
      .flatMap((c) => c.rows)
      .filter((r) => r.status === "pending")
      .map((r) => r.id)
    expect([...new Set(pendingIds)]).toHaveLength(1)
    expect(added.find((row) => row.message.role === "assistant")._id).toBe(
      pendingIds[0]
    )
  }
  return {
    recoveryBatches: recovery.batches,
    recoveryProbes: recovery.probes,
    body: bodies[0],
    calls,
    historicalPending: after.filter(
      (row) => originalIds.includes(row._id) && row.status === "pending"
    ).length,
    oldRowsPreserved: before.length,
    added: added.map((row) => ({ role: row.message.role, status: row.status })),
    queryCalls: calls.filter((c) => c.kind === "query").map((c) => c.args),
  }
}
beforeEach(() =>
  vi.stubGlobal("fetch", () => {
    throw Error("External network disabled")
  })
)
afterEach(() => vi.unstubAllGlobals())

test("registered Agent preserves captured Google context, ordinal selection and one-prompt storage", async () => {
  const network = vi.fn(() => {
    throw Error("External network disabled")
  })
  vi.stubGlobal("fetch", network)
  const candidate = await scenario()
  expect(canonical(candidate.body.contents)).toEqual(
    canonical(baseline.body.contents)
  )
  expect(candidate.body.systemInstruction).toEqual(
    baseline.body.systemInstruction
  )
  expect(
    candidate.calls
      .filter((c) => c.kind === "selected-history")
      .map((c) => c.seedIndices)
  ).toEqual([baseline.selectedHistory])
  const unadapted = await scenario({
    omitReasoning: false,
    recoverPending: false,
  })
  expect(unadapted.historicalPending).toBe(1)
  expect(canonical(unadapted.body.contents)).not.toEqual(
    canonical(baseline.body.contents)
  )
  expect(network).not.toHaveBeenCalled()
})

test("registered component drains the 101-row boundary before admitting a prompt", async () => {
  const result = await scenario({ pendingCount: 101 })
  expect(result.historicalPending).toBe(0)
  expect(result.recoveryBatches).toBe(2)
  expect(result.recoveryProbes).toBe(3)
})

test("bounded 1001-row recovery fails before model/prompt; explicit new call converges once", async () => {
  const result = await scenario({
    pendingCount: 1001,
    expectRecoveryFailure: true,
    retryAfterFailure: true,
  })
  expect(result.recoveryBatches).toBe(10)
  expect(result.recoveryProbes).toBe(11)
  expect(result.historicalPending).toBe(1)
  expect(result.retried).toEqual({
    explicitNewCall: true,
    recoveryBatches: 1,
    currentUserMessages: 1,
    assistantMessages: 1,
    pendingRemaining: 0,
    historicalIdsAndContentPreserved: true,
  })
})

test("checked deadline fails after awaited recovery write without model or prompt admission", async () => {
  const result = await scenario({
    pendingCount: 101,
    expectRecoveryFailure: true,
    expireAfterBatch: true,
  })
  expect(result.recoveryBatches).toBe(1)
  expect(result.recoveryProbes).toBe(1)
  expect(result.historicalPending).toBe(1)
})
