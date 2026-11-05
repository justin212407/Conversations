import { z } from "zod"
import {
  messageDataSchema,
  operationAdmissionSchema,
} from "@conversations/shared"

export const conversationSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.enum(["active", "archived"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type Conversation = z.infer<typeof conversationSchema>
const accountSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
const conversationPage = z
  .object({
    items: z.array(conversationSchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
const messagePage = z
  .object({
    items: z.array(messageDataSchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
export class WorkspaceError extends Error {
  constructor(
    readonly status: number,
    readonly code = "UNAVAILABLE"
  ) {
    super("Workspace request could not be completed")
  }
  get uncertain() {
    return this.status === 0 || this.status >= 500
  }
}
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new WorkspaceError(0))
    signal.addEventListener("abort", abort, { once: true })
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
    if (signal.aborted) abort()
  })
}
export function createWorkspaceApi(options: {
  url: string
  getToken: () => Promise<string | null>
  fetch?: typeof fetch
}) {
  const http = options.fetch ?? globalThis.fetch
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    parent?: AbortSignal
  ) {
    const signal = parent
      ? AbortSignal.any([parent, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000)
    try {
      const token = await abortable(
        Promise.resolve().then(options.getToken),
        signal
      )
      if (!token) throw new WorkspaceError(401, "UNAUTHORIZED")
      const response = await abortable(
        http(options.url + path, {
          method,
          headers: {
            authorization: "Bearer " + token,
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal,
          cache: "no-store",
          redirect: "error",
        }),
        signal
      )
      if (!response.ok) {
        let code = "UNAVAILABLE"
        try {
          const error = await abortable(response.json(), signal)
          if (
            typeof error?.error?.code === "string" &&
            /^[A-Z_]{1,80}$/.test(error.error.code)
          )
            code = error.error.code
        } catch {
          // Ignore opaque dependency payloads; expose only the safe status/code.
        }
        throw new WorkspaceError(response.status, code)
      }
      return response.status === 204
        ? undefined
        : await abortable(response.json(), signal)
    } catch (error) {
      throw error instanceof WorkspaceError ? error : new WorkspaceError(0)
    }
  }
  return {
    account: async (signal?: AbortSignal) =>
      accountSchema.parse(await request("/v1/me", "GET", undefined, signal)),
    list: async (
      status: "active" | "archived",
      cursor?: string,
      signal?: AbortSignal
    ) =>
      conversationPage.parse(
        await request(
          "/v1/conversations?" +
            new URLSearchParams({
              status,
              limit: "20",
              ...(cursor ? { cursor } : {}),
            }),
          "GET",
          undefined,
          signal
        )
      ),
    create: async () =>
      conversationSchema.parse(await request("/v1/conversations", "POST", {})),
    patch: async (
      id: string,
      patch: { title?: string; status?: "active" | "archived" }
    ) =>
      conversationSchema.parse(
        await request(`/v1/conversations/${id}`, "PATCH", patch)
      ),
    remove: async (id: string) => {
      await request(`/v1/conversations/${id}`, "DELETE")
    },
    older: async (id: string, cursor: string, signal?: AbortSignal) =>
      messagePage.parse(
        await request(
          `/v1/conversations/${id}/messages?` +
            new URLSearchParams({ cursor, limit: "50" }),
          "GET",
          undefined,
          signal
        )
      ),
    submit: async (
      id: string,
      body: { clientRequestId: string; content: string }
    ) =>
      operationAdmissionSchema.parse(
        await request(`/v1/conversations/${id}/messages`, "POST", body)
      ),
    retry: async (id: string, operationId: string, clientRequestId: string) =>
      operationAdmissionSchema.parse(
        await request(
          `/v1/conversations/${id}/operations/${operationId}/retry`,
          "POST",
          { clientRequestId }
        )
      ),
  }
}
export type WorkspaceApi = ReturnType<typeof createWorkspaceApi>
/** Stable callback for session refresh without rebuilding the UI store/draft. */
export function sessionTokenSource(identity: string | null | undefined) {
  let provider: () => Promise<string | null> = async () => null
  return {
    getToken: () => (identity ? provider() : Promise.resolve(null)),
    update(next: () => Promise<string | null>) {
      provider = next
    },
  }
}
export function userError(error: unknown) {
  if (!(error instanceof WorkspaceError))
    return "Something went wrong. Please try again."
  if (error.status === 401)
    return "Your session needs attention. Sign in again, then retry."
  if (error.status === 404)
    return "This conversation is unavailable. Return to your conversations."
  if (error.status === 409)
    return "This conversation changed or already has a response in progress. Refresh it before trying again."
  if (error.status === 413)
    return "The message or conversation is too large. Shorten the message or start a new conversation."
  if (error.status === 400) return "Check your message or title and try again."
  return "The service is temporarily unavailable. Please try again."
}
