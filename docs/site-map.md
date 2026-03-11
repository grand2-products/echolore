# Site Map

Last updated: 2026-03-12

This document maps the currently implemented frontend routes in `apps/web`.

## Route Tree
- `/`
  - landing page
  - primary entry links to `/wiki` and `/meetings`
- `/(main)`
  - shared authenticated shell with sidebar navigation
- `/wiki`
  - wiki index
  - page tree sidebar
  - entry points to `/wiki/new` and `/search`
- `/wiki/new`
  - new wiki page creation
  - returns to `/wiki`
- `/wiki/[id]`
  - wiki detail and edit screen
  - page tree sidebar for lateral navigation
- `/search`
  - wiki search
  - result links to `/wiki/[id]`
- `/meetings`
  - meeting list
  - entry points to `/meetings/[id]` and `/meetings/coworking`
- `/meetings/[id]`
  - LiveKit-based meeting room
  - realtime transcript
  - AI employee invocation and active-session controls
- `/meetings/coworking`
  - shared coworking room
- `/admin/kpi`
  - admin KPI dashboard
  - security metrics included
- `/admin/access`
  - admin group management
  - admin membership management
  - admin wiki page permission management
- `/admin/agents`
  - admin AI agent definition management

## Navigation Model
- Global sidebar:
  - `/`
  - `/wiki`
  - `/meetings`
  - `/search`
  - `/admin/access` for admin only
  - `/admin/kpi` for admin only
  - `/admin/agents` for admin only
- Local wiki navigation:
  - page tree in `/wiki`, `/wiki/new`, `/wiki/[id]`
- Meetings navigation:
  - `/meetings` is the hub
  - room pages return to `/meetings`

## Access Model
- Main app routes are intended for authenticated users behind OAuth2 Proxy.
- Admin routes are hidden in the sidebar for non-admin users and enforced server-side by API authorization.
- Wiki and meeting detail routes are further scoped by backend resource authorization.

## Primary User Flows
- Knowledge flow:
  - `/` -> `/wiki` -> `/wiki/[id]`
  - `/wiki` -> `/wiki/new`
  - `/search` -> `/wiki/[id]`
- Meeting flow:
  - `/` -> `/meetings`
  - `/meetings` -> `/meetings/[id]`
  - `/meetings` -> `/meetings/coworking`
  - `/meetings/[id]` -> AI employee actions -> Room AI summary to Wiki
- Admin flow:
  - `/admin/access`
  - `/admin/kpi`
  - `/admin/agents`

## Source Files
- `apps/web/app/page.tsx`
- `apps/web/app/(main)/layout.tsx`
- `apps/web/app/(main)/page.tsx`
- `apps/web/app/(main)/wiki/page.tsx`
- `apps/web/app/(main)/wiki/new/page.tsx`
- `apps/web/app/(main)/wiki/[id]/page.tsx`
- `apps/web/app/(main)/search/page.tsx`
- `apps/web/app/(main)/meetings/page.tsx`
- `apps/web/app/(main)/meetings/[id]/page.tsx`
- `apps/web/app/(main)/meetings/coworking/page.tsx`
- `apps/web/app/(main)/admin/access/page.tsx`
- `apps/web/app/(main)/admin/kpi/page.tsx`
- `apps/web/app/(main)/admin/agents/page.tsx`
- `apps/web/components/layout/Sidebar.tsx`
