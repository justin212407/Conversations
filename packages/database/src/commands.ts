import { createHash, randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import {
  withOwnedConversation,
  type Database,
  type Transaction,
  type Conversation,
} from "./access.js"
import {
  ConversationConflict,
  InvalidInput,
  InputLimitExceeded,
  ResourceNotFound,
  isUuid,
} from "./errors.js"
import { appendEvent, messageData } from "./events.js"
import {
  textGenerationJobSchema,
  generationFailureSchema,
  requestCorrelationSchema,
  type GenerationFailure,
  type RequestCorrelation,
  type TextGenerationJob,
} from "@conversations/shared"
import { completedContext } from "./context.js"
import {
  conversations,
  finalizedDeliveries,
  handoffs,
  messages,
  operations,
} from "./schema.js"

export type Operation = typeof operations.$inferSelect
type Message = typeof messages.$inferSelect
type TerminalState = "completed" | "failed" | "interrupted"
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
const active = (state: string) => state === "pending" || state === "running"

export function validateContent(
  content: unknown,
  maximum = 16000
): asserts content is string {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.includes("\u0000")
  )
    throw new InvalidInput()
  if ([...content].length > maximum) throw new InputLimitExceeded()
}
function requestId(value: string) {
  if (!isUuid(value)) throw new InvalidInput()
  return value.toLowerCase()
}
function uniqueRequestConflict(error: unknown) {
  let current: unknown = error
  for (
    let depth = 0;
    depth < 4 && current && typeof current === "object";
    depth++
  ) {
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === "operations_account_request_idx"
    )
      return true
    current = "cause" in current ? current.cause : undefined
  }
  return false
}
export function admission(operation: Operation) {
  return {
    operationId: operation.id,
    conversationId: operation.conversationId,
    userMessageId: operation.inputMessageId,
    assistantMessageId: operation.assistantMessageId,
    status: operation.status,
    expiresAt: operation.expiresAt.toISOString(),
    failureCode: operation.failureCode,
  }
}

