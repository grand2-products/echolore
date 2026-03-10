# grand2 Products 社内ポータルアプリ

社内Wiki & ビデオ会議ツール - Monorepo開発環境

## 最短起動手順（env作成→compose起動→疎通確認）

```bash
# 1) 依存関係インストール
pnpm install

# 2) 環境変数ファイル作成
copy .env.example .env

# 3) Compose 設定の構文チェック
docker compose config

# 4) コンテナ起動
pnpm docker:dev

# 5) API / Web 疎通確認
# API
curl http://localhost:3001/health
# Web
# ブラウザで http://localhost:3000 を開く
```

- API ヘルスチェックが `{"status":"ok", ...}` を返せば疎通OK
- 初回のみ必要に応じて [`pnpm db:push`](package.json:21) を実行

## 🚀 クイックスタート

### 前提条件

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- (本番環境のみ) Google Cloud Platform アカウント

### セットアップ

1. **リポジトリのクローン**
```bash
git clone https://github.com/grand2-products/corp-internal.git
cd corp-internal
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

4. **Dockerコンテナの起動**
```bash
pnpm docker:dev
```

5. **データベースのマイグレーション**
```bash
pnpm db:push
```

6. **開発サーバーの起動**
```bash
pnpm dev
```

- フロントエンド: http://localhost:3000
- API: http://localhost:3001
- LiveKit: http://localhost:7880

## 📁 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js 16 フロントエンド
│   │   ├── app/                # App Router
│   │   ├── components/         # Reactコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── package.json
│   └── api/                    # Node.js + Hono API
│       ├── src/
│       │   ├── routes/         # APIルート
│       │   ├── db/             # データベース設定
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型定義
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── terraform/                  # インフラ構成管理
├── docker-compose.yml
├── livekit.yaml
├── package.json                # ルート (Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, Tailwind CSS 4 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| ORM | Drizzle ORM |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |
| インフラ | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| パッケージマネージャー | pnpm |
| ビルドツール | Turborepo |
| Linter/Formatter | Biome |

## 📝 主要機能

### 1. 社内Wiki
- NotionライクなBlock-basedエディタ (TipTap)
- リアルタイム共同編集
- ページ階層構造
- フルテキスト検索

### 2. ビデオ会議ツール
- **Everybody Coworkingモード**: 全社員の顔がリアルタイム更新
- **Roomモード**: 会議ルーム作成・管理
- AI機能: 文字起こし、話者分離、議事録生成

### 3. 認証
- Google SSO (OAuth2 Proxy)
- 社内ドメイン制限 (@grand2-products.com)

## 🔧 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# リント
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format

# テスト
pnpm test

# 型チェック
pnpm typecheck

# クリーンアップ
pnpm clean

# Docker操作
pnpm docker:dev      # 起動
pnpm docker:down     # 停止
pnpm docker:logs     # ログ確認

# データベース操作
pnpm db:generate     # マイグレーション生成
pnpm db:migrate      # マイグレーション実行
pnpm db:push         # スキーマプッシュ
pnpm db:studio       # Drizzle Studio起動
```

## 🌍 環境変数

詳細は [`.env.example`](./.env.example) を参照してください。

### 必須環境変数

- `DATABASE_URL`: PostgreSQL接続URL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `GOOGLE_CLOUD_PROJECT`: GCPプロジェクトID
- `GCS_BUCKET`: Cloud Storage バケット名

## 🚢 デプロイ

### 本番環境へのデプロイ

1. **Terraformでインフラ構築**
```bash
cd terraform/environments/prod
terraform init
terraform apply
```

2. **Dockerイメージのビルド・プッシュ**
```bash
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT_ID/wiki-api:latest .
docker build -f apps/web/Dockerfile -t gcr.io/PROJECT_ID/wiki-web:latest .
docker push gcr.io/PROJECT_ID/wiki-api:latest
docker push gcr.io/PROJECT_ID/wiki-web:latest
```

