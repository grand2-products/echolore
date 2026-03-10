# アーキテクチャ設計

## 1. 全体アーキテクチャ

### 1.1 実装差分注記（2026-03-10）
- 本章の図はターゲット構成（To-Be）。現状はローカル開発向けの最小構成が先行。
- `apps/api/src/index.ts` で `/api/wiki` `/api/meetings` `/api/users` `/api/files` `/api/livekit` `/api/admin` を接続済み。
- Terraform構成（`terraform/`）およびOAuth2 Proxy/Traefikの本番相当運用は、計画記載に対して未実装。
- AIパイプライン（Speech-to-Text / Vertex AI / LiveKit Egress連携）は未実装。

```
┌─────────────────────────────────────────────────────────────────┐
│                        Users (社員)                              │
│                    Google Account Holder                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Google Cloud Platform (GCP)                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Compute Engine (GCE)                        │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           Docker Compose + Traefik               │    │    │
│  │  │                                                  │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐               │    │    │
│  │  │  │   Traefik   │  │ OAuth2 Proxy│               │    │    │
│  │  │  │ (Let's      │  │ (Google SSO)│               │    │    │
│  │  │  │  Encrypt)   │  │             │               │    │    │
│  │  │  └──────┬──────┘  └─────────────┘               │    │    │
│  │  │         │                                        │    │    │
│  │  │  ┌──────▼──────┐  ┌─────────────┐               │    │    │
│  │  │  │  Next.js    │  │ Node.js API │               │    │    │
│  │  │  │ (Frontend)  │  │   (Hono)    │               │    │    │
│  │  │  └─────────────┘  └──────┬──────┘               │    │    │
│  │  │                          │                       │    │    │
│  │  │  ┌─────────────┐  ┌──────▼──────┐               │    │    │
│  │  │  │ PostgreSQL  │  │   LiveKit   │               │    │    │
│  │  │  │  (Docker)   │  │  (WebRTC)   │               │    │    │
│  │  │  └─────────────┘  └─────────────┘               │    │    │
│  │  │                                                  │    │    │
│  │  └──────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │              Cloud Storage (GCS)                         │    │
│  │         • 画像ファイル                                   │    │
│  │         • 添付ファイル                                   │    │
│  │         • アイコン等                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              Terraform (IaC)                             │     │
│  │         • GCE インスタンス管理                            │     │
│  │         • GCS バケット管理                                │     │
│  │         • VPC / Firewall 管理                             │     │
│  └─────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## 2. コンポーネント詳細

### 2.1 Terraform (インフラ構成管理)

**ディレクトリ構成:**
```
terraform/
├── main.tf              # プロバイダー設定
├── variables.tf         # 変数定義
├── outputs.tf           # 出力定義
├── modules/
│   ├── compute/         # Compute Engine
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── storage/         # Cloud Storage
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── network/         # VPC/Firewall
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── dev/
    │   ├── terraform.tfvars
    │   └── backend.tf
    └── prod/
        ├── terraform.tfvars
        └── backend.tf
```

**main.tf例:**
```hcl
# terraform/main.tf
terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "corp-internal-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# VPC / Firewall
module "network" {
  source     = "./modules/network"
  project_id = var.project_id
  region     = var.region
  env        = var.env
}

# Compute Engine
module "compute" {
  source     = "./modules/compute"
  project_id = var.project_id
  region     = var.region
  zone       = var.zone
  network    = module.network.vpc_id
  subnetwork = module.network.subnet_id
  env        = var.env
}

# Cloud Storage
module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
  region     = var.region
  env        = var.env
}
```

**Compute Engine モジュール例:**
```hcl
# terraform/modules/compute/main.tf
resource "google_compute_instance" "wiki" {
  name         = "wiki-${var.env}"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["wiki", "traefik", "http", "https", var.env]

  boot_disk {
    initialize_params {
      image = "ubuntu-2204-lts"
      size  = 100
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = var.subnetwork
    access_config {
      // Ephemeral IP (または static IP)
    }
  }

  metadata = {
    ssh-keys = var.ssh_keys
  }

  service_account {
    email  = google_service_account.wiki.email
    scopes = ["cloud-platform"]
  }
}

resource "google_service_account" "wiki" {
  account_id   = "wiki-${var.env}"
  display_name = "Wiki Service Account"
}

# GCS アクセス権限
resource "google_project_iam_member" "wiki_gcs" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.wiki.email}"
}
```

**Network モジュール例:**
```hcl
# terraform/modules/network/main.tf
resource "google_compute_network" "vpc" {
  name                    = "wiki-vpc-${var.env}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "wiki-subnet-${var.env}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_firewall" "http" {
  name    = "wiki-http-${var.env}"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http", "https"]
}

