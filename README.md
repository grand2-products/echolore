# 社内ポータルアプリ

grand2 Products 社内ポータルアプリケーション

## 概要

- Google SSO認証
- Notionライクな社内Wiki
- WebRTCビデオ会議（全社員参加）

## 技術スタック

Cloudflareフルスタック採用

- Frontend: Cloudflare Pages + Next.js
- Backend: Cloudflare Workers
- Database: Cloudflare D1 (SQLite)
- Storage: Cloudflare R2
- Auth: Cloudflare Access (Google SSO)
- WebRTC: Cloudflare Calls

## ドキュメント

- [企画概要](plan/overview.md)
- [アーキテクチャ](plan/architecture.md)
- [技術選定](plan/tech-stack.md)
- [開発スケジュール](plan/timeline.md)
- [コスト試算](plan/cost.md)
