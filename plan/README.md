# Plan

Temporary planning artifacts. Implemented behavior belongs in `docs/`.

## Release Gates

- [ ] Clean-host bootstrap validation (`docker compose pull && up -d`) in both `dev` and `prod`
- [ ] Let's Encrypt certificate provisioning E2E verification

## Open Decisions

- clean-host validation procedure
- migration rollback strategy for destructive schema changes (column drops)

## Retained Files

- `aituber-motion-sota.md` — VRMA モーションクリップ生成 (Batch 4-B/4-C)
- `backup-strategy.md` — バックアップ失敗通知のみ残

## Recently Completed (deleted from plan/, documented in docs/)

- 会議ゲストアクセス — 全ステップ実装済み
- パブリック配布 — 全フェーズ実装済み (install.sh, publish-release.yml, DEPLOYMENT.md)
- AITuber Motion Batch 1-3 — compositor, layers, LookAt, VrmAnimationController

## Docs Reference

- [Product Overview](../docs/product-overview.md)
- [System Architecture](../docs/system-architecture.md)
- [Technical Baseline](../docs/technical-baseline.md)
- [Release Workflows](../docs/release-workflows.md)
- [Ops Runbook](../docs/ops-runbook.md)
- [Architecture Review 2026-03-11](../docs/architecture-review-2026-03-11.md)
