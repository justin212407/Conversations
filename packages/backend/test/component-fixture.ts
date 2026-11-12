import { mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
export const seed = mutationGeneric({
  args: { threadId: v.string(), rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    if (args.rows.length > 2000) throw Error("fixture row limit")
    const ids = []
    for (const row of args.rows)
      ids.push(
        await ctx.db.insert("messages", { ...row, threadId: args.threadId })
      )
    return ids
  },
})
export const snapshot = queryGeneric({
  args: {},
  handler: async (ctx) => await ctx.db.query("messages").take(2000),
})
