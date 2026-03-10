# 技術選定

## 1. 技術スタック一覧

> 実装差分注記（2026-03-10）
> - 本表は採用計画（To-Be）を含む。現行実装は `apps/api` / `apps/web` の最小構成が先行。
> - LiveKitはトークン発行・ルーム管理APIまで実装済み。
> - Google Cloud Speech-to-Text / Vertex AI / LiveKit Egress を用いたAI機能は未実装。
> - OAuth2 Proxy は設計上採用だが、アプリ内の認証フロー本実装は未完。

| カテゴリ | 技術 | バージョン | 理由 |
|---------|------|----------|------|
| **クラウド** | Google Cloud Platform | - | 既存インフラ、Google SSO連携容易 |
| **IaC** | Terraform | 1.5+ | インフラ構成管理、再現性 |
| **コンピュート** | Compute Engine (GCE) | - | Docker Compose実行環境 |
| **ストレージ** | Cloud Storage (GCS) | - | ファイル保存、スケーラブル |
| **コンテナ** | Docker Compose | 3.8 | シンプルなオーケストレーション |
| **リバースプロキシ** | Traefik | 3.3.x | 自動サービス発見、Let's Encrypt統合 |
| **フロントエンド** | Next.js | 15.x | Turbopack安定版、React19対応、改善されたパフォーマンス |
| **UIライブラリ** | React | 19.x | Server Actions、use()フック、改善されたSSR |
| **スタイリング** | Tailwind CSS | 3.x | 高速ビルド、ユーティリティファースト、大規模採用実績 |
| **エディタ** | TipTap | 2.x | NotionライクなBlock-basedエディタ |
| **状態管理** | Zustand | 4.x | 軽量、シンプル、persistミドルウェア |
| **データフェッチ** | TanStack Query | 5.x | キャッシュ、再試行 |
| **バックエンド** | Node.js + Hono | 22.x / 4.x | 軽量FW、型安全、エッジ対応 |
| **ORM** | Drizzle ORM | 0.40.x | PostgreSQL対応、型安全、マイグレーション改善 |
| **DB** | PostgreSQL (Docker) | 17.x | 堅牢性、実績、パフォーマンス向上 |
| **WebRTC** | LiveKit | latest | SFU内蔵、低遅延 |
| **認証** | OAuth2 Proxy | 7.7.x | Google SSO標準、セキュリティ修正 |
| **バリデーション** | Zod | 3.x | 型推論、スキーマ検証 |
| **テスト** | Vitest | 2.x | Viteベース、高速、ブラウザモード対応 |
| **Linter** | Biome | 1.x | Rust製、高速 |
| **音声認識** | Google Cloud Speech-to-Text | v2 | リアルタイム文字起こし、話者分離 |
| **AI** | Vertex AI (Gemini) | latest | 議事録要約・生成 |

## 2. 詳細選定理由

### 2.1 GCP採用の理由

| 項目 | GCP | AWS | Azure |
|------|-----|-----|-------|
| **Google SSO連携** | ✅ 簡単 | △ 設定必要 | △ 設定必要 |
| **既存インフラ** | ✅ 既存プロジェクト | ❌ | ❌ |
| **コスト** | 中 | 高 | 高 |
| **Terraform対応** | ✅ | ✅ | ✅ |

**結論: 既存GCPプロジェクト + Google SSO連携容易のためGCP採用**

### 2.2 Terraform採用の理由

| 項目 | Terraform | Pulumi | Cloud Deployment Manager |
|------|-----------|--------|--------------------------|
| GCP対応 | ✅ | ✅ | ✅ |
| 学習コスト | 中 | 低 (プログラミング) | 低 |
| コミュニティ | 大 | 中 | 小 |
| マルチクラウド | ✅ | ✅ | ❌ |
| 状態管理 | ✅ | ✅ | ✅ |

**結論: Terraform採用（実績、コミュニティ、マルチクラウド対応）**

### 2.3 Compute Engine vs Cloud Run vs GKE

| 項目 | Compute Engine | Cloud Run | GKE |
|------|---------------|-----------|-----|
| 複雑さ | 低 | 低 | 高 |
| Docker Compose | ✅ | ❌ (単一コンテナ) | ❌ (K8s) |
| コスト | 低〜中 | 中 | 高 |
| スケーリング | 手動 | 自動 | 自動 |
| WebRTC対応 | ✅ | △ | ✅ |
| PostgreSQL | ✅ (Docker内) | ❌ | ✅ (Pod) |

**結論: Compute Engine採用（Docker Compose使用可能、PostgreSQL内包、コスト）**

### 2.4 Cloud Storage vs MinIO

