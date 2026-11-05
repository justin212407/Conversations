import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createWorkspaceApi,
  WorkspaceError,
  sessionTokenSource,
} from "../modules/workspace/api"

test("browser API sends only verified bearer commands and keeps dependency details out of safe errors", async () => {
  let captured: RequestInit | undefined
  const api = createWorkspaceApi({
    url: "https://api.fixture",
    getToken: async () => "local-signed-session",
    fetch: async (_url, init) => {
      captured = init
      return new Response(
        JSON.stringify({
          error: {
            code: "INPUT_LIMIT_EXCEEDED",
            message: "PRIVATE SDK transcript credential",
          },
        }),
        { status: 413 }
      )
    },
  })
  await assert.rejects(
    api.submit("owned-id", { clientRequestId: "stable-id", content: "Prompt" }),
    (error) =>
      error instanceof WorkspaceError &&
      error.status === 413 &&
      error.code === "INPUT_LIMIT_EXCEEDED" &&
      !error.message.includes("PRIVATE") &&
      !error.uncertain
  )
  assert.equal(captured?.redirect, "error")
  assert.equal(captured?.cache, "no-store")
  assert.equal(
    new Headers(captured?.headers).get("authorization"),
    "Bearer local-signed-session"
  )
  const noSession = createWorkspaceApi({
    url: "https://api.fixture",
    getToken: async () => null,
    fetch: async () => {
      throw new Error("Must not call network")
    },
  })
  await assert.rejects(
    noSession.account(),
    (error) => error instanceof WorkspaceError && error.status === 401
  )
  const unavailable = createWorkspaceApi({
    url: "https://api.fixture",
    getToken: async () => "fixture",
    fetch: async () => {
      throw new Error("PRIVATE network URL")
    },
  })
  await assert.rejects(
    unavailable.account(),
    (error) =>
      error instanceof WorkspaceError &&
      error.uncertain &&
      !error.message.includes("PRIVATE")
  )
})
test("session token callback stays stable while Clerk refreshes, and signed-out identity never supplies a token", async () => {
  const source = sessionTokenSource("fixture-user"),
    get = source.getToken
  source.update(async () => "first")
  assert.equal(await get(), "first")
  source.update(async () => "refreshed")
  assert.equal(source.getToken, get)
  assert.equal(await get(), "refreshed")
  const signedOut = sessionTokenSource(null)
  signedOut.update(async () => "never-expose")
  assert.equal(await signedOut.getToken(), null)
})
