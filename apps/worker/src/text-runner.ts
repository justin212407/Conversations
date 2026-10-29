import { randomUUID } from "node:crypto"
import {
  ConversationConflict,
  ResourceNotFound,
  type ConversationStore,
} from "@conversations/database"
import {
  MAX_OUTPUT_CHARACTERS,
  provisionalMessageSnapshotSchema,
  textGenerationJobSchema,
  type ProvisionalMessageSnapshot,
  type TextGenerationJob,
} from "@conversations/shared"
import {
  failureCode,
  GenerationFailure,
  type TextProvider,
} from "./provider.js"

/** Cancellation also bounds providers that fail to honor AbortSignal. */
function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener("abort", abort, { once: true })
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}
export function createTextRunner(options: {
  store: ConversationStore
  provider: TextProvider
  timeoutMs: number
  publish: (snapshot: ProvisionalMessageSnapshot) => Promise<unknown>
}) {
  const controllers = new Set<AbortController>()
  let stopping = false
  async function execute(raw: unknown, jobId: string | undefined) {
    const parsed = textGenerationJobSchema.safeParse(raw)
    if (!parsed.success || jobId !== parsed.data.operationId || stopping)
      return { status: "ignored" }
    const command: TextGenerationJob = parsed.data
    let prepared
    try {
      prepared = await options.store.commands.prepareTextExecution(command)
    } catch (error) {
      if (
        error instanceof ResourceNotFound ||
        error instanceof ConversationConflict
      )
        return { status: "ignored" }
      throw new Error("Generation preparation unavailable")
    }
    if (prepared.operation.status !== "pending" || stopping)
      return { status: "ignored" }
    const executionToken = randomUUID()
    let operation
    try {
      operation = await options.store.commands.begin(
        command.accountId,
        command.conversationId,
        command.operationId,
        executionToken
      )
    } catch (error) {
      if (
        error instanceof ConversationConflict ||
        error instanceof ResourceNotFound
      )
        return { status: "ignored" }
      throw new Error("Generation admission unavailable")
    }
    const controller = new AbortController()
    controllers.add(controller)
    if (stopping) controller.abort(new GenerationFailure("interrupted"))
    const timer = setTimeout(
      () => controller.abort(new GenerationFailure("timeout")),
      options.timeoutMs
    )
    const streamId = randomUUID()
    let content = "",
      characters = 0,
      revision = 0,
      lastPublished = 0
    let publication: Promise<unknown> | undefined
    let result: {
      state: "completed" | "failed" | "interrupted"
      failureCode?: ReturnType<typeof failureCode>
    } = { state: "completed" }
    let iterator: AsyncIterator<string> | undefined
    try {
      if (prepared.contextExceeded) throw new GenerationFailure("context_limit")
      if (controller.signal.aborted) throw controller.signal.reason
      if (!options.provider.available)
        throw new GenerationFailure("provider_unavailable")
      iterator = options.provider
        .stream(prepared.context, controller.signal)
        [Symbol.asyncIterator]()
      while (true) {
        const chunk = await cancellable(iterator.next(), controller.signal)
        if (chunk.done) break
        if (typeof chunk.value !== "string" || chunk.value.includes("\u0000"))
          throw new GenerationFailure("provider_error")
        characters += [...chunk.value].length
        if (characters > MAX_OUTPUT_CHARACTERS)
          throw new GenerationFailure("output_limit")
        content += chunk.value
        revision++
        if (
          !publication &&
          Date.now() - lastPublished >= 100 &&
          operation.assistantMessageId
        ) {
          lastPublished = Date.now()
          const snapshot = provisionalMessageSnapshotSchema.parse({
            version: 1,
            eventId: randomUUID(),
            type: "message.snapshot",
            conversationId: operation.conversationId,
            sequence: prepared.checkpoint,
            occurredAt: new Date().toISOString(),
            correlation: command.correlation,
            payload: {
              messageId: operation.assistantMessageId,
              operationId: operation.id,
              streamId,
              revision,
              state: "streaming",
              content,
            },
          })
          publication = Promise.resolve()
            .then(() => options.publish(snapshot))
            .catch(() => {})
            .finally(() => {
              publication = undefined
            })
        }
      }
      if (!content.trim()) throw new GenerationFailure("provider_error")
    } catch (error) {
      const code = failureCode(
        controller.signal.aborted ? controller.signal.reason : error
      )
      result = {
        state: code === "interrupted" ? "interrupted" : "failed",
        failureCode: code,
      }
    } finally {
      clearTimeout(timer)
      controllers.delete(controller)
      controller.abort(new GenerationFailure("interrupted"))
      if (iterator?.return)
        void Promise.resolve()
          .then(() => iterator?.return?.())
          .catch(() => {})
    }
    try {
      const final = await options.store.commands.finalize(
        command.accountId,
        command.conversationId,
        command.operationId,
        { ...result, content, executionToken }
      )
      return { status: final.status, operationId: final.id }
    } catch (error) {
      if (
        error instanceof ConversationConflict ||
        error instanceof ResourceNotFound
      )
        return { status: "ignored" }
      // Redis may retry delivery, but the running lease prevents another paid call.
      // Recovery durably interrupts this operation when its lease expires.
      throw new Error("Generation finalization unavailable")
    }
  }
  const pending = new Set<Promise<{ status: string; operationId?: string }>>()
  return {
    stop() {
      stopping = true
      for (const controller of controllers)
        controller.abort(new GenerationFailure("interrupted"))
    },
    async drain() {
      await Promise.allSettled([...pending])
    },
    execute(raw: unknown, jobId: string | undefined) {
      const result = execute(raw, jobId)
      pending.add(result)
      void result.then(
        () => pending.delete(result),
        () => pending.delete(result)
      )
      return result
    },
  }
}
