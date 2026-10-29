# Slice 1 API and event contracts

## Conventions

JSON REST under `/v1`; an OpenAPI 3.1 document describes all implemented routes. User routes require a verified Clerk bearer token. Health routes are unauthenticated and reveal no credentials. Provider ingestion uses independent server authentication.

The implemented document is published at public `GET /openapi.json`. Browser REST calls use the configured frontend-origin allowlist, permit Authorization/Content-Type and implemented methods, and handle preflight outside user authentication. No wildcard origin or credentialed-cookie CORS is required. Automatic HTTP HEAD/preflight transport support does not imply additional product endpoints.

Errors have `{ error: { code, message }, requestId }`. Validation is 400; missing/invalid credentials 401; inaccessible/missing resources 404; state/idempotency conflicts 409; configured input/context limits 413; unavailable dependencies 503. Logs and responses never expose credentials.

UUIDs identify resources and request identities. Timestamps are UTC ISO 8601. List responses use `{ items, nextCursor }`. Cursors are opaque, validated, and scoped to the requested resource/ordering.

Conversation cursors preserve full PostgreSQL timestamp precision and bind account/filter/ordering; message cursors bind account/conversation/ordering. Invalid calendar values and cross-scope cursors return 400. Character limits count Unicode code points. Payloads and query parameters reject unknown fields rather than silently granting new capabilities.

## Routes

| Method/path                                              | Request                                            | Response                                                     |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| GET /v1/me                                               | Clerk identity                                     | Internal account projection                                  |
| POST /v1/conversations                                   | Optional title, at most 120 characters             | 201 conversation                                             |
| GET /v1/conversations                                    | Cursor/limit, optional active/archived filter      | Conversations ordered by updated time then ID descending     |
| GET /v1/conversations/:id                                | Owned ID                                           | Conversation                                                 |
| PATCH /v1/conversations/:id                              | Title and/or active/archived status                | Updated conversation                                         |
| DELETE /v1/conversations/:id                             | Owned ID; no active operation                      | 204; soft-deleted                                            |
| GET /v1/conversations/:id/messages                       | Cursor/limit                                       | Ordered message page                                         |
| POST /v1/conversations/:id/messages                      | clientRequestId UUID, content (1–16000 characters) | 202 accepted operation and stable user/assistant message IDs |
| POST /v1/conversations/:id/operations/:operationId/retry | New clientRequestId UUID                           | 202 controlled retry                                         |
| POST /v1/conversations/:id/voice-sessions                | clientRequestId UUID                               | Authorized session and browser-safe provider configuration   |
| POST /v1/conversations/:id/voice-sessions/:sessionId/end | Owned session                                      | Accepted end/reconciliation state                            |
| POST /v1/realtime-tickets                                | Owned conversationId                               | One-use ticket, WebSocket URL, expiration                    |
| POST /v1/providers/vapi/events                           | Authenticated provider event                       | Acknowledgement after durable ingestion                      |
| GET /health/live                                         | None                                               | Process is serving                                           |
| GET /health/ready                                        | None                                               | 200 ready or 503 dependency/shutdown failure                 |

The contract records the desired slice. Unimplemented routes must not return fake success responses or appear in a runtime OpenAPI document as working.

Conversation responses contain `id`, `title`, `status`, `createdAt`, and `updatedAt`. The owned detail route additionally returns `activeOperation` (the current admission projection or null), enabling explicit recovery after reload. Deleted records are omitted from normal responses. Admission returns `operationId`, `conversationId`, `userMessageId`, `assistantMessageId`, `status`, `expiresAt`, and nullable `failureCode`; a 202 promises durable pending command/message/handoff storage, not a generated answer. Exact replay returns the same identities and current operation status.

Client request IDs are unique within an authenticated account across conversations and command shapes. Reusing one for changed content, another conversation, or another command conflicts. Controlled retries use a new request ID, preserve the original user turn, and allocate a new assistant/operation identity. An expired pending/running text operation can be explicitly interrupted through the retry route before replacement; a non-expired active operation conflicts. Initial text admission leases last five minutes. Common finalized result content is bounded to 64000 Unicode characters; input/context limits remain explicit errors.

## WebSocket boundary

The API issues a conversation-scoped ticket valid for 60 seconds. Redis stores its one-use state; realtime redeems it atomically and obtains only its authorized account/conversation scope. Do not send Clerk tokens in socket query strings. Ticket-bearing URLs are redacted from logs. Connections enforce allowed Origin and bounded payload size.

Server envelopes use `{ version: 1, eventId, type, conversationId, sequence, occurredAt, payload }`. Planned durable types include conversation updates, message completion/failure, and voice-session lifecycle events. Transient message deltas have message identity and a replaceable partial snapshot. Event payloads contain application concepts, not Vapi/Convex objects.

