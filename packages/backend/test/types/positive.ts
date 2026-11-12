import {
  Agent,
  type AgentComponent,
  type ContextHandler,
} from "@convex-dev/agent"
import { google } from "@ai-sdk/google"
declare const component: AgentComponent
const contextHandler: ContextHandler = async (_ctx, { allMessages }) =>
  allMessages
export const googleAgent = new Agent(component, {
  name: "support",
  languageModel: google.chat("gemini-2.5-flash"),
  contextHandler,
})
export const gatewayAgent = new Agent(component, {
  name: "gateway",
  languageModel: "google/gemini-2.5-flash",
})
const model = google.chat("gemini-2.5-flash")
declare const completeV2: Omit<typeof model, "specificationVersion"> & {
  readonly specificationVersion: "v2"
}
export const completeAgent = new Agent(component, {
  name: "complete",
  languageModel: completeV2,
})
