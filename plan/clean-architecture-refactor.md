# クリーンアーキテクチャ改善計画 — 残タスク

Phase 1.1, 1.2, 2.1 は完了済み (2026-03-20)。

## 進捗

| フェーズ | ステータス |
|---------|-----------|
| 1.1 services→DB除去 (19ファイル) | ✅ 完了 |
| 1.2 routes→repositories除去 (28ファイル) | ✅ 完了 |
| 2.1 policies→DB除去 | ✅ 完了 |
| 2.2 AI抽象化 | ⬜ 未着手 |

## 残フェーズ

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

現在の規模では services/policies で十分。Phase 2.2 完了後に必要性を再評価。
