FROM denoland/deno:alpine-2.9.8

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

# Runs as root on purpose: self-update needs full control of the docker socket
# (create/remove/rename containers plus the compose lifecycle). See the
# updater notes in docs/ops-runbook.md before changing this.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8787/health || exit 1

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "src/main.ts"]
