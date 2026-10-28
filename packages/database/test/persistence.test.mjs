import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  ConversationStore,
  ConversationConflict,
  ResourceNotFound,
  migrateDatabase,
  checkDatabaseSchema,
  migrationsFolder,
} from "../dist/index.js"
import { createTestDatabase } from "./database-fixture.mjs"

test("migrations install, upgrade, serialize and preserve the existing account", async () => {
  const database = await createTestDatabase()
  const folder = await mkdtemp(join(tmpdir(), "conversations-migrations-"))
  try {
    await assert.rejects(checkDatabaseSchema(database.pool))
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8")
    )
    await mkdir(join(folder, "meta"))
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) })
    )
    await copyFile(
      join(migrationsFolder, journal.entries[0].tag + ".sql"),
      join(folder, journal.entries[0].tag + ".sql")
    )
    await migrateDatabase(database.pool, folder)
    const store = new ConversationStore(database.pool)
    const before = await store.provisionAccount("user_upgrade")
    await assert.rejects(checkDatabaseSchema(database.pool))
    await Promise.all([
      migrateDatabase(database.pool),
      migrateDatabase(database.pool),
      migrateDatabase(database.pool),
    ])
    await checkDatabaseSchema(database.pool)
    assert.deepEqual(await store.provisionAccount("user_upgrade"), before)
    assert.equal(
      (
        await database.pool.query(
          "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
        )
      ).rows[0].count,
      2
    )
    await migrateDatabase(database.pool)
    const conversation = await store.createConversation(before.id)
    assert.equal(conversation.accountId, before.id)
    await database.pool.query(
      "UPDATE drizzle.__drizzle_migrations SET hash = 'altered' WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations)"
    )
    await assert.rejects(checkDatabaseSchema(database.pool), /pending/)
  } finally {
    await rm(folder, { recursive: true, force: true })
    await database.close()
  }
})

test("account provisioning is unique under concurrent requests", async () => {
  const database = await createTestDatabase()
  try {
    await migrateDatabase(database.pool)
    const store = new ConversationStore(database.pool)
    const accounts = await Promise.all(
      Array.from({ length: 24 }, () =>
        store.provisionAccount("user_concurrent")
      )
    )
    assert.equal(new Set(accounts.map((account) => account.id)).size, 1)
    assert.equal(
      (await database.pool.query("SELECT count(*)::int AS count FROM accounts"))
        .rows[0].count,
      1
    )
    assert.notEqual(
      (await store.provisionAccount("user_other")).id,
      accounts[0].id
    )
    await assert.rejects(store.provisionAccount(""))
  } finally {
    await database.close()
  }
})

test("ownership scopes reads, writes and the shared subscription authorization boundary", async () => {
  const database = await createTestDatabase()
  try {
    await migrateDatabase(database.pool)
    const store = new ConversationStore(database.pool)
    const alice = await store.provisionAccount("user_alice")
    const bob = await store.provisionAccount("user_bob")
    const a = await store.createConversation(alice.id, "Alice")
    const b = await store.createConversation(bob.id, "Bob")
    const input = {
      role: "user",
      modality: "text",
      content: "private",
      state: "completed",
    }
    const [message] = await store.appendMessages(alice.id, a.id, [input])
    const [other] = await store.appendMessages(bob.id, b.id, [input])
    for (const action of [
      () => store.getConversation(bob.id, a.id),
      () => store.updateConversation(bob.id, a.id, { title: "stolen" }),
      () => store.updateConversation(bob.id, a.id, { status: "deleted" }),
      () => store.appendMessages(bob.id, a.id, [input]),
      () => store.listMessages(bob.id, a.id),
      () => store.getMessage(bob.id, a.id, message.id),
      () =>
        store.updateMessage(bob.id, a.id, message.id, {
          content: "stolen",
          state: "completed",
        }),
      () => store.authorizeSubscription(bob.id, a.id),
      () => store.getMessage(alice.id, a.id, other.id),
      () => store.getConversation(alice.id, randomUUID()),
      () => store.getConversation(alice.id, "not-a-uuid"),
    ])
      await assert.rejects(action(), ResourceNotFound)
    assert.deepEqual(await store.authorizeSubscription(alice.id, a.id), {
      accountId: alice.id,
      conversationId: a.id,
    })
    assert.equal(
      (await store.getMessage(alice.id, a.id, message.id)).content,
      "private"
    )
    await store.updateConversation(alice.id, a.id, { status: "archived" })
    await assert.rejects(
      store.appendMessages(alice.id, a.id, [input]),
      ConversationConflict
    )
    await store.updateConversation(alice.id, a.id, { status: "deleted" })
    await assert.rejects(
      store.getConversation(alice.id, a.id),
      ResourceNotFound
    )
    await assert.rejects(
      store.authorizeSubscription(alice.id, a.id),
      ResourceNotFound
    )
    await assert.rejects(store.listMessages(alice.id, a.id), ResourceNotFound)
  } finally {
    await database.close()
  }
})

test("message sequence allocation is concurrent, rolls back, and strips surplus fields", async () => {
  const database = await createTestDatabase()
  try {
    await migrateDatabase(database.pool)
    const store = new ConversationStore(database.pool)
    const alice = await store.provisionAccount("user_sequences")
    const bob = await store.provisionAccount("user_surplus")
    const a = await store.createConversation(alice.id)
    const b = await store.createConversation(bob.id)
    const input = {
      role: "assistant",
      modality: "voice",
      content: "response",
      state: "completed",
    }
    const batches = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.appendMessages(alice.id, a.id, [input, input])
      )
    )
    const ordered = await store.listMessages(alice.id, a.id)
    assert.deepEqual(
      ordered.map((message) => message.sequence),
      Array.from({ length: 40 }, (_, i) => i + 1)
    )
    assert.equal(new Set(batches.flat().map((message) => message.id)).size, 40)
    await assert.rejects(
      store.appendMessages(alice.id, a.id, [{ ...input, id: ordered[0].id }])
    )
    const [after] = await store.appendMessages(alice.id, a.id, [
      { ...input, sequence: 999, conversationId: b.id },
    ])
    assert.equal(after.sequence, 41)
    assert.equal(after.conversationId, a.id)
    await store.updateConversation(alice.id, a.id, {
      title: "Safe",
      accountId: bob.id,
      id: b.id,
      nextMessageSequence: 999,
    })
    assert.equal(
      (await store.getConversation(alice.id, a.id)).accountId,
      alice.id
    )
    const updated = await store.updateMessage(alice.id, a.id, after.id, {
      content: "Updated",
      state: "completed",
      id: ordered[0].id,
      conversationId: b.id,
      sequence: 999,
    })
    assert.equal(updated.id, after.id)
    assert.equal(updated.sequence, 41)
    assert.equal(updated.conversationId, a.id)
    await assert.rejects(
      database.pool.query(
        "INSERT INTO conversations (account_id, title) VALUES ($1, 'orphan')",
        [randomUUID()]
      )
    )
    await assert.rejects(
      database.pool.query(
        "INSERT INTO messages (conversation_id, sequence, role, modality, content, state) VALUES ($1, 0, 'user', 'text', '', 'completed')",
        [a.id]
      )
    )
    await assert.rejects(
      database.pool.query(
        "INSERT INTO messages (conversation_id, sequence, role, modality, content, state) VALUES ($1, 1, 'user', 'text', '', 'completed')",
        [a.id]
      )
    )
  } finally {
    await database.close()
  }
})
