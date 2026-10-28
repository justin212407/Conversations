# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

FROM base AS services
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/typescript-config ./packages/typescript-config
COPY packages/eslint-config ./packages/eslint-config
COPY packages/shared ./packages/shared
COPY packages/service-runtime ./packages/service-runtime
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY apps/realtime ./apps/realtime
RUN pnpm install --frozen-lockfile
RUN pnpm --filter '@conversations/*' -r build
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["node", "apps/api/dist/index.js"]

# Existing UI is opt-in during migration; dependencies are installed in-image.
FROM base AS frontend
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "dev", "--hostname", "0.0.0.0"]
