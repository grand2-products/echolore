# Contributing to EchoLore

コントリビューションを歓迎します / Contributions are welcome!

開発の進め方の詳細は **[コントリビューションガイド (マニュアル)](https://grand2-products.github.io/echolore/development/contributing/)** を参照してください。

## Quick Summary

1. Issue を作成して提案を共有する (バグ・機能どちらも)
2. フィーチャーブランチを作成して開発
3. PR を作成 (Context と Test plan を記載)
4. CI (lint / typecheck / test) が通ったらマージ

```bash
pnpm install
pnpm typecheck   # 必須
pnpm lint
pnpm test
```

## Key Rules

- 認証・認可の変更には回帰テストを追加すること
- API 契約の変更は `packages/shared` を更新し、API と Web の両側を検証すること
- DB スキーマ変更は Kysely インターフェースと SQL マイグレーションを同時に更新すること
- ユーザーに見える変更は `apps/docs` のマニュアルも同じ変更で更新すること

詳細: [AGENTS.md](AGENTS.md) (リポジトリ規約) · [マニュアル (開発)](https://grand2-products.github.io/echolore/development/dev-setup/)
