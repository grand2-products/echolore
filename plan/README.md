# 社内ポータルアプリ 企画ドキュメント

## ドキュメント一覧

| ファイル | 内容 |
|---------|------|
| [overview.md](./overview.md) | 企画概要・背景・目的・主要機能 |
| [architecture.md](./architecture.md) | アーキテクチャ設計・インフラ構成 |
| [tech-stack.md](./tech-stack.md) | 技術選定理由・開発環境・CI/CD |
| [nextjs-pages.md](./nextjs-pages.md) | Next.jsページ構成 |
| [call-tool.md](./call-tool.md) | 社内通話ツール詳細仕様 |
| [wiki.md](./wiki.md) | 社内Wiki詳細仕様 |
| [admin-user-management.md](./admin-user-management.md) | ユーザー管理Admin画面仕様 |
| [deployment.md](./deployment.md) | デプロイ戦略 |
| [timeline.md](./timeline.md) | 開発スケジュール・マイルストーン |
| [cost.md](./cost.md) | コスト試算・比較 |

## クイックサマリー

### プロダクト概要
- **目的**: 社内Wiki + ビデオ会議ツール的一元管理
- **ターゲット**: grand2 Products 全社員 (10-100名)
- **主要機能**:
  - Google SSO認証
  - NotionライクなWiki
  - LiveKitベースのビデオ会議 (Everybody Coworking / Room)
  - AI議事録生成

### 技術スタック (主要のみ)
| カテゴリ | 技術 |
|---------|------|
| クラウド | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| フロントエンド | Next.js 15, React 19, Tailwind CSS 3 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |

### 開発スケジュール
- **期間**: 8週間 (2ヶ月)
- **マイルストーン**:
  - Week 4: Alpha (Wiki基本機能完成)
  - Week 6: Beta (全機能完成)
  - Week 8: Release (本番リリース)

### コスト試算
- **月額 (50人規模)**: ~$55 (約 ¥8,250)
- **年額**: ~$660 (約 ¥99,000)
- **既存SaaS比較**: 96% コスト削減

## 推奨読書順序

1. **overview.md** - 全体像を把握
2. **architecture.md** - 技術構成を理解
3. **tech-stack.md** - 技術選定理由を確認
4. **nextjs-pages.md** - ページ構成を確認
5. **call-tool.md** - 通話ツール詳細を確認
6. **wiki.md** - Wiki詳細仕様を確認
7. **admin-user-management.md** - ユーザー管理・権限仕様を確認
8. **deployment.md** - デプロイ戦略を確認
9. **timeline.md** - スケジュール確認
10. **cost.md** - コスト詳細確認

## 次のステップ

- [ ] ステークホルダー承認
- [ ] 開発リソース確定
- [ ] GCPプロジェクト確認
- [ ] 開発開始
- [ ] 開発リソース確定
- [ ] GCPプロジェクト確認
- [ ] 開発開始


- [ ] 開発リソース確定
- [ ] GCPプロジェクト確認
- [ ] 開発開始





- [ ] 開発リソース確定
- [ ] GCPプロジェクト確認
- [ ] 開発開始



- [ ] 開発開始


