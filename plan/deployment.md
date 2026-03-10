# デプロイ戦略

## 1. デプロイ概要

本ドキュメントでは、社内WikiアプリケーションのGCPへのデプロイ戦略を定義します。

### 1.1 デプロイ構成

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions (CI/CD)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│    Build      │    │   Terraform   │    │    Deploy     │
│  (Docker)     │───▶│   (Infra)     │───▶│    (SSH)      │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Container     │    │     GCE       │    │   Docker      │
│ Registry      │    │     GCS       │    │   Compose     │
│  (GCR)        │    │     VPC       │    │   up -d       │
└───────────────┘    └───────────────┘    └───────────────┘
```

## 2. 環境定義

### 2.1 環境一覧

| 環境 | 用途 | GCP Project | ドメイン |
|------|------|-------------|---------|
| dev | 開発・テスト | corp-internal-dev | wiki-dev.example.com |
| prod | 本番環境 | corp-internal-prod | wiki.example.com |

### 2.2 環境ごとのリソース

| リソース | dev | prod |
|---------|-----|------|
| GCE インスタンス | e2-medium | e2-standard-2 |
| ディスク | 50GB | 100GB |
| GCS バケット | corp-internal-files-dev | corp-internal-files-prod |

## 3. CI/CD パイプライン

### 3.1 GitHub Actions ワークフロー

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches:
      - main      # 本番デプロイ
      - develop   # 開発デプロイ
  pull_request:
    branches:
      - main

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: asia-northeast1
  ZONE: asia-northeast1-a

jobs:
  # テストジョブ
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Test
        run: pnpm test
      
      - name: Lint
        run: pnpm lint

  # Dockerビルドジョブ
  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Configure Docker
        run: gcloud auth configure-docker
      
      - name: Docker meta (web)
        id: meta-web
        uses: docker/metadata-action@v5
        with:
          images: gcr.io/${{ env.PROJECT_ID }}/wiki-web
          tags: |
            type=ref,event=branch
            type=sha,prefix=
      
      - name: Docker meta (api)
        id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: gcr.io/${{ env.PROJECT_ID }}/wiki-api
          tags: |
            type=ref,event=branch
            type=sha,prefix=
      
      - name: Build and push (web)
        uses: docker/build-push-action@v5
        with:
          context: ./apps/web
          push: true
          tags: ${{ steps.meta-web.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and push (api)
        uses: docker/build-push-action@v5
        with:
          context: ./apps/api
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Terraformジョブ
  terraform:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.5"
      
      - name: Determine environment
        id: env
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "env=prod" >> $GITHUB_OUTPUT
          else
            echo "env=dev" >> $GITHUB_OUTPUT
          fi
      
      - name: Terraform Init
        working-directory: terraform/environments/${{ steps.env.outputs.env }}
        run: terraform init
      
      - name: Terraform Plan
        working-directory: terraform/environments/${{ steps.env.outputs.env }}
        run: terraform plan -out=tfplan
      
      - name: Terraform Apply
        working-directory: terraform/environments/${{ steps.env.outputs.env }}
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
        run: terraform apply -auto-approve tfplan

  # デプロイジョブ
  deploy:
    needs: [build, terraform]
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Determine environment
        id: env
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "env=prod" >> $GITHUB_OUTPUT
            echo "instance=wiki-prod" >> $GITHUB_OUTPUT
          else
            echo "env=dev" >> $GITHUB_OUTPUT
            echo "instance=wiki-dev" >> $GITHUB_OUTPUT
          fi
      
      - name: Deploy to GCE
        uses: google-github-actions/ssh-compute@v1
        with:
          instance_name: ${{ steps.env.outputs.instance }}
          zone: ${{ env.ZONE }}
          ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
          command: |
            cd /opt/wiki
            
            # 環境変数設定
            export ENV=${{ steps.env.outputs.env }}
            export PROJECT_ID=${{ env.PROJECT_ID }}
            export IMAGE_TAG=$(echo ${{ github.sha }} | cut -c1-7)
            
            # イメージプル
            docker compose pull
            
            # コンテナ更新
            docker compose up -d --remove-orphans
            
            # 不要イメージ削除
            docker system prune -f
            
            # ヘルスチェック
            sleep 10
            curl -f http://localhost:3000/api/health || exit 1

  # ロールバックジョブ
  rollback:
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Rollback
        uses: google-github-actions/ssh-compute@v1
        with:
          instance_name: wiki-prod
          zone: ${{ env.ZONE }}
          ssh_private_key: ${{ secrets.SSH_PRIVATE_KEY }}
          command: |
            cd /opt/wiki
            
            # 前のバージョンに戻す
            docker compose down
            docker compose up -d --no-pull
```

