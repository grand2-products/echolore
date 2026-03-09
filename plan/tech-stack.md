# 技術選定

## 1. 技術スタック一覧

| カテゴリ | 技術 | バージョン | 理由 |
|---------|------|----------|------|
| **インフラ** | Cloudflare | - | コスト削減、エッジパフォーマンス |
| **フロントエンド** | Next.js | 14.x | App Router、RSC対応 |
| **UIライブラリ** | React | 18.x | Next.js標準 |
| **スタイリング** | Tailwind CSS | 3.x | 高速開発、ユーティリティファースト |
| **エディタ** | TipTap | 2.x | NotionライクなBlock-basedエディタ |
| **状態管理** | Zustand | 4.x | 軽量、シンプル |
| **データフェッチ** | TanStack Query | 5.x | キャッシュ、再試行 |
| **バックエンド** | Cloudflare Workers | - | エッジ実行、D1ネイティブ |
| **ランタイム** | Hono | 4.x | Worker向け軽量FW |
| **ORM** | Drizzle ORM | 0.x | D1対応、型安全 |
| **DB** | Cloudflare D1 | - | SQLite、Workers統合 |
| **ストレージ** | Cloudflare R2 | - | S3互換、egress無料 |
| **WebRTC** | Cloudflare Calls | - | SFU内蔵、低遅延 |
| **認証** | Cloudflare Access | - | Google SSO標準 |
| **バリデーション** | Zod | 3.x | 型推論、スキーマ検証 |
| **テスト** | Vitest | 1.x | Viteベース、高速 |
| **Linter** | Biome | 1.x | Rust製、高速 |

## 2. 詳細選定理由

### 2.1 Cloudflare採用の理由

| 項目 | Cloudflare | GCP | AWS |
|------|-----------|-----|-----|
| **月額コスト** | $5-15 | $40-80 | $50-100 |
| **グローバルエッジ** | 310+拠点 | 100+拠点 | 100+拠点 |
| **セットアップ複雑さ** | 低 | 中 | 高 |
| **WebRTC** | Calls (内蔵) | 別途構築 | 別途構築 |
| **DB運用** | D1 (管理不要) | Cloud SQL | RDS |

**結論: 小規模社内アプリにはCloudflareが最適**

### 2.2 Next.js vs その他

| 項目 | Next.js | Remix | Nuxt |
|------|---------|-------|------|
| Cloudflare対応 | Pages | Pages | Pages |
| React生態系 | ✅ | ✅ | ❌ (Vue) |
| App Router | ✅ | - | - |
| コミュニティ | 大 | 中 | 中 |

**結論: Next.js採用（React生態系、App Router、Cloudflare公式サポート）**

### 2.3 Wikiエディタ: TipTap vs Slate vs ProseMirror

| 項目 | TipTap | Slate | ProseMirror |
|------|--------|-------|-------------|
| 学習コスト | 低 | 高 | 非常に高い |
| Block-based | ✅ | ✅ | ✅ |
| NotionライクUI | 実装例多数 | 自前実装 | 自前実装 |
| React統合 | ✅ | ✅ | 手動 |

**結論: TipTap採用（Block-based、React統合、コミュニティ大）**

### 2.4 Workers FW: Hono vs itty-router vs none

| 項目 | Hono | itty-router | 生Workers |
|------|------|-------------|-----------|
| バンドルサイズ | ~13KB | ~500B | 0 |
| TypeScript | ✅ | ✅ | ✅ |
| ミドルウェア | 豊富 | 最小 | 自前 |
| 開発体験 | 高 | 中 | 低 |

**結論: Hono採用（ミドルウェア豊富、開発体験良好）**

### 2.5 ORM: Drizzle vs Prisma vs Kysely

| 項目 | Drizzle | Prisma | Kysely |
|------|---------|--------|--------|
| D1対応 | ✅ | 実験的 | ✅ |
| バンドルサイズ | 小 | 大 | 小 |
| マイグレーション | ✅ | ✅ | 別途 |
| 型安全性 | ✅ | ✅ | ✅ |

**結論: Drizzle採用（D1公式対応、軽量、型安全）**

## 3. 開発環境

### 3.1 必要ツール

```bash
# Node.js
node >= 20.x

# パッケージマネージャー
pnpm >= 8.x

# Cloudflare CLI
wrangler >= 3.x
```

### 3.2 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js (Pages)
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── package.json
│   │   └── next.config.js
│   └── api/                    # Workers
│       ├── src/
│       │   ├── routes/
│       │   ├── db/
│       │   └── index.ts
│       ├── wrangler.toml
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型・ユーティリティ
│   │   ├── types/
│   │   └── package.json
│   └── ui/                     # 共有UIコンポーネント
│       ├── components/
│       └── package.json
├── plan/                       # 企画ドキュメント
├── package.json                # ルート (Turborepo)
├── turbo.json
└── pnpm-workspace.yaml
```

### 3.3 CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
      
      # Deploy to Cloudflare
      - run: pnpm --filter api deploy
      - run: pnpm --filter web deploy
```

## 4. 外部依存

| 依存先 | 用途 | 必須/任意 |
|--------|------|----------|
| Google Workspace | SSO認証 | 必須 |
| Cloudflare アカウント | インフラ | 必須 |
| GitHub | ソース管理・CI/CD | 必須 |

## 5. 将来拡張候補

| 機能 | 技術候補 | 優先度 |
|------|---------|--------|
| 全文検索強化 | Meilisearch / Typesense | 中 |
| AIアシスタント | Cloudflare Workers AI | 低 |
| モバイルアプリ | React Native / Capacitor | 低 |
| 分析ダッシュボード | Metabase / Cube | 低 |
