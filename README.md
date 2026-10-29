<div align="center">

# EchoLore

**AI-powered knowledge & meeting platform. Self-hostable with a single command.**

[![CI](https://github.com/grand2-products/echolore/actions/workflows/ci.yml/badge.svg)](https://github.com/grand2-products/echolore/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/grand2-products/echolore)](https://github.com/grand2-products/echolore/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-manual-8b5cf6)](https://grand2-products.github.io/echolore/)

[Manual (EN)](https://grand2-products.github.io/echolore/en/) · [マニュアル (JP)](https://grand2-products.github.io/echolore/) · [日本語 README](README.ja.md)

</div>

## Features

- 📝 **Notion-style Wiki** — block editor, real-time collaboration, page permissions
- 🔍 **AI Chat (RAG)** — answers grounded in your wiki, with citations
- 🎥 **Meetings** — LiveKit video/audio/screen sharing with AI meeting summaries
- 🤖 **External AI agents (MCP)** — connect ChatGPT, Claude, and other agents to your knowledge base
- 🔐 **Auth** — Google SSO and email/password
- 🗄️ **Pluggable storage** — Local / S3-compatible / GCS
- 🌐 **Multi-language UI** — EN, JA, KO, ZH

## Quick Start

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | sudo bash
```

You'll be prompted for a domain name and an email. Everything else — TLS, database migrations, service startup — is auto-configured.

→ Full guide: [Installation](https://grand2-products.github.io/echolore/en/getting-started/install/)

## Documentation

**The complete manual lives at https://grand2-products.github.io/echolore/**

| Section | Contents |
|---------|----------|
| [Getting Started](https://grand2-products.github.io/echolore/en/getting-started/requirements/) | Requirements, installation, first-time setup, deployment environments (on-prem / VPS / cloud) |
| [Feature Guides](https://grand2-products.github.io/echolore/en/features/wiki/) | Wiki, Meetings, AI Chat, MCP agents |
| [Administration](https://grand2-products.github.io/echolore/en/admin/console/) | Admin console, agent tokens |
| [Operations](https://grand2-products.github.io/echolore/en/operations/update/) | Updates, backup & restore, troubleshooting, Cloudflare hardening |
| [Contributing](https://grand2-products.github.io/echolore/en/development/dev-setup/) | Dev setup, branch policy, release flow |

Additional internals (Japanese): [DEPLOYMENT.md](DEPLOYMENT.md) · [docs/](docs/) · [AGENTS.md](AGENTS.md)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js |
| API | Hono + Kysely |
| Database | PostgreSQL (pgvector) |
| Realtime | LiveKit / Yjs |
| Cache | Valkey |
| Auth | Auth.js (JWT) |
| AI | LangChain + Gemini / Vertex AI / Z.ai |
| Infra | Docker Compose + Traefik (auto TLS) |

## Monorepo Structure

- `apps/web` — Next.js frontend
- `apps/api` — Hono API backend
- `apps/worker` — AI agent worker
- `apps/docs` — documentation site (Starlight, GitHub Pages)
- `packages/shared` — shared contracts and types
- `packages/ui` — shared UI components
- `skills/` — Agent Skills for external AI agents (MCP)

## Contributing

Contributions are welcome! See the [contribution guide](https://grand2-products.github.io/echolore/en/development/contributing/) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

- 🐛 [Report a bug](https://github.com/grand2-products/echolore/issues/new?template=bug_report.md) / 💡 [Request a feature](https://github.com/grand2-products/echolore/issues/new?template=feature_request.md)
- 🔒 Security issues: see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE) © Grand2
