FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile --ignore-scripts

# @livekit/rtc-node ships its native binary via per-platform optional deps
# (@livekit/rtc-ffi-bindings-*) that may need their install scripts to drop the
# `.node` binary into place. The repo-wide install runs `--ignore-scripts` to
# avoid running lefthook / husky hooks for monorepo packages, so we rebuild the
# realtime worker's native deps here. `pnpm rebuild` only runs install scripts
# for the targeted package tree — monorepo prepare hooks are not touched.
RUN pnpm rebuild @livekit/rtc-node || true

COPY apps/worker ./apps/worker

RUN pnpm --filter @echolore/worker build
RUN pnpm deploy --filter @echolore/worker --prod --ignore-scripts /prod/worker

# pnpm deploy copies only declared dependencies — re-run rebuild against the
# deployed worker tree so the runner image carries the extracted native binary.
RUN pnpm --dir /prod/worker rebuild @livekit/rtc-node || true

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=builder --chown=workeruser:nodejs /prod/worker ./

ENV NODE_ENV=production

USER workeruser

CMD ["node", "dist/index.js"]