3. **GCEでのデプロイ**
```bash
# SSHでGCEインスタンスに接続後
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 ドキュメント

- [企画概要](./plan/overview.md)
- [アーキテクチャ設計](./plan/architecture.md)
- [技術選定](./plan/tech-stack.md)
- [Wiki仕様](./plan/wiki.md)
- [通話ツール仕様](./plan/call-tool.md)
- [開発スケジュール](./plan/timeline.md)
- [コスト試算](./plan/cost.md)

## 📄 ライセンス

Private - grand2 Products

## 👥 開発チーム

grand2 Products

社内Wiki & ビデオ会議ツール - Monorepo開発環境

## 🚀 クイックスタート

### 前提条件

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- (本番環境のみ) Google Cloud Platform アカウント

### セットアップ

1. **リポジトリのクローン**
```bash
git clone https://github.com/grand2-products/corp-internal.git
cd corp-internal
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

4. **Dockerコンテナの起動**
```bash
pnpm docker:dev
```

5. **データベースのマイグレーション**
```bash
pnpm db:push
```

6. **開発サーバーの起動**
```bash
pnpm dev
```

- フロントエンド: http://localhost:3000
- API: http://localhost:3001
- LiveKit: http://localhost:7880

## 📁 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js 16 フロントエンド
│   │   ├── app/                # App Router
│   │   ├── components/         # Reactコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── package.json
│   └── api/                    # Node.js + Hono API
│       ├── src/
│       │   ├── routes/         # APIルート
│       │   ├── db/             # データベース設定
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型定義
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── terraform/                  # インフラ構成管理
├── docker-compose.yml
├── livekit.yaml
├── package.json                # ルート (Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, Tailwind CSS 4 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| ORM | Drizzle ORM |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |
| インフラ | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| パッケージマネージャー | pnpm |
| ビルドツール | Turborepo |
| Linter/Formatter | Biome |

## 📝 主要機能

### 1. 社内Wiki
- NotionライクなBlock-basedエディタ (TipTap)
- リアルタイム共同編集
- ページ階層構造
- フルテキスト検索

### 2. ビデオ会議ツール
- **Everybody Coworkingモード**: 全社員の顔がリアルタイム更新
- **Roomモード**: 会議ルーム作成・管理
- AI機能: 文字起こし、話者分離、議事録生成

### 3. 認証
- Google SSO (OAuth2 Proxy)
- 社内ドメイン制限 (@grand2-products.com)

## 🔧 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# リント
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format

# テスト
pnpm test

# 型チェック
pnpm typecheck

# クリーンアップ
pnpm clean

# Docker操作
pnpm docker:dev      # 起動
pnpm docker:down     # 停止
pnpm docker:logs     # ログ確認

# データベース操作
pnpm db:generate     # マイグレーション生成
pnpm db:migrate      # マイグレーション実行
pnpm db:push         # スキーマプッシュ
pnpm db:studio       # Drizzle Studio起動
```

## 🌍 環境変数

詳細は [`.env.example`](./.env.example) を参照してください。

### 必須環境変数

- `DATABASE_URL`: PostgreSQL接続URL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `GOOGLE_CLOUD_PROJECT`: GCPプロジェクトID
- `GCS_BUCKET`: Cloud Storage バケット名

## 🚢 デプロイ

### 本番環境へのデプロイ

1. **Terraformでインフラ構築**
```bash
cd terraform/environments/prod
terraform init
terraform apply
```

2. **Dockerイメージのビルド・プッシュ**
```bash
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT_ID/wiki-api:latest .
docker build -f apps/web/Dockerfile -t gcr.io/PROJECT_ID/wiki-web:latest .
docker push gcr.io/PROJECT_ID/wiki-api:latest
docker push gcr.io/PROJECT_ID/wiki-web:latest
```

3. **GCEでのデプロイ**
```bash
# SSHでGCEインスタンスに接続後
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 ドキュメント

- [企画概要](./plan/overview.md)
- [アーキテクチャ設計](./plan/architecture.md)
- [技術選定](./plan/tech-stack.md)
- [Wiki仕様](./plan/wiki.md)
- [通話ツール仕様](./plan/call-tool.md)
- [開発スケジュール](./plan/timeline.md)
- [コスト試算](./plan/cost.md)

## 📄 ライセンス

Private - grand2 Products

