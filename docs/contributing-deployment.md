# Contributing: Deployment & Custom Builds

This guide is for developers and contributors who want to build custom images or work on the deployment pipeline.

## Building Custom Images

Each app has its own Dockerfile in `apps/<app>/Dockerfile`.

```bash
# Build all images locally
docker build -t echolore/api:local -f apps/api/Dockerfile .
docker build -t echolore/web:local -f apps/web/Dockerfile .
docker build -t echolore/worker:local -f apps/worker/Dockerfile .
```

To use local images with the production compose file:

```bash
ECHOLORE_VERSION=local docker compose -f docker-compose.production.yml up -d
```

## CI/CD Pipeline

### CI (`ci.yml`)

Runs on push/PR to `main` and `develop`:
- Security audit
- Biome lint
- TypeScript typecheck
- Build
- Test

### Publish Release (`publish-release.yml`)

Triggered by pushing a semver tag (`v*.*.*`):

1. Builds `api`, `web`, `worker` images in parallel
2. Pushes to GHCR with tags: `v0.1.0`, `0.1`, `latest`
3. Creates a GitHub Release with auto-generated changelog
4. Attaches `docker-compose.production.yml`, `install.sh`, and `update.sh` as release assets

### Creating a Release

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Docker Compose Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Development base (includes debug ports, bind mounts) |
| `docker-compose.dev.yml` | Development overrides (hot-reload, dev credentials) |
| `docker-compose.production.yml` | End-user production deployment |
| `docker-compose.bootstrap-check.yml` | Isolated validation testing |

## Image Registry

Images are published to GHCR:
- `ghcr.io/grand2-products/echolore/api`
- `ghcr.io/grand2-products/echolore/web`
- `ghcr.io/grand2-products/echolore/worker`

The repository must have **Actions > General > Workflow permissions** set to **Read and write permissions** for GHCR push to work.
