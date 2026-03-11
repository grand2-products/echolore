# TODO Master

Last updated: 2026-03-11
Source: architecture review remediation (2026-03-11)

## P0 (Release/Security Gate)
- [x] SEC-01: Make API identity server-authoritative (no client-supplied actor IDs)
- [x] SEC-02: Enforce authorization for Wiki/File/Meeting resources
- [x] SEC-03: Lock down user-management endpoints to admin or self-only
- [ ] REL-01: Fix deploy path mismatch (compose build vs runtime artifact availability)
- [ ] REL-02: Define production image strategy (registry tags + immutable rollout)

## P1 (High Priority)
- [x] INF-01: Apply least-privilege IAM and scope design for GCE/API/GCS
- [x] INF-02: Replace default VPC/default network assumptions with explicit network module
- [x] APP-01: Connect page/group permissions model to actual data access paths
- [x] APP-02: Normalize authentication flow in web app (remove mock user path)
- [x] APP-03: Add transaction boundaries for multi-step write operations (pipeline/create flows)
- [x] ROOM-01: Add realtime transcript and explicit-invocation AI employee foundation
- [ ] WIKI-ATTACH-01: Finish Wiki attachment filename, download URL, and page-aware authorization flow
- [ ] ADMIN-UI-01: Build frontend admin UI for groups, memberships, and page permissions

## P2 (Quality/Operational Hardening)
- [x] CFG-01: Remove duplicated/broken config definitions (Drizzle config, Dockerfiles, workspace entries)
- [x] QA-01: Add regression tests for authn/authz and privilege escalation cases
- [x] QA-02: Add API contract tests for protected endpoints
- [x] OBS-01: Add security/authorization KPI metrics and alerts
- [x] DOC-01: Align architecture docs with actual implementation and CI/CD behavior
- [ ] QA-03: Add regression coverage for Wiki file attachment access and download behavior
- [ ] DOC-02: Add durable observability and rollback architecture docs after release flow stabilizes

## Detailed Task Breakdown (Execution List)
### SEC-01: Server-authoritative identity
- [x] Remove `authorId` from Wiki create request contract and API payload parsing
- [x] Remove `creatorId` from Meeting create request contract and API payload parsing
- [x] Remove `uploaderId` from File upload request contract and API payload parsing
- [x] Use authenticated session user (`c.get("user")`) as write actor in all create/update routes
- [x] Reject requests when session user is missing or invalid before any data write
- [x] Update frontend API client and UI forms to stop sending actor IDs

### SEC-02: Authorization enforcement
- [x] Add reusable authorization service/middleware for page and meeting access checks
- [x] Enforce read/write/delete checks in `/api/wiki/*`
- [x] Enforce read/write/delete checks in `/api/meetings/*`
- [x] Enforce read/write/delete checks in `/api/files/*`
- [x] Log allow/deny decisions to audit log with reason codes

### SEC-03: User endpoint hardening
- [x] Restrict `/api/users` list/create/delete to admin only
- [x] Implement `/api/users/me` endpoint for self profile read/update
- [x] Prevent non-admin profile edits on other users
- [x] Add negative tests for unauthorized user mutation

### REL-01/REL-02: Deployment reliability
- [x] Decide one runtime path: `prebuilt image deploy` or `source build on host`
- [x] If `prebuilt image deploy`: replace compose `build:` with pinned image tags
- [x] Add image build/push job in CI and inject tag into deploy step
- [x] Add health-checked rollout step and rollback command
- [x] Add workflow-based clean-host bootstrap validation path
- [ ] Run `docker compose pull && up -d` validation successfully on a clean host without source tree

### INF-01/INF-02: Infrastructure hardening
- [x] Replace broad `cloud-platform` scope with minimal required scopes/permissions
- [x] Define dedicated service accounts per runtime role
- [x] Restrict Storage IAM role from broad object admin if not required
- [x] Move instance from default network to explicit VPC/subnet resources
- [x] Review firewall rules for least exposure (admin access allowlist, explicit ingress policy)

### APP-01 to APP-03: Application consistency
- [x] Apply `page_permissions` + inheritance checks to Wiki read/write/search paths
- [x] Add author/owner/group mapping strategy for newly created resources
- [x] Remove mock user from main web layout and hydrate user from `/api/auth/me`
- [x] Hide admin-only navigation for non-admin session users
- [x] Wrap Room AI pipeline DB writes in a transaction
- [x] Wrap admin permission/group mutation writes in DB transactions
- [x] Add idempotency guard for pipeline execution endpoint

### ROOM-01: Realtime transcript and AI employee foundation
- [x] Add transcript segment schema for partial/final realtime transcript
- [x] Add STT/TTS gateway abstraction with initial Google-backed adapters
- [x] Add explicit AI invocation flow in meeting room UI
- [ ] Add bot participant join flow and voice response path
- [x] Add admin CRUD for agent definitions
- [x] Persist meeting agent events and session state
- [x] Add live transcript panel to meeting room UI
- [x] Define invocation authorization and operator controls

### CFG-01 and QA/OBS/DOC
- [x] Remove duplicate `export default` in Drizzle config
- [x] Deduplicate Dockerfile content in API/Web Dockerfiles
- [x] Deduplicate `pnpm-workspace.yaml` package entries
- [x] Add unit/integration tests for identity spoofing attempts
- [x] Add baseline unit tests for authorization policy decisions and Room AI transaction flow
- [x] Add protected-route API tests for users, meetings, and wiki response/forbidden paths
- [x] Add admin-only route denial coverage at API route level
- [x] Add end-to-end tests for admin-only routes
- [x] Add alert threshold for `authz.denied`, `auth.rejected`, and anomaly spikes
- [x] Update deployment tracking and runbook to match implemented flow

### WIKI-ATTACH-01: Wiki attachment flow
- [ ] Preserve original uploaded filename in file metadata
- [ ] Store a stable `fileId` reference in Wiki blocks instead of browser-unusable storage URLs
- [ ] Serve browser-downloadable attachment links through an authorized API path
- [ ] Connect attachment download authorization to owning page permissions instead of uploader-only ownership

### ADMIN-UI-01: Admin management frontend
- [ ] Build frontend admin UI for groups and memberships
- [ ] Build frontend admin UI for page permission management
- [ ] Clarify minimum operator workflow for admin management

### QA-03: Wiki attachment regression coverage
- [ ] Add route-level coverage for authorized attachment download behavior
- [ ] Add route-level coverage for denied attachment access across page permission boundaries

### DOC-02: Remaining durable architecture docs
- [ ] Document observability architecture once monitoring shape stabilizes
- [ ] Document rollback and failure-mode architecture once release hardening is complete

## Canonical Detailed Plan
- [Architecture Review Snapshot 2026-03-11](../docs/architecture-review-2026-03-11.md)
- [Realtime AI Employee Plan](./ai-employee-realtime-plan.md)
