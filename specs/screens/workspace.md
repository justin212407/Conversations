# Screen: Personal conversation workspace

## Routes and identity

The signed-in root redirects to `/conversations`. `/conversations` shows the personal conversation list and an empty selection; `/conversations/:id` opens one owned conversation. Clerk sign-in/sign-up return to this workspace without organization selection. The active path has no Convex provider, query or organization dependency. Existing widget/backend data remain untouched. Stale organization-selection links redirect to the personal workspace.

The browser obtains an internal account through authenticated `GET /v1/me`; account IDs never select another owner. Account/session changes stop the old connection and clear its visible state before loading another account. Missing, deleted and inaccessible conversations share an unavailable state with a way back to the list. No fixture or development flag bypasses production Clerk/API verification.

## Layout and display

Reuse the existing theme, responsive sidebar, buttons and shared AI conversation/message/input primitives. Navigation uses developer-workspace language, personal identity and conversations; support/widget configuration, organization selection and unimplemented projects/files/tools do not appear as active destinations. Voice controls arrive with the voice feature, and the text flow never requests microphone permission.

The sidebar lists owned conversations, newest first, with active/archived filters, selected state and explicit pagination. Creation opens the new durable conversation. The detail header shows title/status and rename/archive/unarchive/delete actions; destructive deletion requires confirmation. Lifecycle conflicts preserve the current conversation and explain that an active response must finish or be recovered first.

The message area displays persisted turns in sequence, distinguishes user/assistant and modality, and renders streaming content as provisional. Older history loads through the existing cursor without duplicate message IDs. Subscribe-before-snapshot reconciliation uses the merged shared transport; React does not implement a second socket protocol. A reconnect may reload the recent window and reset older-page controls, while persisted older history remains retrievable.

Loading, empty, unavailable, failed and reconnect states are visible and readable. Pending/running responses show progress. Failed/interrupted assistant turns retain partial content, safe failure feedback and a controlled retry action. Terminal persisted state always dominates late provisional updates. Status updates use restrained accessible announcements rather than announcing every streamed token.

## Actions and recovery

The composer accepts up to16000 Unicode code points, supports multiline Enter and Ctrl/Command+Enter submission, and exposes an accessible Send button. Only one active operation is admitted. Draft editing may continue while a response runs, but another turn cannot be sent until current state is known and admission is free. Oversized input/context errors are explicit; history is never silently removed to fit a model request.

Each text/retry intent receives one UUID. An uncertain network/503 outcome retains exactly that identity and payload; checking delivery replays it rather than creating another user turn. A bounded session-local pending intent is scoped to the internal account/conversation and survives reload until acknowledged or definitively rejected; tokens and completed transcripts are not stored there. No duplicate optimistic user message is appended beside authoritative history. Controlled retry uses a new request UUID and the original failed operation, preserving its original user turn. Expired active operations expose explicit recovery instead of silently resubmitting.

Reload/reopen fetches the same owned persisted history, and continuing retains the server's completed context. Reconnect, uncertain delivery and safe errors provide explicit recovery controls. API error responses and provider failure codes map to concise user feedback without raw URLs, credentials, driver messages or SDK errors.

## Accessibility and responsiveness

Keyboard users can create/select conversations, load more history, edit titles, send/retry and operate lifecycle confirmation. Controls have labels, focus remains usable after actions, and mobile navigation can open/close without horizontal overflow. Main content and input remain usable at narrow and desktop widths. Completed messages are selectable/readable, and the composer remains reachable during long histories.

## Scope

This screen consumes the existing account, conversation, generation and recovery interfaces. Voice orchestration is #23; projects/files/tools, collaborative presence, deployment and broader diagnostics remain separately tracked. Real-user Clerk/browser evidence is distinguished from deterministic test fixtures.
