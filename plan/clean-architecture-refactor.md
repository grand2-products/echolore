# クリーンアーキテクチャ改善計画 — 残タスク

Phase 1.1 (services→DB直接アクセス除去, 19ファイル) と Phase 2.1 (policies→DB除去) は完了済み (2026-03-20)。

## 残フェーズ

### Phase 1.2: routes → repositories 直接アクセス除去 (25ファイル)

routes 内で `repositories/` を直接 import しているファイルを、service 経由に変更する。

- [ ] `routes/admin/admin-groups.ts`
- [ ] `routes/admin/admin-site-settings.ts`
- [ ] `routes/admin/admin-space-permissions.ts`
- [ ] `routes/ai-chat.ts`
- [ ] `routes/aituber.ts`
- [ ] `routes/files.ts`
- [ ] `routes/internal-room-ai.ts`
- [ ] `routes/knowledge-suggestions.ts`
- [ ] `routes/livekit.ts`
- [ ] `routes/meetings/meeting-agents.ts`
- [ ] `routes/meetings/meeting-crud.ts`
- [ ] `routes/meetings/meeting-pipeline.ts`
- [ ] `routes/meetings/meeting-recordings.ts`
- [ ] `routes/meetings/meeting-summaries.ts`
- [ ] `routes/meetings/meeting-transcripts.ts`
- [ ] `routes/metrics.ts`
- [ ] `routes/site.ts`
- [ ] `routes/users.ts`
- [ ] `routes/wiki/wiki-blocks.ts`
- [ ] `routes/wiki/wiki-files.ts`
- [ ] `routes/wiki/wiki-import.ts`
- [ ] `routes/wiki/wiki-pages.ts`
- [ ] `routes/wiki/wiki-permissions.ts`
- [ ] `routes/wiki/wiki-revisions.ts`
- [ ] `routes/wiki/wiki-trash.ts`

**受け入れ基準:**
- [ ] routes 内で `repositories/` を import していない
- [ ] 全テストがパス

### Phase 2.2: AI 依存の抽象化

サービスが AI/LLM モジュールと疎結合になるよう、`EmbeddingProvider` 等のインターフェースを導入。

対象:
- [ ] `services/wiki/wiki-service.ts` (embeddings)
- [ ] `services/ai-chat/ai-chat-ai-service.ts`
- [ ] `services/aituber/*.ts`

**受け入れ基準:**
- [ ] サービスが ai/ モジュールと疎結合
- [ ] テストでモック注入可能

### Phase 3 (将来): ドメイン層の導入

現在の規模では services/policies で十分。Phase 1.2 + 2.2 完了後に必要性を再評価。

## 進捗

| フェーズ | ステータス |
|---------|-----------|
| 1.1 services→DB除去 | ✅ 完了 |
| 1.2 routes→repositories除去 | ⬜ 未着手 (25ファイル) |
| 2.1 policies→DB除去 | ✅ 完了 |
| 2.2 AI抽象化 | ⬜ 未着手 |
