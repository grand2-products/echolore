# Wiki Implementation

Last updated: 2026-03-26

This document describes the currently implemented Wiki behavior.

## Current Scope
- Block-based Wiki exists in the web app
- Page tree exists with parent/child reparenting
- Wiki read/write/delete APIs are connected
- Search exists with lexical search and optional semantic rerank
- Page permissions are enforced in API read/write/search paths

## Implemented Areas

### Frontend
- Wiki list: `apps/web/app/(main)/wiki/page.tsx`
- Wiki detail: `apps/web/app/(main)/wiki/[id]/page.tsx`
- Wiki create: `apps/web/app/(main)/wiki/new/page.tsx`
- Editor: `apps/web/components/wiki/NotionEditor.tsx` (Notion-style BlockNote editor, dynamically imported)
- Editor inner: `apps/web/components/wiki/NotionEditorInner.tsx`
- Serializer: `apps/web/lib/wiki-serializer.ts` (BlockNote ↔ BlockDto conversion)
- API client: `apps/web/lib/api.ts`

### Backend
- Wiki routes: `apps/api/src/routes/wiki.ts`
- Authorization: `apps/api/src/lib/authorization.ts`
- Auth/session: `apps/api/src/lib/auth.ts`
- Schema: `apps/api/src/db/schema.ts`

## Implemented Behaviors

### Pages
- list pages
- get page detail with blocks
- create page
- update page title
- update page parent
- delete page

### Blocks
- create block
- update block
- delete block
- reorder blocks
- attach files to a page
- resolve attached files through a page-authorized download route
- drag and drop or paste an image into the editor for inline insertion
- save edited page HTML back into block records on create and update
- surface inline asset upload and save-state errors in the editor flow

### Tree and Hierarchy
- tree rendering in sidebar
- drag and drop reparenting
- cycle detection on parent updates

### Search
- full-text search on page title and block content
- `ILIKE` fallback
- optional semantic rerank using embeddings when enabled

### Security and Permissions
- page read permission enforced in list/search/detail
- page write/delete permission enforced in mutations
- wiki attachment download is authorized through page read permission and only for files referenced by that page's blocks
- newly created root pages map the creator's current groups into initial page permissions
- newly created child pages get explicit parent inheritance defaults
- Room AI generated wiki pages use the same page access-default mapping path
- authorization decisions logged to audit log
- page HTML rendering applies escaping in detail view

### Personal Space
- each user has one personal space (type=`personal`, `ownerUserId` set)
- personal space pages are always public — all authenticated users can read them
- private (non-public) pages cannot be created in personal spaces
- only the space owner can create pages in their personal space
- admin can edit or delete existing pages in any personal space (moderation)
- all personal spaces are visible in the space list to every user

## Related Files
- `../docs/release-workflows.md`
- `../docs/site-map.md`