## 👥 開発チーム

grand2 Products

社内Wiki & ビデオ会議ツール - Monorepo開発環境

## 🚀 クイックスタート

### 前提条件

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- (本番環境のみ) Google Cloud Platform アカウント

### セットアップ

1. **リポジトリのクローン**
```bash
git clone https://github.com/grand2-products/corp-internal.git
cd corp-internal
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

4. **Dockerコンテナの起動**
```bash
pnpm docker:dev
```

5. **データベースのマイグレーション**
```bash
pnpm db:push
```

6. **開発サーバーの起動**
```bash
pnpm dev
```

- フロントエンド: http://localhost:3000
- API: http://localhost:3001
- LiveKit: http://localhost:7880

## 📁 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js 15 フロントエンド
│   │   ├── app/                # App Router
│   │   ├── components/         # Reactコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── package.json
│   └── api/                    # Node.js + Hono API
│       ├── src/
│       │   ├── routes/         # APIルート
│       │   ├── db/             # データベース設定
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型定義
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── terraform/                  # インフラ構成管理
├── docker-compose.yml
├── livekit.yaml
├── package.json                # ルート (Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, Tailwind CSS 4 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| ORM | Drizzle ORM |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |
| インフラ | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| パッケージマネージャー | pnpm |
| ビルドツール | Turborepo |
| Linter/Formatter | Biome |

## 📝 主要機能

### 1. 社内Wiki
- NotionライクなBlock-basedエディタ (TipTap)
- リアルタイム共同編集
- ページ階層構造
- フルテキスト検索

### 2. ビデオ会議ツール
- **Everybody Coworkingモード**: 全社員の顔がリアルタイム更新
- **Roomモード**: 会議ルーム作成・管理
- AI機能: 文字起こし、話者分離、議事録生成

### 3. 認証
- Google SSO (OAuth2 Proxy)
- 社内ドメイン制限 (@grand2-products.com)

## 🔧 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# リント
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format

# テスト
pnpm test

# 型チェック
pnpm typecheck

# クリーンアップ
pnpm clean

# Docker操作
pnpm docker:dev      # 起動
pnpm docker:down     # 停止
pnpm docker:logs     # ログ確認

# データベース操作
pnpm db:generate     # マイグレーション生成
pnpm db:migrate      # マイグレーション実行
pnpm db:push         # スキーマプッシュ
pnpm db:studio       # Drizzle Studio起動
```

## 🌍 環境変数

詳細は [`.env.example`](./.env.example) を参照してください。

### 必須環境変数

- `DATABASE_URL`: PostgreSQL接続URL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `GOOGLE_CLOUD_PROJECT`: GCPプロジェクトID
- `GCS_BUCKET`: Cloud Storage バケット名

## 🚢 デプロイ

### 本番環境へのデプロイ

1. **Terraformでインフラ構築**
```bash
cd terraform/environments/prod
terraform init
terraform apply
```

2. **Dockerイメージのビルド・プッシュ**
```bash
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT_ID/wiki-api:latest .
docker build -f apps/web/Dockerfile -t gcr.io/PROJECT_ID/wiki-web:latest .
docker push gcr.io/PROJECT_ID/wiki-api:latest
docker push gcr.io/PROJECT_ID/wiki-web:latest
```

3. **GCEでのデプロイ**
```bash
# SSHでGCEインスタンスに接続後
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 ドキュメント

- [企画概要](./plan/overview.md)
- [アーキテクチャ設計](./plan/architecture.md)
- [技術選定](./plan/tech-stack.md)
- [Wiki仕様](./plan/wiki.md)
- [通話ツール仕様](./plan/call-tool.md)
- [開発スケジュール](./plan/timeline.md)
- [コスト試算](./plan/cost.md)

## 📄 ライセンス

Private - grand2 Products

## 👥 開発チーム

grand2 Products


社内Wiki & ビデオ会議ツール - Monorepo開発環境

## 🚀 クイックスタート

### 前提条件

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- (本番環境のみ) Google Cloud Platform アカウント

### セットアップ

1. **リポジトリのクローン**
```bash
git clone https://github.com/grand2-products/corp-internal.git
cd corp-internal
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