## 4. 初回デプロイ手順

### 4.1 事前準備

```bash
# 1. GCPプロジェクト作成 (既存の場合はスキップ)
gcloud projects create corp-internal-prod

# 2. API有効化
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com

# 3. サービスアカウント作成
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# 4. 権限付与
gcloud projects add-iam-policy-binding corp-internal-prod \
  --member="serviceAccount:github-actions@corp-internal-prod.iam.gserviceaccount.com" \
  --role="roles/editor"

# 5. サービスアカウントキー作成
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@corp-internal-prod.iam.gserviceaccount.com

# 6. GitHub Secrets設定
# GCP_PROJECT_ID: corp-internal-prod
# GCP_SA_KEY: (key.jsonの内容)
# SSH_PRIVATE_KEY: (デプロイ用SSH秘密鍵)
```

### 4.2 Terraform 初回実行

```bash
# 1. Terraform初期化
cd terraform/environments/prod
terraform init

# 2. 確認
terraform plan

# 3. 適用
terraform apply
```

### 4.3 GCE 初期設定

```bash
# 1. SSH接続
gcloud compute ssh wiki-prod --zone=asia-northeast1-a

# 2. Docker インストール
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 3. Docker Compose インストール
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 4. ディレクトリ作成
sudo mkdir -p /opt/wiki
sudo chown $USER:$USER /opt/wiki

# 5. docker-compose.yml 配置
cd /opt/wiki
# docker-compose.yml を配置

# 6. 環境変数ファイル作成
cat > .env << EOF
PROJECT_ID=corp-internal-prod
ENV=prod
GCS_BUCKET=corp-internal-files-prod
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
COOKIE_SECRET=xxx
DB_PASSWORD=xxx
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
EOF
```

## 5. 運用手順

### 5.1 通常デプロイ

```bash
# main ブランチにマージで自動デプロイ
git push origin main
```

### 5.2 手動デプロイ

```bash
# GCEにSSH接続
gcloud compute ssh wiki-prod --zone=asia-northeast1-a

# 手動更新
cd /opt/wiki
docker compose pull
docker compose up -d
```

### 5.3 ロールバック

```bash
# GitHub Actions から rollback ワークフローを実行
# または手動で:

gcloud compute ssh wiki-prod --zone=asia-northeast1-a
cd /opt/wiki
docker compose down
docker compose up -d --no-pull
```

### 5.4 バックアップ

```bash
# PostgreSQL バックアップ
docker exec wiki-db-1 pg_dump -U wiki wiki > backup_$(date +%Y%m%d).sql

# GCSへアップロード
gsutil cp backup_*.sql gs://corp-internal-backup/postgresql/
```

## 6. 監視・アラート

### 6.1 Cloud Monitoring

```hcl
# terraform/modules/monitoring/main.tf

resource "google_monitoring_alert_policy" "cpu" {
  display_name = "High CPU Usage"
  project      = var.project_id
  
  conditions {
    display_name = "CPU utilization > 80%"
    condition_threshold {
      filter          = "resource.type = \"gce_instance\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Email Notification"
  type         = "email"
  
  labels = {
    email_address = "admin@grand2-products.com"
  }
}
```

### 6.2 ヘルスチェック

```yaml
# docker-compose.yml に追加
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## 7. セキュリティ

### 7.1 Secret Manager

```hcl
# Terraform で Secret Manager 設定
resource "google_secret_manager_secret" "db_password" {
  secret_id = "wiki-db-password"
  
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}
```

### 7.2 GCE での Secret 取得

```bash
# Secret Manager から値を取得
gcloud secrets versions access latest --secret="wiki-db-password"
```

## 8. トラブルシューティング

### 8.1 よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| コンテナが起動しない | イメージプル失敗 | `docker compose pull` |
| Let's Encrypt 失敗 | DNS設定 | ドメイン確認 |
| DB接続エラー | パスワード/ネットワーク | `.env` 確認 |
| メモリ不足 | リソース不足 | スケールアップ |

### 8.2 ログ確認

```bash
# Docker ログ
docker compose logs -f

# 特定サービス
docker compose logs -f api

# Traefik ログ
docker compose logs -f traefik
```

### 8.3 リソース確認

```bash
# コンテナ状態
docker compose ps

# リソース使用量
docker stats

# ディスク使用量
df -h
```
