# Ops Runbook

Last updated: 2026-03-13

## Scope
- API health: `http://localhost:3001/health`
- Web container health: `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
- Auth: Auth.js (JWT sessions via API)
- LiveKit: `http://localhost:7880`

## Release Rule
- Standard release path is GitHub Actions only.
- Primary workflows:
  - `CI` → `App Release`
- SSH is break-glass only.
- Host-side workflow behavior is defined in `scripts/release/remote-runtime-apply.sh` and `scripts/release/remote-bootstrap-validate.sh`.

## Initial Bootstrap (Zero-User Setup)
- When the `users` table is empty, the system is in bootstrap mode.
- Registration (both password and Google SSO) is open only while zero users exist.
- The first user to complete registration is automatically promoted to `admin`.
- Once the first user exists, self-registration is permanently closed.
- Subsequent users must be added by an admin through the admin management API.
- The registration gate status is exposed at `GET /api/auth/registration-status` (`{ "open": true | false }`).
- The login page automatically hides the registration form when the gate is closed.

## Normal Release Procedure
1. Merge to `develop` or `main`, or run workflow dispatch.
2. Confirm `CI` succeeded.
3. Confirm `App Release` succeeded (triggers from CI).
5. Validate:
   - `curl http://localhost:3001/health`
   - `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
   - `docker compose ps`
   - `curl http://localhost:3001/api/auth/session` from inside the host if auth validation is needed

## Initial Triage
1. `docker compose ps`
2. `curl http://localhost:3001/health`
3. `docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000`
4. `docker compose logs --tail=200 traefik`
5. `docker compose logs --tail=200 api`
6. `docker compose logs --tail=200 web`
7. `docker compose logs --tail=200 livekit`
8. `docker compose logs --tail=200 livekit-egress`
9. `docker compose logs --tail=200 db`

## Incident Patterns

### API health fails
- Check DB readiness and `DATABASE_URL`
- Check `FILE_STORAGE_PATH` is writable and mounted correctly
- Check Traefik routing: `docker compose logs --tail=50 traefik`
- Restart only API first: `docker compose restart api`

### File storage errors
- Check which provider is active: `GET /api/admin/storage-settings` (admin only)
- For local provider: verify `FILE_STORAGE_PATH` is writable and the Docker volume is mounted
- For S3: verify endpoint, bucket, and credentials in admin settings; run "Test Connection" from admin UI
- For GCS: verify bucket, project ID, and service account key in admin settings; run "Test Connection" from admin UI
- Storage provider is restored from `site_settings` on API startup; check API logs for `Storage provider initialized:` message

### Login/auth rejected (401)
- Verify Auth.js session: `curl http://localhost:3001/api/auth/session`
- Verify `AUTH_ALLOWED_DOMAIN` and `AUTH_SECRET` are set
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
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

### Recording / Egress fails
- Check `livekit-egress` is running: `docker compose ps livekit-egress`
- Check egress logs: `docker compose logs --tail=100 livekit-egress`
- Verify Redis connectivity: egress requires `valkey` for job coordination
- Verify `SYS_ADMIN` capability is granted (required for Chrome-based compositing)
- Check webhook delivery: `docker compose logs --tail=50 api | grep webhook`
- For GCS/S3 upload failures: verify storage credentials in admin settings
- For local storage: verify `file_storage` volume is mounted and writable

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
3. Confirm the script stages only `docker-compose.bootstrap-check.yml` and `.env` into a temp directory
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
