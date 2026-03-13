# Frontend App Implementation

Last updated: 2026-03-13

This document describes the currently implemented frontend app structure in `apps/web`.

## Current Scope
- App Router based Next.js frontend
- Main screens for Wiki, Meetings, Search, and Admin operations
- Shared API client in `apps/web/lib/api.ts`
- Shared layout components in `apps/web/components/layout`

## Implemented Route Groups

### Main App
- `/`: top page
- `/(main)`: authenticated shell
- `/wiki`: wiki list
- `/wiki/[id]`: wiki detail
- `/wiki/new`: wiki creation
- `/search`: wiki search
- `/meetings`: meetings list
- `/meetings/[id]`: meeting room
- `/meetings/coworking`: shared coworking room
- `/admin`: admin index (redirects to `/admin/users`)
- `/admin/users`: admin user management
- `/admin/access`: admin access management
- `/admin/kpi`: admin KPI screen
- `/admin/agents`: admin AI agent management
- `/admin/settings`: admin site settings (providers, video quality)
- `/settings`: account summary and active session management

## Current Frontend Structure
- `apps/web/app`: App Router screens
- `apps/web/components/wiki`: wiki UI (Notion-style BlockNote editor)
- `apps/web/components/livekit`: LiveKit UI components (background effects, media toggle)
- `apps/web/components/layout`: shared shell (sidebar, header, navigation)
- `apps/web/components/DynamicFavicon.tsx`: dynamic favicon from site settings
- `apps/web/lib/api.ts`: centralized API client
- `apps/web/lib/site-settings-context.tsx`: global site settings context (title, tagline, LiveKit quality)
- `apps/web/lib/wiki-serializer.ts`: BlockNote ↔ BlockDto conversion
- `apps/web/lib/return-to.ts`: post-auth redirect URL management with security guards
- `apps/web/lib/background-processor.ts`: virtual background effect management for LiveKit

## Implemented Shell Behavior
- desktop primary navigation is sidebar-led
- the header is reserved for search, locale switching, and session actions
- mobile navigation is exposed from the header menu and reuses the same navigation definitions as the desktop sidebar

## Implemented Integration Pattern
- frontend calls backend APIs through `fetchApi`
- cookie-based session transport is enabled with `credentials: "include"`
- wiki, meetings, search, and settings screens use the shared API client

## Implemented I18N Behavior
- supported locales are `ja`, `en`, `zh-CN`, and `ko`
- route structure stays unchanged; locale is managed client-side
- first load hydrates locale from persisted preference or browser language
- the active locale is reflected to `document.documentElement.lang` and a `locale` cookie

## Known Gaps
- frontend main layout session state is derived from `/api/auth/me`; deeper screen-level user hydration is still partial
- dedicated sitemap and screen inventory should be kept in `docs/site-map.md`

## Related Files
- `../docs/site-map.md`
- `../docs/wiki-implementation.md`
- `../docs/meeting-tool-implementation.md`
- `../docs/admin-user-management-implementation.md`