export async function appendMessages(
  tx: Transaction,
  conversationId: string,
  input: Array<{
    id?: string
    role: Message["role"]
    modality: Message["modality"]
    content: string
    state: Message["state"]
  }>
) {
  const [counter] = await tx
    .update(conversations)
    .set({
      nextMessageSequence: sql`${conversations.nextMessageSequence} + ${input.length}`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(eq(conversations.id, conversationId))
    .returning({ end: conversations.nextMessageSequence })
  if (!counter) throw new ResourceNotFound()
  const rows = await tx
    .insert(messages)
    .values(
      input.map((message, index) => ({
        id: message.id,
        role: message.role,
        modality: message.modality,
        content: message.content,
        state: message.state,
        conversationId,
        sequence: counter.end - input.length + index + 1,
      }))
    )
    .returning()
  for (const message of rows)
    await appendEvent(
      tx,
      message.conversationId,
      message.state === "completed" ? "message.completed" : "message.created",
      { message: messageData(message) }
    )
  return rows
}

export class ConversationCommands {
  constructor(private readonly db: Database) {}

  private async existing(
    tx: Transaction,
    accountId: string,
    conversationId: string,
    id: string,
    expected: string
  ) {
    const [found] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.accountId, accountId),
          eq(operations.clientRequestId, id)
        )
      )
    if (
      found &&
      (found.conversationId !== conversationId.toLowerCase() ||
        found.requestHash !== expected)
    )
      throw new ConversationConflict()
    return found
  }
  private async ensureAvailable(tx: Transaction, conversation: Conversation) {
    if (conversation.status !== "active") throw new ConversationConflict()
    const pending = await tx
      .select({ id: operations.id })
      .from(operations)
      .where(
        and(
          eq(operations.conversationId, conversation.id),
          inArray(operations.status, ["pending", "running"])
        )
      )
      .limit(1)
    if (pending.length) throw new ConversationConflict()
  }

  private async insertOperation(
    tx: Transaction,
    conversation: Conversation,
    id: string,
    requestHash: string,
    inputMessageId: string,
    assistantMessageId: string,
    retryOf: string | undefined,
    correlation: RequestCorrelation | string
  ) {
    const [operation] = await tx
      .insert(operations)
      .values({
        accountId: conversation.accountId,
        conversationId: conversation.id,
        clientRequestId: id,
        requestHash,
        kind: "text",
        inputMessageId,
        assistantMessageId,
        retryOf,
        expiresAt: sql`clock_timestamp() + interval '5 minutes'`,
      })
      .returning()
    if (!operation) throw new Error("Operation admission failed")
    const job = textGenerationJobSchema.parse({
      version: 1,
      operationId: operation.id,
      accountId: conversation.accountId,
      conversationId: conversation.id,
      inputMessageId,
      correlation: requestCorrelationSchema.parse(
        typeof correlation === "string"
          ? { requestId: correlation }
          : correlation
      ),
    })
    await tx.insert(handoffs).values({
      kind: "job",
      conversationId: conversation.id,
      operationId: operation.id,
      type: "text.generate",
      payload: job,
    })
    await appendEvent(
      tx,
      conversation.id,
      "operation.accepted",
      {
        operation: admission(operation),
      },
      job.correlation
    )
    return operation
  }

  async submitText(
    accountId: string,
    conversationId: string,
    clientRequestId: string,
    content: string,
    correlation: RequestCorrelation | string = randomUUID()
  ) {
    validateContent(content)
    const id = requestId(clientRequestId)
    const requestHash = hash({ kind: "text", content })
    try {
      return await withOwnedConversation(
        this.db,
        accountId,
        conversationId,
        async (tx, conversation) => {
          const previous = await this.existing(
            tx,
            accountId,
            conversationId,
            id,
            requestHash
          )
          if (previous) return admission(previous)
          await this.ensureAvailable(tx, conversation)
          await completedContext(tx, conversation.id, undefined, content)
          const inputMessageId = randomUUID(),
            assistantMessageId = randomUUID()
          await appendMessages(tx, conversationId, [
            {
              id: inputMessageId,
              role: "user",
              modality: "text",
              content,
              state: "completed",
            },
            {
              id: assistantMessageId,
              role: "assistant",
              modality: "text",
              content: "",
              state: "pending",
            },
          ])
          return admission(
            await this.insertOperation(
              tx,
              conversation,
              id,
              requestHash,
              inputMessageId,
              assistantMessageId,
              undefined,
              correlation
            )
          )
        }
      )
    } catch (error) {
      if (uniqueRequestConflict(error)) throw new ConversationConflict()
      throw error
    }
  }

  async getOperation(
    accountId: string,
    conversationId: string,
    operationId: string
  ) {
    if (!isUuid(operationId)) throw new ResourceNotFound()
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx) => {
        const [operation] = await tx
          .select()
          .from(operations)
          .where(
            and(
              eq(operations.id, operationId),
              eq(operations.conversationId, conversationId)
            )
          )
        if (!operation) throw new ResourceNotFound()
        return operation
      }
    )
  }

  async activeOperation(accountId: string, conversationId: string) {
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx) => {
        const [operation] = await tx
          .select()
          .from(operations)
          .where(
            and(
              eq(operations.conversationId, conversationId),
              inArray(operations.status, ["pending", "running"])
            )
          )
        return operation ? admission(operation) : null
      }
    )
  }

  async begin(
    accountId: string,
    conversationId: string,
    operationId: string,
    executionToken: string
  ) {
    if (!isUuid(operationId) || !isUuid(executionToken))
      throw new InvalidInput()
    executionToken = executionToken.toLowerCase()
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx) => {
        const [operation] = await tx
          .select()
          .from(operations)
          .where(
            and(
              eq(operations.id, operationId),
              eq(operations.conversationId, conversationId),
              sql`${operations.expiresAt} > clock_timestamp()`
            )
          )
        if (
          !operation ||
          operation.kind !== "text" ||
          !active(operation.status) ||
          (operation.status === "running" &&
            operation.executionToken !== executionToken)
        )
          throw new ConversationConflict()
        if (operation.status === "running") return operation
        const [updated] = await tx
          .update(operations)
          .set({
            status: "running",
            executionToken,
            expiresAt: sql`clock_timestamp() + interval '5 minutes'`,
          })
          .where(eq(operations.id, operationId))
          .returning()
        if (!updated) throw new ConversationConflict()
        return updated
      }
    )
  }

  private async terminal(
    tx: Transaction,
    operation: Operation,
    state: TerminalState,
    content: string,
    failureCode?: GenerationFailure
  ) {
    const resultHash = hash({
      state,
      content,
      ...(failureCode ? { failureCode } : {}),
    })
    if (!active(operation.status)) {
      if (operation.resultHash !== resultHash) throw new ConversationConflict()
      return operation
    }
    const [updated] = await tx
      .update(operations)
      .set({
        status: state,
        resultHash,
        failureCode: failureCode ?? null,
        completedAt: sql`clock_timestamp()`,
      })
      .where(eq(operations.id, operation.id))
      .returning()
    if (!updated || !operation.assistantMessageId)
      throw new ConversationConflict()
    const [message] = await tx
      .update(messages)
      .set({ state, content, updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(messages.id, operation.assistantMessageId),
          eq(messages.conversationId, operation.conversationId)
        )
      )
      .returning()
    if (!message) throw new ConversationConflict()
    await tx
      .update(conversations)
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(eq(conversations.id, operation.conversationId))
    await tx
      .update(handoffs)
      .set({ cancelledAt: sql`clock_timestamp()` })
      .where(
        and(eq(handoffs.operationId, operation.id), eq(handoffs.kind, "job"))
      )
    const [jobHandoff] = await tx
      .select({ payload: handoffs.payload })
      .from(handoffs)
      .where(
        and(eq(handoffs.operationId, operation.id), eq(handoffs.kind, "job"))
      )
      .limit(1)
    const command = textGenerationJobSchema.safeParse(jobHandoff?.payload)
    const correlation = command.success ? command.data.correlation : undefined
    await appendEvent(
      tx,
      operation.conversationId,
      `message.${state}`,
      {
        message: {
          ...messageData(message),
          operationId: operation.id,
          failureCode: failureCode ?? null,
        },
      },
      correlation
    )
    await appendEvent(
      tx,
      operation.conversationId,
      `operation.${state}`,
      {
        operation: admission(updated),
      },
      correlation
    )
    return updated
  }

  async finalize(
    accountId: string,
    conversationId: string,
    operationId: string,
    result: {
      state: TerminalState
      content: string
      executionToken?: string
      failureCode?: GenerationFailure
    }
  ) {
    if (
      !isUuid(operationId) ||
      !["completed", "failed", "interrupted"].includes(result.state) ||
      typeof result.content !== "string" ||
      result.content.includes("\u0000")
    )
      throw new InvalidInput()
    if (result.state === "completed") validateContent(result.content, 64000)
    else if ([...result.content].length > 64000) throw new InputLimitExceeded()
    if (
      result.failureCode !== undefined &&
      (!generationFailureSchema.safeParse(result.failureCode).success ||
        result.state === "completed")
    )
      throw new InvalidInput()
    const executionToken =
      result.executionToken === undefined
        ? undefined
        : requestId(result.executionToken)
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx) => {
        const [operation] = await tx
          .select({
            operation: operations,
            validLease: sql<boolean>`${operations.expiresAt} > clock_timestamp()`,
          })
          .from(operations)
          .where(
            and(
              eq(operations.id, operationId),
              eq(operations.conversationId, conversationId)
            )
          )
        if (!operation) throw new ResourceNotFound()
        if (operation.operation.kind !== "text")
          throw new ConversationConflict()
        if (
          active(operation.operation.status) &&
          (!operation.validLease ||
            (operation.operation.status === "running" &&
              operation.operation.executionToken !== executionToken))
        )
          throw new ConversationConflict()
        return this.terminal(
          tx,
          operation.operation,
          result.state,
          result.content,
          result.failureCode
        )
      }
    )
  }

  async retry(
    accountId: string,
    conversationId: string,
    operationId: string,
    clientRequestId: string,
    correlation: RequestCorrelation | string = randomUUID()
  ) {
    if (!isUuid(operationId)) throw new ResourceNotFound()
    const id = requestId(clientRequestId)
    const expected = hash({
      kind: "retry",
      operationId: operationId.toLowerCase(),
    })
    try {
      return await withOwnedConversation(
        this.db,
        accountId,
        conversationId,
        async (tx, conversation) => {
          const previous = await this.existing(
            tx,
            accountId,
            conversationId,
            id,
            expected
          )
          if (previous) return admission(previous)
          if (conversation.status !== "active") throw new ConversationConflict()
          const [original] = await tx
            .select({
              operation: operations,
              expired: sql<boolean>`${operations.expiresAt} <= clock_timestamp()`,
            })
            .from(operations)
            .where(
              and(
                eq(operations.id, operationId),
                eq(operations.conversationId, conversationId)
              )
            )
          if (!original) throw new ResourceNotFound()
          let failed = original.operation
          if (failed.kind !== "text" || !failed.inputMessageId)
            throw new ConversationConflict()
          const [input] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.id, failed.inputMessageId),
                eq(messages.conversationId, conversation.id)
              )
            )
          if (
            !input ||
            input.role !== "user" ||
            input.state !== "completed" ||
            input.modality !== "text"
          )
            throw new ConversationConflict()
          await completedContext(tx, conversation.id, input.sequence)
          if (active(failed.status) && original.expired)
            failed = await this.terminal(
              tx,
              failed,
              "interrupted",
              "",
              "expired"
            )
          if (
            !["failed", "interrupted"].includes(failed.status) ||
            failed.kind !== "text" ||
            !failed.inputMessageId
          )
            throw new ConversationConflict()
          await this.ensureAvailable(tx, conversation)
          const assistantMessageId = randomUUID()
          await appendMessages(tx, conversationId, [
            {
              id: assistantMessageId,
              role: "assistant",
              modality: "text",
              content: "",
              state: "pending",
            },
          ])
          return admission(
            await this.insertOperation(
              tx,
              conversation,
              id,
              expected,
              failed.inputMessageId,
              assistantMessageId,
              failed.id,
              correlation
            )
          )
        }
      )
    } catch (error) {
      if (uniqueRequestConflict(error)) throw new ConversationConflict()
      throw error
    }
  }

  /** Short authoritative transaction; no pool connection escapes to provider I/O. */
  async prepareTextExecution(command: TextGenerationJob) {
    const job = textGenerationJobSchema.parse(command)
    return withOwnedConversation(
      this.db,
      job.accountId,
      job.conversationId,
      async (tx, conversation) => {
        const [row] = await tx
          .select({
            operation: operations,
            expired: sql<boolean>`${operations.expiresAt} <= clock_timestamp()`,
          })
          .from(operations)
          .where(
            and(
              eq(operations.id, job.operationId),
              eq(operations.conversationId, conversation.id),
              eq(operations.accountId, conversation.accountId)
            )
          )
        if (
          !row ||
          row.operation.kind !== "text" ||
          row.operation.inputMessageId !== job.inputMessageId.toLowerCase() ||
          !row.operation.assistantMessageId
        )
          throw new ResourceNotFound()
        let operation = row.operation
        if (active(operation.status) && row.expired)
          operation = await this.terminal(
            tx,
            operation,
            "interrupted",
            "",
            "expired"
          )
        if (operation.status !== "pending")
          return {
            operation,
            context: [],
            checkpoint: conversation.nextEventSequence,
            contextExceeded: false,
          }
        const [input] = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, job.inputMessageId),
              eq(messages.conversationId, conversation.id)
            )
          )
        if (
          !input ||
          input.role !== "user" ||
          input.modality !== "text" ||
          input.state !== "completed"
        )
          throw new ResourceNotFound()
        try {
          validateContent(input.content)
          const context = await completedContext(
            tx,
            conversation.id,
            input.sequence
          )
          return {
            operation,
            context,
            checkpoint: conversation.nextEventSequence,
            contextExceeded: false,
          }
        } catch (error) {
          if (!(error instanceof InputLimitExceeded)) throw error
          return {
            operation,
            context: [],
            checkpoint: conversation.nextEventSequence,
            contextExceeded: true,
          }
        }
      }
    )
  }

  /** Trusted bounded maintenance: expires leases without executing a new model call. */
  async interruptExpiredTextOperations(
    limit = 25,
    shouldStop: () => boolean = () => false
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new InvalidInput()
    const expired = await this.db
      .select({
        id: operations.id,
        accountId: operations.accountId,
        conversationId: operations.conversationId,
      })
      .from(operations)
      .where(
        and(
          eq(operations.kind, "text"),
          inArray(operations.status, ["pending", "running"]),
          sql`${operations.expiresAt} <= clock_timestamp()`
        )
      )
      .limit(limit)
    let interrupted = 0
    for (const candidate of expired) {
      if (shouldStop()) break
      await withOwnedConversation(
        this.db,
        candidate.accountId,
        candidate.conversationId,
        async (tx) => {
          const [current] = await tx
            .select()
            .from(operations)
            .where(
              and(
                eq(operations.id, candidate.id),
                inArray(operations.status, ["pending", "running"]),
                sql`${operations.expiresAt} <= clock_timestamp()`
              )
            )
          if (current) {
            await this.terminal(tx, current, "interrupted", "", "expired")
            interrupted++
          }
        }
      )
    }
    return interrupted
  }

  /** Trusted adapter seam: stable delivery identity, never browser transcript authority. */
  async persistFinalMessage(
    accountId: string,
    conversationId: string,
    input: {
      deliveryId: string
      role: "user" | "assistant"
      modality: "text" | "voice"
      content: string
    }
  ) {
    if (
      !isUuid(input.deliveryId) ||
      !["user", "assistant"].includes(input.role) ||
      !["text", "voice"].includes(input.modality)
    )
      throw new InvalidInput()
    validateContent(input.content, 64000)
    const expected = hash({
      role: input.role,
      modality: input.modality,
      content: input.content,
    })
    return withOwnedConversation(
      this.db,
      accountId,
      conversationId,
      async (tx, conversation) => {
        const [receipt] = await tx
          .select()
          .from(finalizedDeliveries)
          .where(
            and(
              eq(finalizedDeliveries.conversationId, conversationId),
              eq(finalizedDeliveries.deliveryId, input.deliveryId)
            )
          )
        if (receipt) {
          if (receipt.payloadHash !== expected) throw new ConversationConflict()
          const [message] = await tx
            .select()
            .from(messages)
            .where(eq(messages.id, receipt.messageId))
          if (!message) throw new ResourceNotFound()
          return message
        }
        if (conversation.status !== "active") throw new ConversationConflict()
        const pending = await tx
          .select()
          .from(operations)
          .where(
            and(
              eq(operations.conversationId, conversationId),
              inArray(operations.status, ["pending", "running"])
            )
          )
        if (pending.some((operation) => operation.kind !== "voice"))
          throw new ConversationConflict()
        const [message] = await appendMessages(tx, conversationId, [
          {
            role: input.role,
            modality: input.modality,
            content: input.content,
            state: "completed",
          },
        ])
        if (!message) throw new Error("Finalized message persistence failed")
        await tx.insert(finalizedDeliveries).values({
          conversationId,
          deliveryId: input.deliveryId,
          payloadHash: expected,
          messageId: message.id,
        })
        return message
      }
    )
  }
}