Server ping/pong detects stale sockets. Clients reconnect with bounded exponential backoff and jitter, acquire a new ticket, and reconcile persisted history. Connections cannot subscribe to arbitrary conversations after authentication. Revoked/deleted/inaccessible conversations lose their subscription access.

### Connection and reconciliation protocol

`POST /v1/realtime-tickets` accepts exactly `{ conversationId }` and returns201 with opaque ticket, WebSocket URL and expiration. Issuance verifies the Clerk user session and conversation ownership. Ticket lifetime is at most60 seconds and never outlives that JWT. Ticket redemption is atomic and one-use, bound to the exact allowed browser Origin. The socket URL carries only that opaque ticket; Clerk credentials stay in authenticated API requests and bounded server-side TTL state.

Realtime redeems tickets and rechecks access through authenticated internal API endpoints, using a separate high-entropy service secret. These endpoints are not browser capabilities and never bypass Clerk verification. The API re-verifies the original session signature/claims/expiry and current account/conversation access; inaccessible or unavailable checks fail closed. A socket never outlives its JWT or a five-minute connection lease. Stateless Clerk JWT revocation can remain effective until token expiry; immediate upstream session revocation is not claimed without a separate online session-status check. Fresh connections require fresh tickets and current session verification.

One socket has one immutable conversation scope. It initially subscribes, then accepts only strict version1 `subscribe`/`unsubscribe` controls for that same scope; arbitrary account/conversation fields are invalid. Server `connection.ready` acknowledges Redis subscription before client reconciliation; `connection.unsubscribed` acknowledges cleanup. These controls report local connection presence, not collaborative user presence. Heartbeat uses WebSocket ping/pong. Client controls are bounded to1024 bytes, server event frames to512KiB, and unsent/reconciliation buffers are bounded; overflow closes the connection and requires recovery.

`GET /v1/conversations/:id/snapshot` returns the owned conversation, active operation, latest ordered message page and durable `checkpoint` from one consistent transaction. Query `limit` defaults to50, maximum100. Messages/page cursors retain the history contract. The browser establishes subscription before fetching this snapshot, buffers concurrent delivery, applies the snapshot at its checkpoint and then applies contiguous later durable events. Replayed IDs/sequences cannot apply twice; gaps/out-of-order delivery force another authoritative snapshot. Persisted terminal messages dominate late partial snapshots. Older history is loaded using the existing paginated endpoint.

Redis pub/sub interruption, lost subscription, server restart, failed authorization recheck, heartbeat failure or buffer overflow closes affected sockets. No reconnect silently claims continuity: the browser obtains a fresh ticket, waits for subscription acknowledgement and reconciles again. Reconnect delay has bounded exponential backoff and jitter. Shutdown removes subscriptions, grants, timers and sockets before infrastructure closes.

## Job boundary

The generation command contains version, operation ID, account ID, conversation ID, input message ID, and correlation context. The worker reloads authoritative data and state before execution; queue payloads do not replace authorization or concurrency checks. Completion/failure uses the same domain transitions as the API.

`packages/shared` owns the browser-safe `textGenerationJobSchema` and `domainEventSchema` contracts. Durable event kinds cover conversation create/update/delete, message create/complete/fail/interrupt, and operation accept/complete/fail/interrupt. Envelope and nested conversation identities must match, as must terminal event/state pairs. Transcript or provider credentials never belong in job metadata.

PostgreSQL handoff rows retain stable delivery identities until acknowledgement. A trusted relay claims with a bounded lease and acknowledges only after downstream acceptance; expired claims can replay, and stale claim tokens cannot acknowledge them. Event first-publication order is conversation-local; consumers still deduplicate replayed IDs and reconcile history. Finalization and its event commit in one transaction, and duplicate matching finalization does not duplicate history or events. Trusted text/voice adapters map stable application delivery IDs to finalized turns; identical utterances with different identities remain distinct. Browser captions alone cannot use this trusted final-write seam.

## Text execution and provisional snapshots

Context admission/execution bounds are100 completed messages and 64000 Unicode code points, including completed voice turns. Over-limit admission returns 413 before 202; retries retain their original input cutoff. Message history includes nullable `operationId` and safe `failureCode` for reload/retry discovery. Failure codes are `provider_unavailable`, `provider_error`, `timeout`, `context_limit`, `output_limit`, `interrupted`, and `expired`.

`provisionalMessageSnapshotSchema` defines `message.snapshot` on `provisionalChannel(conversationId)`. Its versioned envelope carries the observed durable checkpoint (possibly 0); payload carries message/operation/public-stream UUIDs, increasing revision, streaming state and replaceable content. It allocates no durable sequence. Terminal persisted states dominate all late snapshots. Optional validated request correlation (`requestId`, W3C `traceparent` and bounded `tracestate`) crosses commands, result events and snapshots; it carries no transcript or credentials.
