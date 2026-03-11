# Ops Runbook

Last updated: 2026-03-11

## Scope
- API health: `http://localhost:3001/health`
- Web container health: `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
- OAuth2 Proxy: `http://localhost:4180`
- LiveKit: `http://localhost:7880`

## Release Rule
- Standard release path is GitHub Actions only.
- Primary workflows:
  - `Terraform`
  - `App Release`
- SSH is break-glass only.
- Host-side workflow behavior is defined in `scripts/release/remote-runtime-apply.sh` and `scripts/release/remote-bootstrap-validate.sh`.

## Normal Release Procedure
1. Merge to `develop` or `main`, or run workflow dispatch.
2. Confirm `CI` succeeded.
3. Confirm `Terraform` succeeded.
4. Confirm `App Release` succeeded.
5. Validate:
   - `curl http://localhost:3001/health`
   - `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
   - `docker compose ps`
   - `curl http://localhost:4180/oauth2/auth` from inside the host if auth validation is needed

## Initial Triage
1. `docker compose ps`
2. `curl http://localhost:3001/health`
3. `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
4. `docker compose logs --tail=200 api`
5. `docker compose logs --tail=200 web`
6. `docker compose logs --tail=200 oauth2-proxy`
7. `docker compose logs --tail=200 livekit`
8. `docker compose logs --tail=200 db`

## Incident Patterns

### API health fails
- Check DB readiness and `DATABASE_URL`
- Check mounted credentials path
- Restart only API first: `docker compose restart api`

### Login/auth rejected (401)
- Verify forwarded headers from oauth2-proxy:
  - `x-auth-request-email`
  - `x-auth-request-user`
- Verify `AUTH_ALLOWED_DOMAIN`
- Verify `/api/auth/me`

### Admin API forbidden (403)
- Confirm session user role is `admin`
- Validate `/api/auth/me`

### Security KPI watch
- Check `/api/admin/metrics/overview`
- Treat `auth.rejected >= 5` in the selected window as warning
- Treat `auth.rejected >= 20` in the selected window as critical
- Treat `authz.denied >= 10` in the selected window as warning
- Treat `authz.denied >= 50` in the selected window as critical
- Investigate spikes together with audit log samples and recent auth/release changes

### Workflow release failed
- Check image tags written to `/opt/wiki/.env`
- Check `API_IMAGE` and `WEB_IMAGE`
- Check `/opt/wiki/.env.previous` for the last deployed runtime values
- Check that the host executed the current `scripts/release/*` logic from the workflow run, not stale inline SSH commands
- Re-run `App Release` before manual host changes

### Clean-host bootstrap validation
1. Run `Bootstrap Validate`
2. Select `dev` or `prod`
3. Confirm the workflow runs `scripts/release/remote-bootstrap-validate.sh`
4. Confirm the workflow creates and destroys an isolated validation stack successfully
5. Review the `docker compose ps` output from that isolated stack
6. Treat failure as a release-path issue, not only an instance drift issue

### Local bootstrap preflight
1. Run `pnpm bootstrap:local`
2. Confirm local API and web images build successfully
3. Confirm the script stages only `docker-compose.bootstrap-check.yml`, `livekit.yaml`, and `.env` into a temp directory
4. Confirm `docker compose config`, `pull`, `up -d --wait`, and in-container health checks all succeed
5. Use this as a repo-level regression check before running `Bootstrap Validate` against `dev` or `prod`

## Break-Glass Recovery
1. SSH to instance
2. `cd /opt/wiki`
3. `cp .env.previous .env` if rollback is required and `.env.previous` exists
4. `docker compose pull`
5. `docker compose up -d --remove-orphans`
6. `curl http://localhost:3001/health`
7. `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
8. If still failing, collect logs and workflow run URLs

## Workflow Rollback
1. Run `App Rollback`
2. Supply:
   - environment
   - previous `API_IMAGE`
   - previous `WEB_IMAGE`
   - rollback `RELEASE_SHA`
3. Confirm:
   - `curl http://localhost:3001/health`
   - `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
   - `docker compose ps`

## Escalation Packet
- UTC timestamp of first error
- Workflow run URL
- Failing endpoint and status code
- Relevant `docker compose logs` excerpt
- Last successful release SHA

## Post-Incident Checklist
- Add regression test if applicable
- Add alert rule if blind spot found
- Update this runbook
