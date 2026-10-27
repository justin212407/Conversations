# Slice 1 API and event contracts

## Conventions

JSON REST under `/v1`; an OpenAPI 3.1 document describes all implemented routes. User routes require a verified Clerk bearer token. Health routes are unauthenticated and reveal no credentials. Provider ingestion uses independent server authentication.

Errors have `{ error: { code, message }, requestId }`. Validation is 400; missing/invalid credentials 401; inaccessible/missing resources 404; state/idempotency conflicts 409; configured input/context limits 413; unavailable dependencies 503. Logs and responses never expose credentials.

UUIDs identify resources and request identities. Timestamps are UTC ISO 8601. List responses use `{ items, nextCursor }`. Cursors are opaque, validated, and scoped to the requested resource/ordering.

## Routes

| Method/path | Request | Response |
| --- | --- | --- |
| GET /v1/me | Clerk identity | Internal account projection |
| POST /v1/conversations | Optional title, at most 120 characters | 201 conversation |
| GET /v1/conversations | Cursor/limit, optional active/archived filter | Conversations ordered by updated time then ID descending |
| GET /v1/conversations/:id | Owned ID | Conversation |
| PATCH /v1/conversations/:id | Title and/or active/archived status | Updated conversation |
| DELETE /v1/conversations/:id | Owned ID; no active operation | 204; soft-deleted |
| GET /v1/conversations/:id/messages | Cursor/limit | Ordered message page |
| POST /v1/conversations/:id/messages | clientRequestId UUID, content (1–16000 characters) | 202 accepted operation and stable user/assistant message IDs |
| POST /v1/conversations/:id/operations/:operationId/retry | New clientRequestId UUID | 202 controlled retry |
| POST /v1/conversations/:id/voice-sessions | clientRequestId UUID | Authorized session and browser-safe provider configuration |
| POST /v1/conversations/:id/voice-sessions/:sessionId/end | Owned session | Accepted end/reconciliation state |
| POST /v1/realtime-tickets | Owned conversationId | One-use ticket, WebSocket URL, expiration |
| POST /v1/providers/vapi/events | Authenticated provider event | Acknowledgement after durable ingestion |
| GET /health/live | None | Process is serving |
| GET /health/ready | None | 200 ready or 503 dependency/shutdown failure |

The contract records the desired slice. Unimplemented routes must not return fake success responses or appear in a runtime OpenAPI document as working.

## WebSocket boundary

The API issues a conversation-scoped ticket valid for 60 seconds. Redis stores its one-use state; realtime redeems it atomically and obtains only its authorized account/conversation scope. Do not send Clerk tokens in socket query strings. Ticket-bearing URLs are redacted from logs. Connections enforce allowed Origin and bounded payload size.

Server envelopes use `{ version: 1, eventId, type, conversationId, sequence, occurredAt, payload }`. Planned durable types include conversation updates, message completion/failure, and voice-session lifecycle events. Transient message deltas have message identity and a replaceable partial snapshot. Event payloads contain application concepts, not Vapi/Convex objects.

Server ping/pong detects stale sockets. Clients reconnect with bounded exponential backoff and jitter, acquire a new ticket, and reconcile persisted history. Connections cannot subscribe to arbitrary conversations after authentication. Revoked/deleted/inaccessible conversations lose their subscription access.

## Job boundary

The generation command contains version, operation ID, account ID, conversation ID, input message ID, and correlation context. The worker reloads authoritative data and state before execution; queue payloads do not replace authorization or concurrency checks. Completion/failure uses the same domain transitions as the API.
