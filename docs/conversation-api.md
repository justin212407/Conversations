# Durable conversation API

The implemented API supports personal conversation CRUD, paginated history, durable text admission, and controlled retry. Runtime OpenAPI 3.1 is available at `GET /openapi.json`; it includes health and identity routes and omits unimplemented voice, realtime, and provider endpoints. Fastify also serves automatic HEAD responses for GET routes and CORS preflight outside user authentication.

Use a real Clerk session token in `Authorization: Bearer ...`. The API derives the account from the verified session; account IDs supplied by clients do not select an owner. All user responses disable caching. Browser calls are permitted only from the configured Clerk frontend-origin allowlist, with Authorization/Content-Type and the implemented methods; no wildcard or credentialed-cookie CORS is enabled.

## Conversation and history flow

1. `POST /v1/conversations` with an optional `{ "title": "Debug a parser" }` creates an active conversation. An absent body uses `New conversation`. Titles contain 1–120 Unicode characters and must not be blank.
2. `GET /v1/conversations` returns `{ items, nextCursor }` in updated-time/ID descending order. Optional `status=active|archived` filters apply before pagination. Deleted conversations are omitted.
3. `GET /v1/conversations/:id` returns the owned conversation and `activeOperation` (an admission projection or null). Cross-account, deleted, and missing resources use the same 404 envelope.
4. `PATCH /v1/conversations/:id` renames and/or switches active/archived status. `DELETE` soft-deletes and returns 204 without a body. Any active operation conflicts with mutation; only active conversations accept new turns.
5. `GET /v1/conversations/:id/messages` returns the latest page in ascending stable sequence. Use `nextCursor` to retrieve older pages and prepend them. Default/max limits are 50/100. Conversation cursors retain PostgreSQL microseconds and are bound to account/filter/order; message cursors are bound to account/conversation/order. Reusing a cursor for another resource/filter or submitting malformed dates/limits returns 400.

For example, with a locally supplied token:

```sh
curl --fail http://localhost:4300/v1/conversations \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Debug a parser"}'
```

Conversation and message responses contain application UUIDs and UTC timestamps, never database counters, Clerk identities, provider objects, or credentials. Histories remain persisted through API restarts. A mutable conversation list is keyset-paginated rather than a frozen multi-request snapshot; clients should deduplicate IDs while merging live updates.

## Durable text admission and retry

`POST /v1/conversations/:id/messages` accepts exactly `{ clientRequestId, content }`, with a UUID and 1–16000 Unicode characters. Unknown fields, wrong types, blank/NUL input, malformed UUIDs/cursors, and unsupported state changes are rejected. Oversized content/titles/request bodies return 413. All application errors use `{ error: { code, message }, requestId }` and omit driver/SDK details.

A 202 response contains `operationId`, `conversationId`, `userMessageId`, `assistantMessageId`, `status`, and `expiresAt`. Before responding, one transaction commits the completed user message, pending assistant placeholder, operation, generation handoff, and application events. This feature does not run a model; the assistant remains pending until #20's worker consumes the handoff.

Request identities are scoped to the authenticated account. Exact replay returns the original operation/message identities and its current status. Reusing an identity with changed content, another conversation, or another command shape returns 409. A different account has an independent identity space. A database unique constraint and conversation row lock enforce one active text/voice operation.

To retry, send a new `{ clientRequestId }` to `POST /v1/conversations/:id/operations/:operationId/retry`. Failed/interrupted operations can admit a new assistant message and operation while reusing the original user message. The prior failed/interrupted assistant remains in history. Completed or non-expired active operations conflict. Initial text admission expires after five minutes; retrying an expired pending/running operation explicitly marks it interrupted and cancels its old job handoff before admitting the replacement. Merely reopening history does not silently start another operation.

## Server-only handoff and finalization

The server-only `ConversationStore` composes these interfaces:

- `commands.submitText` / `commands.retry`: owned transactional admission and replay protection.
- `commands.getOperation` / `commands.begin`: authoritative operation reload and execution-token admission. Competing execution tokens conflict; a duplicate of the same current execution is stable.
- `commands.finalize`: completed/failed/interrupted text results. A running operation requires its execution token; expired or superseded runs cannot overwrite a result. Duplicate identical finalization returns the original terminal operation; conflicting content/state returns 409. Result, final message, and sequenced event handoff commit together.
- `commands.persistFinalMessage`: trusted adapter persistence for finalized text/voice turns. A stable application delivery UUID deduplicates the same payload; reusing it with a changed role/modality/content conflicts. Repeated identical utterances with different delivery identities remain separate turns. #23 must authenticate provider callbacks and map registered provider turn identities; browser captions are not trusted final writes.
- `handoff.claim` / `handoff.acknowledge`: trusted relay access to pending `job` or `event` rows. Claims use a fresh token and default 30-second lease (1–60 seconds, at most 100 rows). Events expose only the earliest undelivered event per conversation to preserve first-publication ordering. Publish by stable row/event ID and acknowledge only after downstream acceptance. Interrupted publication leaves a replayable row; stale claims cannot acknowledge it. Delivery is at least once, so consumers deduplicate IDs and reconcile history.

`packages/shared` exports `textGenerationJobSchema`, `domainEventSchema`, and their browser-safe types. Producers validate these before committing JSONB. The text job carries only version, operation/account/conversation/input IDs, and request correlation. A future worker must reload authoritative ownership/state/context and use `commands.begin` before generation; a queue payload does not replace those checks. Event envelopes contain stable event ID, conversation sequence, timestamp, and application payload. Partial stream output remains provisional; only the finalization seam claims a completed result.

The older general message helpers refuse changes to operation-managed/finalized-delivery messages and refuse append while an operation is active. Consumers must use the domain transition interfaces rather than writing an assistant result independently.

## Verification and remaining work

Real PostgreSQL tests cover generated migration upgrade, constraints, concurrent duplicates/admission/finalization, execution leases, expired recovery, failed handoff rollback, stable publication replay/order, finalized text/voice receipts, and high-precision pagination. API tests use signed local RSA sessions through the actual Clerk SDK, covering ownership, validation/errors, durable HTTP replay/retry, OpenAPI scope, and allowed/disallowed browser origins. They use unique temporary databases and no external provider credentials.

Conversation worker generation (#20), authenticated application sockets (#21), workspace UI (#22), provider orchestration/real voice evidence (#23), broader observability/security (#24), full regression/dependency scanning (#25), and deployment/cutover (#26) remain separately tracked. Hosted CI uses the user's temporary reviewed-local-check exception. Railway access does not gate these local features, and Vapi stays on its existing free plan.
