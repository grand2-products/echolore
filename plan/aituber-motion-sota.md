# AITuber アバターモーション SOTA 達成計画 — 残タスク

Batch 1-3 + Batch 4-A は実装完了 (2026-03-19)。実装詳細は `docs/implementation-notes.md` 参照。

## 残タスク: Batch 4-B/4-C — VRMA モーションクリップ生成

VrmAnimationController + manifest.json パイプラインは稼働中だが、アセットが未作成。

### 4-B: モーションクリップファイル (~40-50 クリップ)

| カテゴリ | クリップ数 | 例 |
|---------|----------|---|
| 挨拶・礼 | 5-8 | お辞儀、手振り、会釈 |
| うなずき | 5-8 | 浅い/深い/連続/首かしげ |
| 感情リアクション | 8-12 | 笑い、驚き、悲しみ、怒り |
| 考えるポーズ | 3-5 | 顎に手、腕組み |
| アイドル | 5-8 | 重心移動、伸び、見回し |
| 説明・指示 | 3-5 | 手を前に出す、指さし |

### 4-C: アイドルバリエーション (3種以上)

`manifest.json` に `category: "idle"` でエントリ追加。

### 生成パイプライン

1. **HY-Motion 1.0** (ComfyUI) でテキスト→FBX 生成
2. FBX→VRMA 変換 (`scripts/fix-vrma-axis.mjs`, `scripts/fix-vrma-hips.mjs` が既存)
3. `public/motions/` に配置、`manifest.json` を更新
4. プロンプト定義は `motions/prompts.yaml` で管理 (未作成)

ライセンス注意: HY-Motion の Tencent Hunyuan Community License は EU/UK/韓国で Territory 外。代替として Blender 手作りも可。

### アセット管理

- VRMA ファイル + `manifest.json` を `public/motions/` に配置
- 1クリップ 50-200KB、全50クリップで ~5-10MB
- VRM ロード後に manifest のみプリロード、個別クリップはオンデマンド

## SOTA との差分（本計画スコープ外）

1. 顔トラッキング: MediaPipe Face Mesh
2. ダンス/パフォーマンス: 長尺モーション
3. ニューラル Co-Speech Gesture: LLM Gesticulator (arXiv:2410.10851)
4. ニューラル LipSync: SAiD (arXiv:2401.08655)
