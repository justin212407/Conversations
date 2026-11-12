import type { MessageDoc } from "@convex-dev/agent"

type DisplayMessage = {
  id: string
  role: "system" | "user" | "assistant"
  content: string
  status: MessageDoc["status"] | "streaming"
}

// The widget renders only text. Keep its historical no-delimiter concatenation
// and final-row identity without depending on an SDK UI DTO or modifying data.
export function legacyDisplayMessages(
  messages: (MessageDoc & { streaming?: boolean })[]
): DisplayMessage[] {
  const result: DisplayMessage[] = []
  let assistant: DisplayMessage | undefined
  let hasParts = false
  for (const row of messages) {
    const message = row.message
    if (!message) continue
    const status = row.streaming ? "streaming" : row.status
    if (message.role === "user" || message.role === "system") {
      result.push({
        id: row._id,
        role: message.role,
        content: row.text ?? "",
        status,
      })
    } else {
      if (message.role === "tool" && !assistant) continue
      if (!assistant) {
        assistant = { id: row._id, role: "assistant", content: "", status }
        hasParts = false
        result.push(assistant)
      }
      assistant.id = row._id
      assistant.status = status
      assistant.content += row.text ?? ""
      const content = Array.isArray(message.content) ? message.content : []
      hasParts ||= Boolean(
        row.text ||
        row.reasoning ||
        row.sources?.length ||
        content.some((part) =>
          ["file", "image", "tool-call", "tool-result"].includes(part.type)
        )
      )
    }
    if (!row.tool && assistant && hasParts) assistant = undefined
  }
  return result
}
