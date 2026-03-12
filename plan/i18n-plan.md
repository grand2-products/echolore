# I18N Plan

Last updated: 2026-03-12

## Scope
- Add web i18n support for:
  - `ja`
  - `en`
  - `zh-CN`
  - `ko`
- Cover all user-facing routes in `apps/web`
- Cover shared layout, navigation, empty states, validation copy, notices, and status labels

## Non-Goals
- Full API-side localized error generation in the first pass
- Locale-specific content authoring for Wiki documents
- Region-specific formatting beyond the four supported locales

## Open Decisions
- i18n library choice:
  - preferred: `next-intl`
  - fallback: custom message loader only if `next-intl` proves incompatible with current App Router usage
- Locale URL policy:
  - preferred: locale-prefixed routes such as `/ja/wiki`, `/en/wiki`
  - default locale redirect behavior still needs to be finalized
- Chinese variant policy:
  - start with `zh-CN`
  - decide later whether `zh-TW` is needed

## Implementation Plan
### Phase 1: Foundation
- [x] Add i18n runtime to `apps/web`
- [x] Keep URL structure unchanged and use client-side locale state
- [x] Add message catalogs for `ja`, `en`, `zh-CN`, and `ko`
- [x] Add locale-aware app shell and provider wiring
- [x] Add a language switcher in the shared layout/header

### Phase 2: UI String Migration
- Move hard-coded UI strings out of:
  - shared layout and navigation
  - home
  - wiki
  - meetings
  - search
  - settings
  - admin
- Localize:
  - button labels
  - headings
  - helper text
  - empty states
  - confirmation copy
  - user-facing notices
  - meeting/wiki/admin status labels

### Phase 3: Formatting and Error Handling
- Replace fixed `ja-JP` date/time formatting with locale-aware formatting
- Normalize count/date formatting through shared helpers
- Introduce UI-side mapping for stable API error codes where practical
- Keep raw API fallback messages only as a temporary compatibility path

### Phase 4: Hardening
- Add regression tests for:
  - locale routing
  - default locale redirect
  - language switch persistence
  - key pages rendering in each supported locale
- Add review rule to avoid introducing new hard-coded user-facing strings in `apps/web`

## Acceptance Criteria
- All major `apps/web` routes render in `ja`, `en`, `zh-CN`, and `ko`
- Locale is preserved in navigation and deep links
- Shared header/sidebar/settings flows respect the active locale
- Dates, times, and count-oriented labels are locale-aware
- Search, meeting, wiki, and admin screens do not rely on hard-coded Japanese/English UI copy
- `pnpm typecheck` passes after the migration

## Risks
- App Router restructuring to locale-prefixed routes may be invasive
- Existing links and direct route assumptions may need to be updated together
- Dynamic notices and API-derived messages may drift unless error-code mapping is standardized

## Exit Rule
- When the i18n foundation is implemented and stable, move the durable implementation description to `docs/`
- Keep this file limited to remaining migration work, open decisions, and acceptance checks only
