# Slice 1: Durable voice conversation

Parent issue: [#15 — Durable voice conversation redo](https://github.com/justin212407/Conversations/issues/15).

## Outcome

A developer signs in, creates a conversation, speaks or types, sees streaming responses, leaves/reloads, and later continues the same durable conversation with its prior context.

The slice includes the separately runnable API, worker, and realtime services; PostgreSQL/Drizzle persistence; Clerk account ownership; the Vapi adapter; text fallback; tests; observability; local Docker Compose; and one production deployment.

Source context: [Decisions](decisions.md) and [Project report](project-report.md).

## Work index

GitHub is the source of truth for issue state and acceptance checkboxes. The parent has both native sub-issues and a completion checklist. This index maps the work and its dependencies without maintaining a second progress count.

| Issue | Deliverable | Prerequisites |
| --- | --- | --- |
| [#16](https://github.com/justin212407/Conversations/issues/16) | Finalize scope, conversation lifecycle, and service contracts | First work item |
| [#17](https://github.com/justin212407/Conversations/issues/17) | Scaffold API, worker, realtime, and local infrastructure | [#16](https://github.com/justin212407/Conversations/issues/16) |
| [#18](https://github.com/justin212407/Conversations/issues/18) | Add PostgreSQL persistence and Clerk account authorization | [#16](https://github.com/justin212407/Conversations/issues/16), [#17](https://github.com/justin212407/Conversations/issues/17) |
| [#19](https://github.com/justin212407/Conversations/issues/19) | Implement versioned conversation and message APIs | [#18](https://github.com/justin212407/Conversations/issues/18) |
| [#20](https://github.com/justin212407/Conversations/issues/20) | Implement text fallback and the basic BullMQ worker flow | [#19](https://github.com/justin212407/Conversations/issues/19) |
| [#21](https://github.com/justin212407/Conversations/issues/21) | Implement authenticated WebSocket streaming and recovery | [#19](https://github.com/justin212407/Conversations/issues/19) |
| [#22](https://github.com/justin212407/Conversations/issues/22) | Build the developer conversation workspace and replace Convex bindings | [#20](https://github.com/justin212407/Conversations/issues/20), [#21](https://github.com/justin212407/Conversations/issues/21) |
| [#23](https://github.com/justin212407/Conversations/issues/23) | Add the Vapi adapter, durable transcripts, and contextual voice resume | [#22](https://github.com/justin212407/Conversations/issues/22) |
| [#24](https://github.com/justin212407/Conversations/issues/24) | Add cross-service observability and production security basics | [#17](https://github.com/justin212407/Conversations/issues/17), [#18](https://github.com/justin212407/Conversations/issues/18) |
| [#25](https://github.com/justin212407/Conversations/issues/25) | Establish CI and verify the complete conversation lifecycle | [#17](https://github.com/justin212407/Conversations/issues/17) |
| [#26](https://github.com/justin212407/Conversations/issues/26) | Complete Convex cutover, deploy, and record release evidence | [#16](https://github.com/justin212407/Conversations/issues/16), [#17](https://github.com/justin212407/Conversations/issues/17), [#18](https://github.com/justin212407/Conversations/issues/18), [#19](https://github.com/justin212407/Conversations/issues/19), [#20](https://github.com/justin212407/Conversations/issues/20), [#21](https://github.com/justin212407/Conversations/issues/21), [#22](https://github.com/justin212407/Conversations/issues/22), [#23](https://github.com/justin212407/Conversations/issues/23), [#24](https://github.com/justin212407/Conversations/issues/24), [#25](https://github.com/justin212407/Conversations/issues/25) |

CI (#25) starts after the service foundation and gains test coverage with each feature. Observability (#24) starts once the foundation and account boundary exist and is completed as the service paths land. Their end-to-end acceptance remains open until those flows are verified.

## Implementation decisions

Issue [#16](https://github.com/justin212407/Conversations/issues/16) is implemented through the [architecture](../specs/architecture.md), [lifecycle](../specs/behaviors/conversation-lifecycle.md), and [API contracts](../specs/api/conversations.md). The user explicitly chose a fresh PostgreSQL workspace while preserving existing Convex data untouched. The implementation targets `apps/web`, defers projects to Slice 4, and retains the legacy widget during transition. Fastify, Railway, and Pino/OpenTelemetry/Prometheus are the initial framework, deployment target, and observability choices. Real provider and production validation remain later acceptance work.

The [foundation plan](../plans/service-foundation.md) and [conversation plan](../plans/durable-conversation.md) connect the specs to the issue work. Their desired behavior is not evidence that a feature is already running.

## Working on an issue

1. Read its acceptance criteria, prerequisites, and relevant docs/specs.
2. Record the issue being worked on and link the implementation branch or PR.
3. Keep changes scoped to that issue and include its required tests and diagnostics.
4. Post meaningful progress using the template below. Tick a checkbox only when supporting evidence exists.
5. When behavior or scope changes, update the documented contract and affected issue criteria explicitly. Keep unresolved work visible.
6. Close the issue after implementation is merged and acceptance is verified. Use `Closes #N` in a PR only when that PR completes the issue; use `Refs #N` for partial work.
7. Check the corresponding parent checklist item when the sub-issue is completed. Close the parent only after the complete deployed voice/text lifecycle is verified.

### Progress update template

```markdown
Changed:
- What behavior changed; PR/commit links.

Verified:
- Commands and results, or manual/deployment evidence.
- Which acceptance checkboxes this evidence satisfies.

Remaining:
- Unchecked work, blockers, or linked follow-up issues.

Decisions:
- Accepted scope/contract changes and links to the updated docs/specs.
```

Issue updates and linked PRs/commits record implementation history. Durable product and architecture decisions live in repository docs/specs. A partial implementation stays open; do not close an issue or remove an acceptance criterion simply to report completion.

For this checkout, maintain `docs/local-change-log.md` after every small change. Record affected files and code responsibilities, the actual resulting user flow, architectural changes, verification, and limitations. The journal is local-only, excluded through `.git/info/exclude`, and must never be force-added, committed, uploaded, or copied into public issue updates. Public issues receive concise progress and evidence separately.

## Slice boundary

Response caching and distributed rate limiting remain Slice 2. Deeper queue mechanics and experiments remain Slice 3. Project context/files remain Slice 4, with the project entity's timing resolved in #16. Agent tools, approvals, and orchestration remain Slice 5. Team collaboration, advanced roles, and Kubernetes are outside Slice 1.

## Tracking setup

On 2026-10-28, the parent and 11 sub-issues were created from the two source documents and the Slice 1 review. Implementation acceptance was left unchecked. The first next action is [#16](https://github.com/justin212407/Conversations/issues/16); this tracking setup does not mark any feature implemented.
