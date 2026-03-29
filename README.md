# EchoLore

AI-powered knowledge & meeting platform. Self-hostable with a single command.

## Features
- Block-based Wiki with AI-powered search
- Real-time meetings with LiveKit (video, audio, screen share)
- AI meeting summaries → Wiki integration
- Google SSO and email/password authentication
- Admin dashboard for team management
- Pluggable file storage (Local / S3 / GCS)
- Multi-language support (EN, JA, KO, ZH)

## Quick Start

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | bash
```

This installs EchoLore on your server. You'll be prompted for a domain name and email. Everything else is auto-configured.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions.

## Tech Stack
- **Frontend**: Next.js
- **API**: Hono + Kysely
- **Database**: PostgreSQL (pgvector)
- **Realtime**: LiveKit
- **Cache**: Valkey
- **Auth**: Auth.js (JWT sessions)
- **AI**: LangChain + Google Gemini / Vertex AI
- **Infra**: Docker Compose + Traefik (auto TLS)

## Monorepo Structure
- `apps/web` — Next.js frontend
- `apps/api` — Hono API backend
- `apps/worker` — AI agent worker
- `packages/shared` — Shared contracts and types
- `packages/ui` — Shared UI components

## Local Development

1. Install dependencies: `pnpm install`
2. Copy env files:
   - `apps/api/.env.example` → `apps/api/.env`
   - `apps/web/.env.local.example` → `apps/web/.env.local`
   - `apps/worker/.env.example` → `apps/worker/.env`
3. Start: `./dev.ps1` or `pnpm dev:daily`

## Commands
- `pnpm lint` — Biome lint
- `pnpm typecheck` — TypeScript check
- `pnpm build` — Build all packages
- `pnpm test` — Run tests
- `pnpm db:generate` — Generate migration
- `pnpm db:migrate` — Apply migrations

## Documentation
- [Deployment Guide](DEPLOYMENT.md)
- [Contributing: Deployment](docs/contributing-deployment.md)
- [System Architecture](docs/system-architecture.md)
- [Project Rules](AGENTS.md)

## License

See [LICENSE](LICENSE) for details.