resource "google_compute_firewall" "ssh" {
  name    = "wiki-ssh-${var.env}"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]  # 必要に応じて制限
  target_tags   = ["ssh"]
}
```

**Storage モジュール例:**
```hcl
# terraform/modules/storage/main.tf
resource "google_storage_bucket" "files" {
  name          = "corp-internal-files-${var.env}"
  location      = var.region
  force_destroy = var.env != "prod"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}
```

### 2.2 Docker Compose (GCE上)

**docker-compose.yml:**
```yaml
# docker-compose.yml
version: "3.8"

services:
  # リバースプロキシ (Let's Encrypt自動取得)
  traefik:
    image: traefik:v3.3
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@grand2-products.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/etc/traefik/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik/acme.json:/etc/traefik/acme.json
    labels:
      - "traefik.enable=true"

  # 認証 (OAuth2 Proxy)
  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:v7.7.x
    environment:
      - OAUTH2_PROXY_PROVIDER=google
      - OAUTH2_PROXY_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - OAUTH2_PROXY_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - OAUTH2_PROXY_EMAIL_DOMAINS=grand2-products.com
      - OAUTH2_PROXY_COOKIE_SECRET=${COOKIE_SECRET}
      - OAUTH2_PROXY_REDIRECT_URL=https://wiki.example.com/oauth2/callback
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.oauth.rule=Host(`wiki.example.com`) && PathPrefix(`/oauth2`)"
      - "traefik.http.routers.oauth.entrypoints=websecure"
      - "traefik.http.routers.oauth.tls.certresolver=letsencrypt"

  # フロントエンド (Next.js)
  web:
    image: gcr.io/${PROJECT_ID}/wiki-web:${ENV:-latest}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`wiki.example.com`)"
      - "traefik.http.routers.web.entrypoints=websecure"
      - "traefik.http.routers.web.tls.certresolver=letsencrypt"
      - "traefik.http.routers.web.middlewares=oauth-auth"
    environment:
      - NEXT_PUBLIC_API_URL=http://api:3001
    depends_on:
      - api
      - oauth2-proxy

  # API サーバー
  api:
    image: gcr.io/${PROJECT_ID}/wiki-api:${ENV:-latest}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`wiki.example.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
    environment:
      - DATABASE_URL=postgresql://wiki:${DB_PASSWORD}@db:5432/wiki
      - GCS_BUCKET=${GCS_BUCKET}
      - GOOGLE_CLOUD_PROJECT=${PROJECT_ID}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
    depends_on:
      - db

  # データベース (PostgreSQL)
  db:
    image: postgres:17-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=wiki
      - POSTGRES_USER=wiki
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wiki"]
      interval: 10s
      timeout: 5s
      retries: 5

  # WebRTC (LiveKit)
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
    ports:
      - "7880:7880"
      - "50000-50200:50000-50200/udp"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.livekit.rule=Host(`meet.wiki.example.com`)"
      - "traefik.http.routers.livekit.entrypoints=websecure"
      - "traefik.http.routers.livekit.tls.certresolver=letsencrypt"

  # Redis (LiveKit用)
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 2.3 Cloud Storage (GCS)

**バケット構成:**
```
corp-internal-files-{env}/
├── images/
│   ├── avatars/
│   └── wiki/
└── attachments/
```

**アクセス方法:**
- API から GCS Client Library 経由でアクセス
- サービスアカウントで認証

**API側の実装例:**
```typescript
// apps/api/src/storage/gcs.ts
import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

export async function uploadFile(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const file = bucket.file(filename);
  await file.save(buffer, { contentType });
  return `gs://${process.env.GCS_BUCKET}/${filename}`;
}

export async function getFile(filename: string): Promise<Buffer> {
  const [buffer] = await bucket.file(filename).download();
  return buffer;
}

