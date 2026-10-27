# Conversations

Conversations is being rebuilt into a voice-first AI workspace for individual developers, with agent orchestration planned for later slices.

## Project tracking

- [Slice 1 parent issue and sub-issues](https://github.com/justin212407/Conversations/issues/15)
- [Slice 1 work index and progress workflow](docs/slice-1.md)
- [Product and architecture decisions](docs/decisions.md)
- [Project report](docs/project-report.md)

## Service development

The Slice 1 service foundation has its own [local development guide](docs/development.md), including Docker Compose, dependency-aware health checks, a worker queue probe, and verification commands. The conversation features remain tracked by the linked issues.

## UI development

This is a Next.js monorepo template with shadcn/ui.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```