| 項目 | Cloud Storage | MinIO (Docker) |
|------|---------------|----------------|
| 運用工数 | なし | あり |
| スケーラビリティ | ✅ 無限 | 手動 |
| S3互換API | ✅ | ✅ |
| コスト | 従量課金 | 固定 (VM内) |
| バックアップ | 自動 | 手動 |

**結論: Cloud Storage採用（運用不要、スケーラブル、バックアップ自動）**

### 2.5 PostgreSQL (Docker) vs Cloud SQL

| 項目 | PostgreSQL (Docker) | Cloud SQL |
|------|---------------------|-----------|
| 運用工数 | あり | なし |
| コスト | なし (VM内) | $10-50/月 |
| バックアップ | 手動 | 自動 |
| 高可用性 | 自前構築 | ✅ |
| パフォーマンス | 高 | 高 |

**結論: PostgreSQL (Docker) 採用（コスト削減、シンプル構成）**

### 2.6 Traefik vs Nginx

| 項目 | Traefik | Nginx |
|------|---------|-------|
| Docker統合 | ✅ 自動発見 | 手動設定 |
| Let's Encrypt | ✅ 自動 | certbot必要 |
| 設定ファイル | ラベルベース | confファイル |
| ダッシュボード | ✅ 内蔵 | 別途 |

**結論: Traefik採用（Dockerネイティブ、Let's Encrypt自動）**

### 2.7 Next.js vs その他

| 項目 | Next.js | Remix | Nuxt |
|------|---------|-------|------|
| Docker対応 | ✅ | ✅ | ✅ |
| React生態系 | ✅ | ✅ | ❌ (Vue) |
| App Router | ✅ | - | - |
| コミュニティ | 大 | 中 | 中 |

**結論: Next.js採用（React生態系、App Router）**

### 2.8 Wikiエディタ: TipTap vs Slate vs ProseMirror

| 項目 | TipTap | Slate | ProseMirror |
|------|--------|-------|-------------|
| 学習コスト | 低 | 高 | 非常に高い |
| Block-based | ✅ | ✅ | ✅ |
| NotionライクUI | 実装例多数 | 自前実装 | 自前実装 |
| React統合 | ✅ | ✅ | 手動 |

**結論: TipTap採用（Block-based、React統合、コミュニティ大）**

### 2.9 API FW: Hono vs Express vs Fastify

| 項目 | Hono | Express | Fastify |
|------|------|---------|---------|
| バンドルサイズ | ~13KB | ~200KB | ~80KB |
| TypeScript | ✅ | △ | ✅ |
| エッジ対応 | ✅ | ❌ | ❌ |
| パフォーマンス | 高 | 中 | 高 |

**結論: Hono採用（軽量、型安全、エッジ対応）**

### 2.10 ORM: Drizzle vs Prisma vs Kysely

| 項目 | Drizzle | Prisma | Kysely |
|------|---------|--------|--------|
| PostgreSQL対応 | ✅ | ✅ | ✅ |
| バンドルサイズ | 小 | 大 | 小 |
| マイグレーション | ✅ | ✅ | 別途 |
| 型安全性 | ✅ | ✅ | ✅ |

**結論: Drizzle採用（軽量、型安全、PostgreSQL対応）**

### 2.11 WebRTC: LiveKit vs Jitsi vs mediasoup

| 項目 | LiveKit | Jitsi | mediasoup |
|------|---------|-------|-----------|
| Docker対応 | ✅ | ✅ | ✅ |
| スケーラビリティ | 高 | 中 | 中 |
| SDK | 豊富 | 中 | 少 |
| ドキュメント | 充実 | 充実 | 中 |

**結論: LiveKit採用（SDK豊富、スケーラビリティ、ドキュメント充実）**

### 2.12 認証: OAuth2 Proxy vs Authentik vs Keycloak

| 項目 | OAuth2 Proxy | Authentik | Keycloak |
|------|--------------|-----------|----------|
| 軽量さ | ✅ | 中 | 重 |
| Google SSO | ✅ | ✅ | ✅ |
| 設定複雑さ | 低 | 中 | 高 |

**結論: OAuth2 Proxy採用（軽量、Google SSO、設定簡単）**

### 2.13 音声認識: Google Cloud Speech-to-Text vs その他

| 項目 | Google Cloud Speech-to-Text | Amazon Transcribe | Azure Speech |
|------|----------------------------|-------------------|--------------|
| 日本語対応 | ✅ 高精度 | ✅ | ✅ |
| 話者分離 | ✅ | ✅ | ✅ |
| リアルタイム | ✅ | ✅ | ✅ |
| GCP統合 | ✅ | ❌ | ❌ |