export function getPublicUrl(filename: string): string {
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${filename}`;
}
```

### 2.4 データベーススキーマ (PostgreSQL)

```sql
-- ユーザー
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT DEFAULT 'member', -- admin, member
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wikiページ
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    parent_id TEXT REFERENCES pages(id),
    author_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ブロック (Notionライク)
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- text, heading1, heading2, image, file, etc.
    content TEXT, -- JSON or plain text
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ミーティング
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    creator_id TEXT REFERENCES users(id),
    room_name TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'scheduled', -- scheduled, active, ended
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ファイル
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    gcs_path TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_sort ON blocks(page_id, sort_order);

-- 全文検索 (PostgreSQL)
CREATE INDEX idx_pages_title_search ON pages USING gin(to_tsvector('japanese', title));
CREATE INDEX idx_blocks_content_search ON blocks USING gin(to_tsvector('japanese', content));
```

### 2.5 Next.js 14 (フロントエンド層)

**ページ構成:**
```
app/
├── (auth)/
│   └── login/
│       └── page.tsx          # ログインページ
├── (main)/
│   ├── page.tsx              # ホーム（Wiki一覧）
│   ├── wiki/
│   │   ├── [id]/
│   │   │   └── page.tsx      # Wikiページ表示
│   │   └── new/
│   │       └── page.tsx      # 新規作成
│   ├── meetings/
│   │   ├── page.tsx          # ミーティング一覧
│   │   └── [id]/
│   │       └── page.tsx      # ビデオ会議ルーム
│   └── search/
│       └── page.tsx          # 検索ページ
├── api/
│   ├── pages/
│   │   └── route.ts          # Wiki CRUD API
│   ├── meetings/
│   │   └── route.ts          # Meeting API
│   └── search/
│       └── route.ts          # 検索API
└── layout.tsx
```

### 2.6 Node.js API (Hono)

> 実装差分（2026-03-10）
> - 企画時の `/api/pages` `/api/blocks` ではなく、実装は `/api/wiki` 配下（ページ＋ブロック）に集約。
> - `/api/upload` は実装上 `/api/files` として提供。
> - 追加で `/api/users` `/api/livekit` `/api/admin` を提供。

**APIエンドポイント:**

```
/api
├── /pages
│   ├── GET    /              # ページ一覧
│   ├── POST   /              # ページ作成
│   ├── GET    /:id           # ページ取得
│   ├── PUT    /:id           # ページ更新
│   ├── DELETE /:id           # ページ削除
│   └── GET    /:id/blocks    # ブロック一覧
├── /blocks
│   ├── POST   /              # ブロック作成
│   ├── PUT    /:id           # ブロック更新
│   └── DELETE /:id           # ブロック削除
├── /meetings
│   ├── GET    /              # ミーティング一覧
│   ├── POST   /              # ミーティング作成
│   ├── GET    /:id           # ミーティング取得
│   └── DELETE /:id           # ミーティング削除
├── /search
│   └── GET    /?q=:query     # フルテキスト検索
└── /upload
    └── POST   /              # ファイルアップロード (GCS)
```

## 3. CI/CD パイプライン

```yaml
# .github/workflows/deploy.yml
name: Deploy to GCP

on:
  push:
    branches: [main]

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: asia-northeast1
  ZONE: asia-northeast1-a

jobs:
  test:
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

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: |
          gcloud auth configure-docker
          docker build -t gcr.io/$PROJECT_ID/wiki-web:latest ./apps/web
          docker build -t gcr.io/$PROJECT_ID/wiki-api:latest ./apps/api
          docker push gcr.io/$PROJECT_ID/wiki-web:latest
          docker push gcr.io/$PROJECT_ID/wiki-api:latest

  terraform:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.5"
      - run: |
          cd terraform/environments/prod
          terraform init
          terraform plan -out=tfplan
          terraform apply -auto-approve tfplan

  deploy:
    needs: terraform
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - uses: google-github-actions/ssh-compute@v1
        with:
          instance_name: wiki-prod
          zone: asia-northeast1-a
          ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
          command: |
            cd /opt/wiki &&
            docker compose pull &&
            docker compose up -d &&
            docker system prune -f
```

## 4. セキュリティ設計

### 4.1 認証・認可

| 層 | 手法 |
|----|------|
| ネットワーク | OAuth2 Proxy (Google SSO) |
| API | JWT検証 (API内) |
| データベース | PostgreSQL (コンテナ内、外部アクセス不可) |
| ストレージ | GCS (サービスアカウント認証) |

### 4.2 データ保護

- 通信: 全トラフィックHTTPS (Let's Encrypt)
- DB: PostgreSQL 暗号化（ディスク暗号化）
- ストレージ: GCS 暗号化（デフォルト）
- VPC: プライベートネットワーク

### 4.3 監査

- Cloud Logging (GCEログ)
- Docker ログ
- Traefik Access Log

## 5. バックアップ戦略

### 5.1 PostgreSQL バックアップ

```bash
# 日次バックアップ (cron)
0 2 * * * docker exec wiki-db-1 pg_dump -U wiki wiki > /backup/wiki_$(date +\%Y\%m\%d).sql

# GCS へアップロード
gsutil cp /backup/wiki_*.sql gs://corp-internal-backup/postgresql/
```

### 5.2 バックアップ保持

- 日次: 7日間
- 週次: 4週間
- 月次: 12ヶ月

## 6. ディレクトリ構造

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
│       │   └── index.ts
│       └── package.json
├── packages/
│   ├── shared/                 # 共有型・ユーティリティ
│   └── ui/                     # 共有UIコンポーネント
├── plan/                       # 企画ドキュメント
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json                # ルート (Turborepo)
├── turbo.json
└── pnpm-workspace.yaml
```
