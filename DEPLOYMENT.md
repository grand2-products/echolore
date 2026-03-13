# デプロイメントガイド

corp-internal を本番環境（VPS）にデプロイするための手順書です。

## 前提条件

### サーバー要件
- OS: Debian 12 / Ubuntu 22.04 以降（Linux）
- メモリ: 2GB 以上推奨
- ストレージ: 20GB 以上
- ポート開放: 80, 443, 50000-50200/udp（LiveKit RTC メディア用）

### 外部サービス
- ドメイン名（DNS の A レコードをサーバー IP に設定済み）
- GitHub アカウント（GHCR へのイメージ push/pull 用）
- Google Cloud Console プロジェクト（Google SSO 用 OAuth クライアント ID/シークレット）

### オプション
- Gemini API キー（AI 要約・エージェント機能用）
- SMTP サーバーまたは Resend API キー（メール送信用）
- S3 互換ストレージまたは GCS（ファイルストレージをクラウドに置く場合）

---

## 1. サーバー初期セットアップ

ローカルから vps-init.sh を実行します。Docker のインストール、deploy ユーザー作成、systemd サービス登録が自動で行われます。

```bash
ssh root@your-vps 'bash -s' < scripts/setup/vps-init.sh
```

完了すると以下が設定されます:
- Docker CE + Compose プラグイン
- `deploy` ユーザー（docker グループ所属）
- ランタイムディレクトリ `/opt/wiki`
- systemd サービス `corp-internal.service`（再起動時に自動復旧）

---

## 2. GitHub リポジトリの設定

### GitHub Secrets の登録

リポジトリの Settings > Secrets and variables > Actions に以下を設定します。

| Secret 名 | 説明 |
|---|---|
| `DEPLOY_SSH_KEY` | deploy ユーザーの SSH 秘密鍵 |
| `DEPLOY_KNOWN_HOSTS` | サーバーの known_hosts エントリ（`ssh-keyscan your-vps` で取得） |
| `DEPLOY_HOST_DEV` | dev 環境のホスト名または IP |
| `DEPLOY_HOST_PROD` | prod 環境のホスト名または IP |
| `DEPLOY_USER_DEV` | dev 環境の SSH ユーザー（通常 `deploy`） |
| `DEPLOY_USER_PROD` | prod 環境の SSH ユーザー（通常 `deploy`） |
| `RUNTIME_ENV_DEV` | dev 環境の `.env` ファイル内容（後述） |
| `RUNTIME_ENV_PROD` | prod 環境の `.env` ファイル内容（後述） |

### SSH 鍵の作成例

```bash
ssh-keygen -t ed25519 -C "deploy@corp-internal" -f deploy_key
# deploy_key     → DEPLOY_SSH_KEY に設定
# deploy_key.pub → サーバーの /home/deploy/.ssh/authorized_keys に追記
```

### GHCR のパッケージ公開設定

リポジトリの Settings > Actions > General で、Workflow permissions を **Read and write permissions** に設定します。これにより GitHub Actions が GHCR にイメージを push できます。

---

## 3. 環境変数の準備

`RUNTIME_ENV_DEV` / `RUNTIME_ENV_PROD` に設定する `.env` の内容です。

