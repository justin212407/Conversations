import { exportSPKI, generateKeyPair, SignJWT } from "jose"
import { createApi } from "../dist/app.js"
import { ConversationStore, migrateDatabase } from "@conversations/database"
import { loadConfig } from "@conversations/service-runtime"
import { createTestDatabase } from "../../../packages/database/test/database-fixture.mjs"

export const frontendOrigin = "http://localhost:3000"
export async function createConversationApi(t) {
  const database = await createTestDatabase()
  let app
  t.after(async () => {
    if (app) await app.close()
    await database.close()
  })
  await migrateDatabase(database.pool)
  const keys = await generateKeyPair("RS256")
  const auth = {
    issuer: "https://fixture.clerk.accounts.dev",
    authorizedParties: [frontendOrigin],
    jwtKey: await exportSPKI(keys.publicKey),
  }
  const tokens = {}
  for (const actor of ["alice", "bob"]) {
    const now = Math.floor(Date.now() / 1000)
    tokens[actor] = await new SignJWT({
      sub: "user_api_" + actor,
      sid: "sess_" + actor,
      sts: "active",
      azp: frontendOrigin,
      iss: auth.issuer,
      iat: now,
      nbf: now - 1,
      exp: now + 300,
    })
      .setProtectedHeader({
        alg: "RS256",
        typ: "JWT",
        kid: "conversation-fixture",
      })
      .sign(keys.privateKey)
  }
  const store = new ConversationStore(database.pool)
  const logs = []
  app = createApi(
    loadConfig("api", {
      DATABASE_URL: database.connectionString,
      REDIS_URL: "redis://localhost",
      LOG_LEVEL: "info",
    }),
    { dependencies: [], close: async () => {} },
    store,
    auth,
    { write: (value) => logs.push(value) }
  )
  const request = (method, url, payload, actor = "alice", headers = {}) =>
    app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      headers: {
        ...(actor ? { authorization: "Bearer " + tokens[actor] } : {}),
        ...headers,
      },
    })
  const create = async (title = "Conversation", actor = "alice") => {
    const result = await request("POST", "/v1/conversations", { title }, actor)
    if (result.statusCode !== 201)
      throw new Error(
        "Conversation fixture creation failed with status " + result.statusCode
      )
    return result.json()
  }
  return { ...database, app, request, create, store, logs, tokens }
}
