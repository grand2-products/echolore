# クリーンアーキテクチャ改善計画 — 残タスク

Phase 1.1, 1.2, 2.1 は完了済み (2026-03-20)。

## 進捗

| フェーズ | ステータス |
|---------|-----------|
| 1.1 services→DB除去 (19ファイル) | ✅ 完了 |
| 1.2 routes→repositories除去 (28ファイル) | ✅ 完了 |
| 2.1 policies→DB除去 | ✅ 完了 |
| 2.2 AI抽象化 | ✅ 完了 |

## 残フェーズ

### Phase 2.2: AI 依存の抽象化 ✅

`EmbeddingProvider`, `LlmProvider`, `TextToSpeechGateway` インターフェースを導入。
サービスはモジュールレベルのデフォルトプロバイダーを使用し、`_set*Provider()` でテスト時に差し替え可能。

- [x] `services/wiki/wiki-service.ts` → `EmbeddingProvider`
- [x] `services/ai-chat/ai-chat-ai-service.ts` → `LlmProvider`
- [x] `services/aituber/aituber-ai-service.ts` → `LlmProvider`
- [x] `services/aituber/aituber-tts-service.ts` → `TextToSpeechGateway`

### Phase 3 (将来): ドメイン層の導入

現在の規模では services/policies で十分。Phase 2.2 完了後に必要性を再評価。
