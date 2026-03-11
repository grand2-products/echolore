# Wiki Plan

Last updated: 2026-03-12

`plan/wiki.md` tracks remaining Wiki work.
For the currently implemented Wiki behavior, see `docs/wiki-implementation.md`.

## Current State Summary
- Wiki CRUD is implemented
- Block editor exists
- Tree hierarchy exists
- Search is implemented
- Wiki permission enforcement is implemented in current API paths
- Wiki file attachments preserve the uploaded filename and resolve through a page-authorized download route

## Remaining Gaps
- [ ] Frontend session user should come from real session state consistently
- [ ] Review remaining UX polish and error states
- [ ] Decide whether additional Wiki operational docs belong in `docs/`
- [ ] Add richer editor polish beyond current image drag-and-drop / paste insert flow

## Active Work: Wiki File Attachments
### Current implementation gaps
- File upload previously sent a fixed multipart filename from the web client, so stored filenames degraded to `upload.bin`
- Wiki editor previously inserted `gs://...` links, which were not browser-downloadable
- File authorization was uploader/admin only and was not connected to Wiki page permissions
- Wiki blocks store file references in `properties`, so attachment resolution must validate page linkage explicitly

### Target behavior
- The original uploaded filename is preserved in file metadata
- Wiki blocks store a stable file reference (`fileId`) and render a browser-usable link
- File download for Wiki attachments is authorized through the owning page's Wiki permissions
- Attachment flows have route-level regression tests

### Status
- Implemented on 2026-03-12 in API route tests, web upload handling, and Wiki attachment download routing
- Editor also supports dragging or pasting an image into the article for immediate inline display

## Next Decisions
- session-aware UI model
- minimum regression suite for Wiki security and editing
- whether to expand docs for editor behavior and permissions

## References
- Implemented Wiki behavior: `../docs/wiki-implementation.md`
- Status tracking: `./implementation-status-master.md`
- Backlog: `./todo-master.md`
