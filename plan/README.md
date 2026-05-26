# Plan

Temporary planning artifacts. Implemented behavior belongs in `docs/`.

## Release Gates

- [ ] Clean-host bootstrap validation (`docker compose pull && up -d`) in both `dev` and `prod`
- [ ] Let's Encrypt certificate provisioning E2E verification

## Open Decisions

- clean-host validation procedure
- migration rollback strategy for destructive schema changes (column drops)

## Retained Files

- `ai-meeting-intervention.md` — AI Meeting Intervention の残件 G3 のみ (リアルタイム音声取込 #47); G1/G2/G4/G5 は実装済み
- `aituber-motion-sota.md` — VRMA モーションクリップ生成 (Batch 4-B/4-C)
- `backup-strategy.md` — バックアップ失敗通知 (残タスクのみ)
- `google-drive-integration.md` — Google Drive 連携 Phase 2-3

## Docs Reference

- [Product Overview](../docs/product-overview.md)
- [System Architecture](../docs/system-architecture.md)
- [Technical Baseline](../docs/technical-baseline.md)
- [Release Workflows](../docs/release-workflows.md)
- [Ops Runbook](../docs/ops-runbook.md)
- [Architecture Review 2026-03-11](../docs/architecture-review-2026-03-11.md)
