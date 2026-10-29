# Conversation lifecycle

## Account and conversation

A verified Clerk subject maps to exactly one internal personal account. Caller-supplied account IDs never grant access. An inaccessible conversation returns the same not-found response as a missing one.

A conversation has a stable UUID, account owner, title, timestamps, and status `active | archived | deleted`. Create/list/read/rename/archive/unarchive/soft-delete are supported. Deleted conversations are omitted from normal access. Only active conversations accept turns or voice sessions; a conflicting active operation returns 409.

Rename, archive/unarchive, and soft-delete serialize against operation admission and return 409 while an operation is active. An expired text admission is recovered explicitly through controlled retry rather than silently starting a second user turn.

Projects and agent runs are absent from Slice 1. Existing Convex data remains untouched.

## Messages and operations

A message has a stable UUID, conversation ID, conversation-local sequence, role `user | assistant`, modality `text | voice`, content, timestamps, and state `pending | streaming | completed | failed | interrupted`. Sequence allocation is transactional. Only completed text belongs to future model context; failed/interrupted content remains visible with its state.

One text generation or live voice session may be active per conversation. The API owns admission and terminal state. Expired/interrupted sessions release admission through an explicit recovery path; restart must not leave a permanent busy conversation.

Text submission supplies a client request UUID. Repeating the same request/payload returns the original operation; reusing its identity with a different payload returns 409. Duplicate queue execution or provider callbacks do not duplicate messages or completed responses.

Partial output is provisional and may be lost on disconnect. Finalized messages and their durable event/job handoff are committed transactionally before acknowledgement. The worker may stream provisional output but cannot claim completion before the result is persisted.

## Resume and failures

Reopen fetches the same conversation's persisted messages in order. Continue loads completed context from that history. A new voice call is a new provider session attached to the same conversation; it must receive prior completed context before responding. Slice 1 bounds accepted context and returns an explicit context-limit error rather than silently forgetting older turns.

Microphone denial leaves text input usable. Provider failure, job failure, and interruption have explicit visible states; they do not erase completed history. Retry is a new controlled operation referring to the failed turn, without resubmitting a duplicate user message.

When a call ends or the page closes, authenticated server events/final reports remain responsible for final transcript persistence. Browser-local transcript state is never the sole record.

## History and recovery

History is paginated by a stable sequence cursor, with a default limit of 50 and a maximum of 100. A page returns messages in ascending sequence and a cursor for older messages. Initial load returns the latest page; older pages prepend without duplicate IDs.

Realtime events have an event UUID, version, conversation ID, sequence, timestamp, and typed payload. Durable events are ordered per conversation and delivered at least once. Provisional text deltas are best effort and keyed by message ID. Clients deduplicate events, detect gaps, and reconcile with REST history after every reconnect. Subscription must be established before the reconciliation snapshot is applied so concurrent updates can be merged.

No later-slice queue feature is required to guarantee these baseline durability and ownership rules.

## Typed generation bounds and recovery

Text context includes every completed message (including voice) in sequence through the operation's original user input, exactly once. Admission and execution both enforce 100 completed messages and 64000 Unicode code points; admission returns 413 before accepting an oversized context. Retries retain that original cutoff. Output is bounded to 64000 code points. History exposes nullable operation identity and a safe failure code on assistant messages so reload can discover a retry without local browser memory.

One leased execution may call the provider for an operation. Duplicate queue deliveries cannot start another call or overwrite a terminal result. Provider calls time out before the five-minute operation lease. Bounded background recovery marks expired text operations interrupted, including after restart. Shutdown stops intake, cancels model work and persists interruption where dependencies remain available. Safe failure codes distinguish provider unavailability/error, timeout, context/output limits, interruption and expiry; raw provider errors remain private.

Provisional snapshots use a public stream UUID and increasing message revision. Their envelope sequence is the observed durable checkpoint, not a newly allocated durable event sequence. Consumers order snapshots by stream/revision and always give persisted terminal message state precedence over late snapshots. Snapshots are best effort and never constitute completion.