```env
# === 必須 ===
DOMAIN=your-domain.com
ACME_EMAIL=admin@your-domain.com
DB_PASSWORD=<強力なパスワード>
AUTH_SECRET=<64文字以上のランダム文字列>
AUTH_ALLOWED_DOMAIN=your-domain.com
CORS_ORIGIN=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-domain.com

# Google SSO
GOOGLE_CLIENT_ID=<OAuth クライアント ID>
GOOGLE_CLIENT_SECRET=<OAuth クライアントシークレット>

# LiveKit
LIVEKIT_HOST=http://livekit:7880
LIVEKIT_API_KEY=<LiveKit API キー>
LIVEKIT_API_SECRET=<LiveKit API シークレット>

# GHCR 認証（プライベートリポジトリの場合）
GHCR_USER=<GitHub ユーザー名>
GHCR_TOKEN=<GitHub PAT（read:packages スコープ）>

# リリースワークフローが自動注入する値（手動設定不要）
# API_IMAGE=ghcr.io/grand2-products/corp-internal/api:<sha>
# WEB_IMAGE=ghcr.io/grand2-products/corp-internal/web:<sha>
# RELEASE_SHA=<commit sha>

# === オプション ===

# AI 機能（会議要約・エージェント）
GEMINI_API_KEY=<Gemini API キー>
# または Vertex AI
# TEXT_GENERATION_PROVIDER=vertex
# VERTEX_PROJECT=<GCP プロジェクト ID>
# VERTEX_LOCATION=asia-northeast1

# メール送信
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_SECURE=true
# SMTP_USER=<ユーザー名>
# SMTP_PASS=<パスワード>
# SMTP_FROM=noreply@your-domain.com
# または Resend
# RESEND_API_KEY=<Resend API キー>
# RESEND_FROM=noreply@your-domain.com

# モバイル Google 認証
# GOOGLE_IOS_CLIENT_ID=
# GOOGLE_ANDROID_CLIENT_ID=

# アプリ表示名
# APP_TITLE=corp-internal
# NEXT_PUBLIC_APP_TITLE=corp-internal
```

> **注意**: `AUTH_SECRET` は `openssl rand -base64 48` などで生成してください。dev と prod で異なる値を使用してください。

---

## 4. 初回デプロイ

### 自動デプロイ（推奨）

`main` ブランチへのマージで CI → App Release が自動実行されます。

1. `main` にマージ
2. GitHub Actions の CI ワークフローが成功
3. App Release ワークフローが自動トリガー
4. dev 環境にデプロイ → 成功後、prod 環境にデプロイ

### 手動デプロイ

GitHub Actions > App Release > Run workflow から手動実行も可能です。

### デプロイの確認

```bash
ssh deploy@your-vps
cd /opt/wiki
docker compose ps              # 全コンテナが running であること
curl http://localhost:3001/health   # {"status":"ok"} が返ること
```

---

## 5. 初期ユーザー登録（ゼロユーザーブートストラップ）

デプロイ直後は `users` テーブルが空のため、登録が開放されています。

1. ブラウザで `https://your-domain.com/login` にアクセス
2. **Google SSO** または **メールアドレス + パスワード** で登録
   - パスワード登録の場合、メール認証リンクが必要（メール未設定時は API ログに出力）
3. **最初に登録したユーザーが自動的に `admin` に昇格**
4. 以降の自己登録は自動的に閉鎖
5. 追加ユーザーは管理画面（/admin/users）から admin が追加

---

## 6. 管理画面での初期設定

`https://your-domain.com/admin/settings` から以下を設定できます。

### サイト設定
- サイトタイトル・タグライン
- サイトアイコン（ファビコン）

### メールプロバイダ
- なし（コンソール出力）/ SMTP / Resend から選択
- 環境変数での設定に加えて、管理画面から動的に変更可能

### LLM プロバイダ
- Google Gemini（API キー）/ Vertex AI / Z.ai から選択
- 接続テスト機能付き

### ストレージプロバイダ
- **ローカルファイルシステム**（デフォルト、Docker ボリューム）
- **S3 互換**（AWS S3 / MinIO / Cloudflare R2 等）
- **Google Cloud Storage**
- 接続テスト機能付き
- 変更は新しいアップロードに適用（既存ファイルは自動移行されない）

### 映像品質設定
- 会議 / コワーキングそれぞれの Simulcast / Dynacast / Adaptive Stream

---

## 7. 運用

### 通常リリース

`main` へのマージで自動デプロイされます。手動操作は不要です。

