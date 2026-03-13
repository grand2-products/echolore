FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN pnpm --filter @corp-internal/shared build
RUN pnpm --filter @corp-internal/api build
RUN pnpm deploy --filter @corp-internal/api --prod /prod/api

FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

COPY --from=builder --chown=apiuser:nodejs /prod/api ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

USER apiuser

CMD ["node", "dist/apps/api/src/index.js"]
