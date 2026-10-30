# Personal conversation workspace

`apps/web` is the personal developer workspace. Clerk sign-in reaches `/conversations`; a selected conversation uses `/conversations/:id`. There is no organization-selection or Convex requirement in this path. The existing theme, responsive sidebar and shared AI history/message/input components are retained. Legacy widget/backend source and data remain untouched. Voice controls belong to #23 after this feature merges.

## User flow

Create or select an owned conversation in the sidebar. Active/archived filters and explicit list pagination keep navigation bounded. The detail route subscribes through the shared connection module before applying its authoritative history snapshot. Load earlier messages through the existing cursor; completed turns remain stored when leaving or reloading. Reconnect reloads the recent window and can reset earlier-page controls, while older history remains retrievable.

Enter multiline text and use Send or Ctrl/Command+Enter. Input counts Unicode code points and enforces the API's 16000-character limit. The UI does not append duplicate optimistic messages: pending, provisional and completed turns use the server's identities. A response in progress blocks another admission while allowing an unsent draft. Failures preserve partial text, explain the safe failure code and expose controlled retry. Retry retains the original user turn; expired operations expose explicit recovery. Rename/archive/unarchive/delete use the existing owned lifecycle routes, with confirmation before deletion and visible conflict feedback.

If delivery is uncertain, Check delivery replays exactly the same UUID/body, including after an expired session is repaired. Authentication/access errors do not establish whether an earlier delivery committed, so they retain that identity through reload. A session-local pending store is scoped to internal account/conversation and capped at 20 intents / 512 KiB. It stores only unconfirmed command payloads, never tokens or completed transcripts. A matching acknowledgement clears only that request ID. Full/corrupt/unavailable storage refuses new work rather than silently discarding uncertain identities. Review history before starting a new browser session if that local state cannot be recovered. Session/selection/intent fences prevent late responses from overwriting a newly selected conversation or draft.

The sidebar, composer, menus and dialogs have keyboard labels; mobile navigation closes after selection or accepted creation. Text use never requests microphone permission. Missing/deleted/foreign conversations show one unavailable state and clear their current history. The API still enforces ownership and operation limits independently of every UI guard.

## Code responsibilities

- `modules/workspace/api.ts` validates versioned API responses, obtains real Clerk bearer tokens and maps errors without exposing dependency payloads. A stable token source handles session refresh without rebuilding drafts.
- `pending.ts` owns bounded session-local request identity and matching-ID cleanup.
- `model.ts` owns account bootstrap, list/history pagination, draft/command/lifecycle state and stale-result fencing. It consumes the merged `createConversationConnection`; it does not implement a second socket protocol.
- `context.tsx` connects real Clerk and Next navigation to that store. The server dashboard layout and Clerk middleware protect routes; client account changes tear down old visible state.
- `workspace-screen.tsx` reuses shared sidebar, AI history/message/Markdown/input and dialog primitives. `page.tsx` selects the route's immutable conversation scope.

Frontend telemetry is optional and disabled without an explicit DSN. Replay, log and PII defaults are off; request/user/extra/context/raw-error data and URL breadcrumbs are removed. The obsolete Sentry build tunnel/upload wrapper is removed. SDK upgrades and full collectors/instrumentation remain #24/#25.

## Run and package

Compose's frontend profile supplies the existing Clerk keys and public API URL to the web process. It excludes every env/journal/browser-capture path from the image and builds shared contracts from clean source. Use `docker compose --profile frontend up --build -d` after configuring the ignored root environment; the web origin defaults to `http://localhost:4303` and must be in the API/realtime frontend allowlist.

For host development, supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `NEXT_PUBLIC_API_URL` through the process environment or an ignored `apps/web/.env.local`, then run `pnpm --filter web dev`. Next does not automatically read the service root `.env`. No Convex URL is needed. Sign-in/sign-up are `/sign-in` and `/sign-up`, with a workspace fallback. Real personal sessions must complete the Clerk instance's configured tasks; no missing credential or organization task permits an auth bypass.

Enable **Personal Accounts** in this instance's Clerk Dashboard under Organizations → Settings (membership optional). Otherwise Clerk can authenticate a user but leave the session `pending` with a `choose-organization` task; protected pages and the API correctly reject that session. This provider setting is required for the personal workspace and is separate from removing organization guards in the application. Clerk's supported backend settings API does not currently expose this toggle. See [Clerk's organization settings](https://clerk.com/docs/guides/organizations/configure#personal-accounts) and [session tasks](https://clerk.com/docs/guides/configure/session-tasks).

`dev`, `build`, `typecheck` and tests build `@conversations/shared` first. A clean production build is `pnpm --filter web build`; the public Clerk key is embedded at build time and must match the intended instance for actual sign-in. Keep one Next dev/type-generation/build writer per checkout. The implementation observed torn generated route types during overlapping cold restarts; stopping the preview and rebuilding the owned `.next` cache restored the expected auth/conversation routes. Generated caches contain no authoritative conversation data.

## Verification

`pnpm --filter web test` runs deterministic controller/API/storage cases. `pnpm --filter web test:integration` exercises actual signed Clerk verification, isolated PostgreSQL/Redis/WebSockets and a deterministic text worker, including lost acknowledgement, full context, older history, reload and another-account isolation. These tests create/drop only unique temporary databases/queue prefixes.

`pnpm --filter web test:browser:serve` serves an explicit test-only UI on loopback, outside Next production routes. Its adapters are never selected by a production flag. `test/browser-check.mjs` exports a reusable Playwright interaction function: pass it a page navigated to that host to exercise history, keyboard send, failures/retry, delivery replay, lifecycle actions, reconnect and narrow rendering. The checked fixture requested no microphone access and had no horizontal overflow at 390×844. Deterministic fixtures do not prove a real Clerk user signed in; that live walkthrough is recorded separately before merge.