4. **Dockerコンテナの起動**
```bash
pnpm docker:dev
```

5. **データベースのマイグレーション**
```bash
pnpm db:push
```

6. **開発サーバーの起動**
```bash
pnpm dev
```

- フロントエンド: http://localhost:3000
- API: http://localhost:3001
- LiveKit: http://localhost:7880

## 📁 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js 15 フロントエンド
│   │   ├── app/                # App Router
│   │   ├── components/         # Reactコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── package.json
│   └── api/                    # Node.js + Hono API
│       ├── src/
│       │   ├── routes/         # APIルート
│       │   ├── db/             # データベース設定
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型定義
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── terraform/                  # インフラ構成管理
├── docker-compose.yml
├── livekit.yaml
├── package.json                # ルート (Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, Tailwind CSS 4 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| ORM | Drizzle ORM |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |
| インフラ | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| パッケージマネージャー | pnpm |
| ビルドツール | Turborepo |
| Linter/Formatter | Biome |

## 📝 主要機能

### 1. 社内Wiki
- NotionライクなBlock-basedエディタ (TipTap)
- リアルタイム共同編集
- ページ階層構造
- フルテキスト検索

### 2. ビデオ会議ツール
- **Everybody Coworkingモード**: 全社員の顔がリアルタイム更新
- **Roomモード**: 会議ルーム作成・管理
- AI機能: 文字起こし、話者分離、議事録生成

### 3. 認証
- Google SSO (OAuth2 Proxy)
- 社内ドメイン制限 (@grand2-products.com)

## 🔧 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# リント
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format

# テスト
pnpm test

# 型チェック
pnpm typecheck

# クリーンアップ
pnpm clean

# Docker操作
pnpm docker:dev      # 起動
pnpm docker:down     # 停止
pnpm docker:logs     # ログ確認

# データベース操作
pnpm db:generate     # マイグレーション生成
pnpm db:migrate      # マイグレーション実行
pnpm db:push         # スキーマプッシュ
pnpm db:studio       # Drizzle Studio起動
```

## 🌍 環境変数

詳細は [`.env.example`](./.env.example) を参照してください。

### 必須環境変数

- `DATABASE_URL`: PostgreSQL接続URL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `GOOGLE_CLOUD_PROJECT`: GCPプロジェクトID
- `GCS_BUCKET`: Cloud Storage バケット名

## 🚢 デプロイ

### 本番環境へのデプロイ

1. **Terraformでインフラ構築**
```bash
cd terraform/environments/prod
terraform init
terraform apply
```

2. **Dockerイメージのビルド・プッシュ**
```bash
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT_ID/wiki-api:latest .
docker build -f apps/web/Dockerfile -t gcr.io/PROJECT_ID/wiki-web:latest .
docker push gcr.io/PROJECT_ID/wiki-api:latest
docker push gcr.io/PROJECT_ID/wiki-web:latest
```

3. **GCEでのデプロイ**
```bash
# SSHでGCEインスタンスに接続後
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 ドキュメント

- [企画概要](./plan/overview.md)
- [アーキテクチャ設計](./plan/architecture.md)
- [技術選定](./plan/tech-stack.md)
- [Wiki仕様](./plan/wiki.md)
- [通話ツール仕様](./plan/call-tool.md)
- [開発スケジュール](./plan/timeline.md)
- [コスト試算](./plan/cost.md)

## 📄 ライセンス

Private - grand2 Products

## 👥 開発チーム

grand2 Products

社内Wiki & ビデオ会議ツール - Monorepo開発環境

## 🚀 クイックスタート

### 前提条件

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker & Docker Compose
- (本番環境のみ) Google Cloud Platform アカウント

### セットアップ

1. **リポジトリのクローン**
```bash
git clone https://github.com/grand2-products/corp-internal.git
cd corp-internal
```

2. **依存関係のインストール**
```bash
pnpm install
```

3. **環境変数の設定**
```bash
cp .env.example .env
# .envファイルを編集して必要な値を設定
```

4. **Dockerコンテナの起動**
```bash
pnpm docker:dev
```