**結論: Google Cloud Speech-to-Text採用（GCP統合、日本語高精度）**

### 2.14 AI要約: Vertex AI vs OpenAI vs Claude

| 項目 | Vertex AI (Gemini) | OpenAI GPT-4 | Claude |
|------|-------------------|--------------|--------|
| GCP統合 | ✅ | ❌ | ❌ |
| 日本語対応 | ✅ | ✅ | ✅ |
| コスト | 中 | 高 | 高 |
| コンテキスト長 | 長 | 中 | 長 |

**結論: Vertex AI (Gemini) 採用（GCP統合、コスト）**

## 3. 開発環境

### 3.1 必要ツール

```bash
# Node.js
node >= 20.x

# パッケージマネージャー
pnpm >= 8.x

# Docker
docker >= 24.x
docker-compose >= 2.x

# Terraform
terraform >= 1.5

# Google Cloud CLI
gcloud >= 400.x
```

### 3.2 プロジェクト構成

```
corp-internal/
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── modules/
│   │   ├── compute/
│   │   ├── storage/
│   │   └── network/
│   └── environments/
│       ├── dev/
│       └── prod/
├── docker-compose.yml
├── .env.example
├── livekit.yaml
├── apps/
│   ├── web/                    # Next.js
│   │   ├── Dockerfile
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── package.json
│   │   └── next.config.js
│   └── api/                    # Node.js API
│       ├── Dockerfile
│       ├── src/
│       │   ├── routes/
│       │   ├── db/
│       │   ├── storage/
│       │   ├── ai/             # AI機能
│       │   │   ├── transcription.ts
│       │   │   └── summary.ts
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型・ユーティリティ
│   │   ├── types/
│   │   └── package.json
│   └── ui/                     # 共有UIコンポーネント
│       ├── components/
│       └── package.json
├── plan/                       # 企画ドキュメント
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json                # ルート (Turborepo)
├── turbo.json
└── pnpm-workspace.yaml
```

## 4. 外部依存

| 依存先 | 用途 | 必須/任意 |
|--------|------|----------|
| Google Cloud Platform | インフラ (GCE, GCS) | 必須 |
| Google Workspace | SSO認証 | 必須 |
| GitHub | ソース管理・CI/CD | 必須 |
| ドメイン | SSL証明書 | 必須 |
| Google Cloud Speech-to-Text | 文字起こし | 必須 |
| Vertex AI | 議事録要約 | 必須 |

## 5. AI機能（Room模式必須）

> 実装状況（2026-03-10）
> - 本セクションの4項目はすべて計画段階で、現時点では未実装。

| 機能 | 技術 | 用途 |
|------|------|------|
| 音声認識 | Google Cloud Speech-to-Text | リアルタイム文字起こし |
| 話者分離 | Speech-to-Text Diarization | 発話者識別 |
| 要約生成 | Vertex AI (Gemini) | 議事録自動生成 |
| 録画 | LiveKit Egress | クラウド録画 |

## 6. 将来拡張候補

| 機能 | 技術候補 | 優先度 |
|------|---------|--------|
| 全文検索強化 | Meilisearch / AlloyDB | 中 |
| モバイルアプリ | React Native / Capacitor | 低 |
| 分析ダッシュボード | Looker Studio | 低 |
| 監視強化 | Cloud Monitoring / Cloud Trace | 中 |
| CDN | Cloud CDN | 中 |

## 7. GCP リソース一覧

| リソース | 用途 | Terraform管理 |
|---------|------|--------------|
| Compute Engine | VM (Docker実行環境) | ✅ |
| Cloud Storage | ファイルストレージ | ✅ |
| VPC | プライベートネットワーク | ✅ |
| Firewall | アクセス制御 | ✅ |
| Service Account | GCS アクセス用 | ✅ |
| Container Registry | Dockerイメージ管理 | 手動 |
| Cloud Logging | ログ管理 (自動) | ❌ |
| Cloud Monitoring | 監視 (自動) | ❌ |
| Speech-to-Text | 音声認識 | API有効化 |
| Vertex AI | AI要約 | API有効化 |

## 8. Docker コンテナ一覧

| コンテナ | 用途 | ポート |
|---------|------|--------|
| traefik | リバースプロキシ | 80, 443 |
| oauth2-proxy | 認証 | - |
| web | Next.js フロントエンド | 3000 |
| api | Node.js API | 3001 |
| db | PostgreSQL | 5432 |
| livekit | WebRTC SFU | 7880, 50000-50200/udp |
| redis | LiveKit用 | 6379 |
