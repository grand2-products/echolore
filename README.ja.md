<div align="center">

# EchoLore

**AI ナレッジ & ミーティングプラットフォーム。コマンド 1 つでセルフホスト。**

[![CI](https://github.com/grand2-products/echolore/actions/workflows/ci.yml/badge.svg)](https://github.com/grand2-products/echolore/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/grand2-products/echolore)](https://github.com/grand2-products/echolore/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-マニュアル-8b5cf6)](https://grand2-products.github.io/echolore/)

[マニュアル (JP)](https://grand2-products.github.io/echolore/) · [Manual (EN)](https://grand2-products.github.io/echolore/en/) · [English README](README.md)

</div>

## 主な機能

- 📝 **Notion スタイルの Wiki** — ブロックエディタ、リアルタイム共同編集、ページ権限
- 🔍 **AI チャット (RAG)** — Wiki を根拠に引用付きで回答
- 🎥 **会議** — LiveKit によるビデオ・音声・画面共有、AI 議事録要約
- 🤖 **外部 AI エージェント (MCP)** — ChatGPT / Claude 等をナレッジに接続
- 🔐 **認証** — Google SSO とメール/パスワード
- 🗄️ **ストレージ** — ローカル / S3 互換 / GCS から選択
- 🌐 **多言語 UI** — 日本語・英語・韓国語・中国語 (簡体字)

## クイックスタート

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | sudo bash
```

ドメイン名とメールアドレスを入力するだけで、TLS 証明書の取得からデータベースマイグレーションまで自動で行われます。

→ 詳細: [インストールガイド](https://grand2-products.github.io/echolore/getting-started/install/)

## ドキュメント

**完全なマニュアルは https://grand2-products.github.io/echolore/ にあります。**

| セクション | 内容 |
|-----------|------|
| [はじめに](https://grand2-products.github.io/echolore/getting-started/requirements/) | 動作要件、インストール、初期セットアップ、デプロイ環境の選択 (オンプレ / VPS / クラウド) |
| [機能ガイド](https://grand2-products.github.io/echolore/features/wiki/) | Wiki、会議、AI チャット、MCP エージェント |
| [管理](https://grand2-products.github.io/echolore/admin/console/) | 管理画面、エージェントトークン |
| [運用](https://grand2-products.github.io/echolore/operations/update/) | アップデート、バックアップ、トラブルシューティング、Cloudflare による保護 |
| [開発に参加する](https://grand2-products.github.io/echolore/development/dev-setup/) | 開発環境、ブランチポリシー、リリースフロー |

内部向け資料: [DEPLOYMENT.md](DEPLOYMENT.md) · [docs/](docs/) · [AGENTS.md](AGENTS.md)

## コントリビューション

歓迎します。[コントリビューションガイド](https://grand2-products.github.io/echolore/development/contributing/) と [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## サポート

- 🐛 [バグ報告](https://github.com/grand2-products/echolore/issues/new?template=bug_report.md) / 💡 [機能リクエスト](https://github.com/grand2-products/echolore/issues/new?template=feature_request.md)
- 🔒 セキュリティ問題: [SECURITY.md](SECURITY.md) を参照

## ライセンス

[MIT](LICENSE) © Grand2