5. **データベースのマイグレーション**
```bash
pnpm db:push
```

6. **開発サーバーの起動**
```bash
pnpm dev
```

- フロントエンド: http://localhost:3000
- API: http://localhost:3001
- LiveKit: http://localhost:7880

## 📁 プロジェクト構成

```
corp-internal/
├── apps/
│   ├── web/                    # Next.js 15 フロントエンド
│   │   ├── app/                # App Router
│   │   ├── components/         # Reactコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── package.json
│   └── api/                    # Node.js + Hono API
│       ├── src/
│       │   ├── routes/         # APIルート
│       │   ├── db/             # データベース設定
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型定義
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── terraform/                  # インフラ構成管理
├── docker-compose.yml
├── livekit.yaml
├── package.json                # ルート (Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フロントエンド | Next.js 16, React 19, Tailwind CSS 4 |
| バックエンド | Node.js 22, Hono 4 |
| データベース | PostgreSQL 17 (Docker) |
| ORM | Drizzle ORM |
| WebRTC | LiveKit |
| 認証 | OAuth2 Proxy (Google SSO) |
| インフラ | GCP (Compute Engine, Cloud Storage) |
| IaC | Terraform |
| パッケージマネージャー | pnpm |
| ビルドツール | Turborepo |
| Linter/Formatter | Biome |

## 📝 主要機能

### 1. 社内Wiki
- NotionライクなBlock-basedエディタ (TipTap)
- リアルタイム共同編集
- ページ階層構造
- フルテキスト検索

### 2. ビデオ会議ツール
- **Everybody Coworkingモード**: 全社員の顔がリアルタイム更新
- **Roomモード**: 会議ルーム作成・管理
- AI機能: 文字起こし、話者分離、議事録生成

### 3. 認証
- Google SSO (OAuth2 Proxy)
- 社内ドメイン制限 (@grand2-products.com)

## 🔧 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# リント
pnpm lint
pnpm lint:fix

# フォーマット
pnpm format

# テスト
pnpm test

# 型チェック
pnpm typecheck

# クリーンアップ
pnpm clean

# Docker操作
pnpm docker:dev      # 起動
pnpm docker:down     # 停止
pnpm docker:logs     # ログ確認

# データベース操作
pnpm db:generate     # マイグレーション生成
pnpm db:migrate      # マイグレーション実行
pnpm db:push         # スキーマプッシュ
pnpm db:studio       # Drizzle Studio起動
```

## 🌍 環境変数

詳細は [`.env.example`](./.env.example) を参照してください。

### 必須環境変数

- `DATABASE_URL`: PostgreSQL接続URL
- `LIVEKIT_API_KEY`: LiveKit APIキー
- `LIVEKIT_API_SECRET`: LiveKit APIシークレット
- `GOOGLE_CLOUD_PROJECT`: GCPプロジェクトID
- `GCS_BUCKET`: Cloud Storage バケット名

## 🚢 デプロイ

### 本番環境へのデプロイ

1. **Terraformでインフラ構築**
```bash
cd terraform/environments/prod
terraform init
terraform apply
```

2. **Dockerイメージのビルド・プッシュ**
```bash
docker build -f apps/api/Dockerfile -t gcr.io/PROJECT_ID/wiki-api:latest .
docker build -f apps/web/Dockerfile -t gcr.io/PROJECT_ID/wiki-web:latest .
docker push gcr.io/PROJECT_ID/wiki-api:latest
docker push gcr.io/PROJECT_ID/wiki-web:latest
```

3. **GCEでのデプロイ**
```bash
# SSHでGCEインスタンスに接続後
docker-compose -f docker-compose.prod.yml up -d
```

## 📚 ドキュメント

- [企画概要](./plan/overview.md)
- [アーキテクチャ設計](./plan/architecture.md)
- [技術選定](./plan/tech-stack.md)
- [Wiki仕様](./plan/wiki.md)
- [通話ツール仕様](./plan/call-tool.md)
- [開発スケジュール](./plan/timeline.md)
- [コスト試算](./plan/cost.md)

## 📄 ライセンス

Private - grand2 Products

## 👥 開発チーム

grand2 Products


