import { GateFailure, json } from "./runtime.mjs"

export function decodeTrace(raw, stage = "jaeger-format") {
  const packets = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => json(line, stage))
  if (!packets.length) throw new GateFailure(stage, "invalid_result")
  const resources = []
  for (const packet of packets) {
    if (packet?.error) throw new GateFailure(stage, "invalid_result")
    const value = packet?.result ?? packet
    if (!value || !Array.isArray(value.resourceSpans))
      throw new GateFailure(stage, "invalid_result")
    resources.push(...value.resourceSpans)
  }
  const spans = []
  for (const resource of resources) {
    if (!resource || !Array.isArray(resource.scopeSpans ?? []))
      throw new GateFailure(stage, "invalid_result")
    for (const scope of resource.scopeSpans ?? []) {
      if (!scope || !Array.isArray(scope.spans ?? []))
        throw new GateFailure(stage, "invalid_result")
      for (const span of scope.spans ?? []) {
        if (!span || typeof span.name !== "string")
          throw new GateFailure(stage, "invalid_result")
        spans.push(span)
      }
    }
  }
  return { raw, resources, spans }
}
export function serviceSpans(trace, service) {
  return trace.resources
    .filter((resource) =>
      resource.resource?.attributes?.some(
        (attribute) =>
          attribute.key === "service.name" &&
          attribute.value?.stringValue === service
      )
    )
    .flatMap((resource) =>
      (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? [])
    )
}