DB マイグレーションはリリース時に自動実行されます（drizzle-orm プログラマティックマイグレーター）。

### ロールバック

GitHub Actions > App Rollback から実行します。

必要な入力:
- 環境（dev / prod）
- ロールバック先の `API_IMAGE`（例: `ghcr.io/grand2-products/corp-internal/api:abc1234`）
- ロールバック先の `WEB_IMAGE`
- `RELEASE_SHA`

### ブレークグラス復旧

ワークフローが使えない緊急時:

```bash
ssh deploy@your-vps
cd /opt/wiki
cp .env.previous .env          # 前回のデプロイ状態に戻す
docker compose pull
docker compose up -d --remove-orphans
curl http://localhost:3001/health
```

### ログ確認

```bash
ssh deploy@your-vps
cd /opt/wiki
docker compose logs --tail=200 api
docker compose logs --tail=200 web
docker compose logs --tail=200 traefik
docker compose logs --tail=200 db
```

### ヘルスチェック

```bash
# API
curl http://localhost:3001/health

# Web
docker compose exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000

# 全コンテナ
docker compose ps
```

---

## 8. アーキテクチャ概要

```
┌─────────────┐
│   Browser    │
└──────┬──────┘
       │ HTTPS (443)
┌──────▼──────┐
│   Traefik   │─── Let's Encrypt 自動 TLS
└──┬───┬───┬──┘
   │   │   │
   │   │   └──── /rtc/* ──→ LiveKit (:7880)
   │   │
   │   └──────── /api/* ──→ API (:3001)
   │
   └──────────── /*     ──→ Web (:3000)

API ──→ PostgreSQL (:5432)
API ──→ File Storage (Local / S3 / GCS)
LiveKit ──→ Valkey (:6379)
LiveKit ──→ UDP 50000-50200 (RTC メディア)
```

### コンテナ一覧

| コンテナ | イメージ | 役割 |
|---|---|---|
| traefik | `traefik:v3.3` | リバースプロキシ、TLS 終端 |
| db | `postgres:17-alpine` | データベース |
| valkey | `valkey/valkey:8-alpine` | LiveKit 用キャッシュ/ブローカー |
| livekit | `livekit/livekit-server` | リアルタイム会議基盤 |
| api | GHCR (Hono) | バックエンド API |
| web | GHCR (Next.js) | フロントエンド |

---

## 9. トラブルシューティング

### API が起動しない
- `docker compose logs api` でエラー確認
- `DATABASE_URL` が正しいか確認
- DB が healthy か確認: `docker compose exec -T db pg_isready -U wiki -d wiki`

### TLS 証明書が取得できない
- ドメインの DNS A レコードがサーバー IP を指しているか確認
- ポート 80 が開放されているか確認（ACME HTTP チャレンジに必要）
- `docker compose logs traefik` で証明書エラーを確認

### ファイルアップロードが失敗する
- ストレージプロバイダが正しく設定されているか管理画面で確認
- ローカルストレージの場合: `FILE_STORAGE_PATH` が書き込み可能か確認
- S3/GCS の場合: 管理画面の「接続テスト」で疎通確認

### LiveKit に接続できない
- UDP 50000-50200 がファイアウォールで開放されているか確認
- `NEXT_PUBLIC_LIVEKIT_URL` が `wss://your-domain.com` になっているか確認

### 認証エラー（401）
- `AUTH_SECRET` が設定されているか確認
- Google SSO: `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が正しいか確認
- `AUTH_ALLOWED_DOMAIN` がユーザーのメールドメインと一致しているか確認

---

## 関連ドキュメント

- `DEVELOPMENT.md` — ローカル開発ガイド
- `AGENTS.md` — リポジトリ全体のルール
- `docs/release-workflows.md` — リリースワークフロー詳細
- `docs/ops-runbook.md` — 運用手順書（英語）
- `docs/system-architecture.md` — システムアーキテクチャ
