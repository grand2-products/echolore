# Next Tasks

Last updated: 2026-03-11

This document summarizes the current follow-up areas after the `plan/` cleanup.

## Current Priorities
- release rollout hardening
- Wiki attachment flow completion
- admin management frontend completion
- realtime meeting AI completion

## Primary Tracking Files
- remaining status gates: `../plan/implementation-status-master.md`
- execution backlog: `../plan/todo-master.md`
- deployment-specific backlog: `../plan/deployment.md`
- detailed Room AI plan: `../plan/ai-employee-realtime-plan.md`

## Current Follow-up Themes

### Release Hardening
- run clean-host bootstrap validation successfully in both environments
- finalize runtime image registry strategy
- keep rollout and rollback behavior aligned with workflow-only deployment

### Wiki Attachments
- preserve original uploaded filenames
- use browser-downloadable attachment links instead of storage URLs
- authorize attachment access through Wiki page permissions
- add regression coverage for attachment access and download behavior

### Admin Frontend
- build group and membership management screens
- build page permission management screens
- clarify the minimum operator workflow for admin management

### Realtime Meeting AI
- add bot participant join flow
- stabilize the voice response path
- keep remaining agent/runtime work aligned with `plan/ai-employee-realtime-plan.md`

### Durable Documentation
- document observability architecture after the monitoring shape stabilizes
- document rollback and failure-mode architecture after release hardening completes

## Notes
- implemented behavior should stay documented in `docs/`
- active execution state and incomplete work should stay in `plan/`
