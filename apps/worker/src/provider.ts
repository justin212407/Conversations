import { GoogleGenAI, type Content, type HttpOptions } from "@google/genai"
import {
  generationFailureSchema,
  type GenerationFailure as FailureCode,
} from "@conversations/shared"

export type ContextMessage = { role: "user" | "assistant"; content: string }
export interface TextProvider {
  readonly available: boolean
  stream(
    context: readonly ContextMessage[],
    signal: AbortSignal
  ): AsyncIterable<string>
}
export class GenerationFailure extends Error {
  constructor(readonly code: FailureCode) {
    super("Text generation failed")
  }
}
export function failureCode(error: unknown): FailureCode {
  return error instanceof GenerationFailure &&
    generationFailureSchema.safeParse(error.code).success
    ? error.code
    : "provider_error"
}

/** Application-owned interface; SDK response objects never leave this adapter. */
export function geminiProvider(options: {
  apiKey?: string
  model: string
  timeoutMs: number
  httpOptions?: HttpOptions
}): TextProvider {
  const client = options.apiKey
    ? new GoogleGenAI({
        apiKey: options.apiKey,
        httpOptions: {
          ...options.httpOptions,
          timeout: options.timeoutMs,
          retryOptions: { attempts: 1 },
        },
      })
    : undefined
  return {
    available: !!client,
    async *stream(context, signal) {
      if (!client) throw new GenerationFailure("provider_unavailable")
      const contents: Content[] = []
      for (const message of context) {
        const role = message.role === "assistant" ? "model" : "user"
        const last = contents.at(-1)
        if (last?.role === role) last.parts?.push({ text: message.content })
        else contents.push({ role, parts: [{ text: message.content }] })
      }
      try {
        const response = await client.models.generateContentStream({
          model: options.model,
          contents,
          config: {
            abortSignal: signal,
            maxOutputTokens: 16384,
            candidateCount: 1,
          },
        })
        let stopped = false
        for await (const chunk of response) {
          if (chunk.promptFeedback?.blockReason)
            throw new GenerationFailure("provider_error")
          const candidate = chunk.candidates?.[0]
          if (candidate?.finishReason && candidate.finishReason !== "STOP")
            throw new GenerationFailure(
              candidate.finishReason === "MAX_TOKENS"
                ? "output_limit"
                : "provider_error"
            )
          for (const part of candidate?.content?.parts ?? [])
            if (!part.thought && typeof part.text === "string") yield part.text
          if (candidate?.finishReason === "STOP") stopped = true
        }
        if (!stopped) throw new GenerationFailure("provider_error")
      } catch (error) {
        throw error instanceof GenerationFailure
          ? error
          : new GenerationFailure("provider_error")
      }
    },
  }
}

export function deterministicProvider(): TextProvider {
  return {
    available: true,
    async *stream(context, signal) {
      if (signal.aborted) throw new GenerationFailure("interrupted")
      yield "Test response: "
      yield context.at(-1)?.content ?? ""
    },
  }
}
