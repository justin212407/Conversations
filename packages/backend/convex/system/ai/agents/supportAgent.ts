import { google } from "@ai-sdk/google"
import { Agent } from "@convex-dev/agent"
import { components } from "../../../_generated/api"
import { legacyGoogleContext } from "./legacyCompatibility.js"

export const supportAgent = new Agent(components.agent, {
  name: "support",
  languageModel: google.chat("gemini-2.5-flash"),
  instructions: "You are a customer support agent",
  contextHandler: legacyGoogleContext,
})
