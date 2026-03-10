# 社内ポータルアプリ

grand2 Products 社内ポータルアプリケーション

## 概要

- Google SSO認証
- Notionライクな社内Wiki
- WebRTCビデオ会議（全社員参加）

## 技術スタック（現行GCP構成）

- クラウド: GCP（Compute Engine + Cloud Storage）
- 配置: Docker Compose（web / api / db / livekit / redis）
- Web: Next.js + React
- API: Hono + Drizzle ORM + PostgreSQL
- 通話基盤: LiveKit
- 認証方針: OAuth2 Proxy（Google SSO、実装は段階的に反映中）

## ドキュメント

- [企画概要](plan/overview.md)
- [アーキテクチャ](plan/architecture.md)
- [技術選定](plan/tech-stack.md)
- [開発スケジュール](plan/timeline.md)
- [コスト試算](plan/cost.md)
