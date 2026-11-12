import { Agent, type AgentComponent } from "@convex-dev/agent"
import { google } from "@ai-sdk/google"
declare const component: AgentComponent
const model = google.chat("gemini-2.5-flash")
// prettier-ignore
new Agent(component, { languageModel: model });
// prettier-ignore
new Agent(component, { name: "missing-model" });
// prettier-ignore
new Agent(component, { name: "undefined-model", languageModel: undefined });
declare const completeV1: Omit<typeof model, "specificationVersion"> & {
  readonly specificationVersion: "v1"
}
// prettier-ignore
new Agent(component, { name: "v1", languageModel: completeV1 });
declare const completeV3: Omit<typeof model, "specificationVersion"> & {
  readonly specificationVersion: "v3"
}
// prettier-ignore
new Agent(component, { name: "v3", languageModel: completeV3 });
// prettier-ignore
new Agent(component, { name: 42, languageModel: model });
