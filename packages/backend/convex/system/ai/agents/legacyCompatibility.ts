import type { Agent, ContextHandler } from "@convex-dev/agent"
import { ConvexError } from "convex/values"
import type { ActionCtx } from "../../../_generated/server.js"

// Google 1 omitted historical reasoning. Keep that provider-context policy while
// leaving all original component records and public MessageDocs untouched.
export const legacyGoogleContext: ContextHandler = async (
  _ctx,
  { allMessages }
) =>
  allMessages.map((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? {
          ...message,
          content: message.content.filter((part) => part.type !== "reasoning"),
        }
      : message
  )

const incomplete = () =>
  new ConvexError({
    code: "RECOVERY_INCOMPLETE",
    message: "Previous response recovery is incomplete. Try again.",
  })

export async function recoverLegacyPending(
  ctx: ActionCtx,
  agent: Pick<Agent, "listMessages" | "saveMessages">,
  threadId: string,
  now: () => number = Date.now
): Promise<void> {
  const started = now()
  const checkDeadline = () => {
    if (now() - started >= 5000) throw incomplete()
  }
  // Supported component operations drain at most 100 pending rows each. Await
  // every RPC: a late RPC may finish after the checked budget, but no prompt or
  // model is admitted afterward. This is not cancellation of in-flight writes.
  for (let batch = 0; batch <= 10; batch++) {
    checkDeadline()
    const pending = await agent.listMessages(ctx, {
      threadId,
      statuses: ["pending"],
      paginationOpts: { numItems: 1, cursor: null },
    })
    checkDeadline()
    if (pending.page.length === 0) return
    if (batch === 10) throw incomplete()
    await agent.saveMessages(ctx, {
      threadId,
      messages: [],
      failPendingSteps: true,
    })
    checkDeadline()
  }
}
