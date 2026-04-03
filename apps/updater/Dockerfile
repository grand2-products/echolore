FROM denoland/deno:alpine-2.2.3

# Install Docker CLI and Compose plugin
RUN apk add --no-cache docker-cli docker-cli-compose bash curl

WORKDIR /app

# Copy source (context is repo root)
COPY apps/updater/deno.json .
COPY apps/updater/src/ src/

# Cache dependencies (Deno will resolve imports on first run)
RUN deno cache src/main.ts

RUN chown -R deno:deno /app

ENV PORT=8787
EXPOSE 8787

# Run as the built-in non-root deno user (uid 1000)
USER deno

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/health || exit 1

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "src/main.ts"]
