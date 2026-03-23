FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/worker ./apps/worker

RUN pnpm --filter @echolore/worker build
RUN pnpm deploy --filter @echolore/worker --prod /prod/worker

FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=builder --chown=workeruser:nodejs /prod/worker ./

ENV NODE_ENV=production

USER workeruser

CMD ["node", "dist/index.js"]
