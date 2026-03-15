# Product Overview

Last updated: 2026-03-13

This document describes the currently implemented product shape of `echolore`.

## Current Product Areas
- Google SSO and email/password access with email-based account reconciliation
- mobile Google token exchange and self-service app session revocation
- block-based Wiki
- meetings with LiveKit
- Room AI flow from summary generation to Wiki save
- admin-only KPI and permission-management backend

## Current Users
- internal users of grand2 Products
- admins who manage access and operational settings through protected backend paths

## Current Implemented Capabilities

### Wiki
- page list and detail
- page creation, update, and deletion
- block-based editing
- search across permitted content
- page-level authorization enforcement

### Meetings
- meeting list and detail
- room-oriented meeting workflow
- summary generation path tied to meeting records
- wiki save flow for generated output
- stamps/reactions: emoji reactions broadcast to all participants via WebRTC data channel
- screen share annotations: real-time annotation overlay with markers drawn on shared screens
- recording: LiveKit Egress captures room to MP4, Gemini multimodal STT produces transcription, AI summary pipeline consumes the result

### Files
- file upload metadata and protected access paths
- server-side uploader attribution
- pluggable storage backend: local filesystem (default), S3-compatible, or Google Cloud Storage — switchable from admin settings

### AI Agent
- tool-calling agent powered by LangChain.js
- available tools: wiki search, meeting transcript retrieval, user lookup
- LLM provider is configurable (Google Gemini, Z.ai GLM-5)

### Administration
- admin-protected backend routes
- group, membership, and page permission APIs
- access-management, KPI, and AI agent screens on the frontend
- site settings management: site title/tagline, site icon, email provider, LLM provider, storage provider (Local/S3/GCS), and video quality configuration

### Account
- zero-user bootstrap: registration is open only when no users exist; the first user is auto-promoted to admin
- email verification for password registration
- active app session visibility and revocation from settings

## Current Operational Shape
- web frontend in `apps/web`
- API backend in `apps/api`
- runtime deployment on any Linux VPS with Docker Compose
- release path through GitHub Actions workflows

## Known Gaps
- frontend session and role-aware UX are not yet complete
- regression test coverage still needs to reach release-grade expectations

## Related Files
- `../docs/frontend-app-implementation.md`
- `../docs/wiki-implementation.md`
- `../docs/meeting-tool-implementation.md`
- `../docs/admin-user-management-implementation.md`
