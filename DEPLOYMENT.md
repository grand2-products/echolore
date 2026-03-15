# デプロイメントガイド

corp-internal を本番環境（VPS）にデプロイするための手順書です。

## 前提条件

### サーバー要件
- OS: Debian 12 / Ubuntu 22.04 以降（Linux）
- メモリ: 4GB 以上（録画・AI 機能を使う場合は 8GB 推奨）
- ストレージ: 20GB 以上
- ポート開放: 80, 443, 3478/udp, 5349/tcp（TURN）, 50000-50020/udp（LiveKit RTC メディア用）

### 外部サービス
- ドメイン名（DNS の A レコードをサーバー IP に設定済み）
- GitHub アカウント（コンテナイメージの push/pull 用）

### オプション（デプロイ後に管理画面から設定）
- Google Cloud Console プロジェクト（Google SSO 用 OAuth クライアント ID/シークレット）
- LLM プロバイダ（Gemini / Vertex AI / Z.ai — AI 要約・エージェント機能用）
- メールプロバイダ（SMTP / Resend — メール送信用）
- ストレージプロバイダ（S3 互換 / GCS — ファイルストレージをクラウドに置く場合）

---

## 1. サーバー初期セットアップ

ローカルから vps-init.sh を実行します。Docker のインストール、deploy ユーザー作成、systemd サービス登録が自動で行われます。

```bash
ssh root@<サーバーIP> 'bash -s' < scripts/setup/vps-init.sh
```

完了すると以下が設定されます:
- Docker CE + Compose プラグイン
- `deploy` ユーザー（docker グループ所属）
- ランタイムディレクトリ `/opt/wiki`
- systemd サービス（サーバー再起動時に自動復旧）

---

## 2. GitHub リポジトリの設定

### GitHub Secrets の登録

リポジトリの Settings > Secrets and variables > Actions に以下を設定します。

| Secret 名 | 説明 |
|---|---|
| `DEPLOY_SSH_KEY` | deploy ユーザーの SSH 秘密鍵 |
| `DEPLOY_KNOWN_HOSTS` | サーバーの known_hosts エントリ（`ssh-keyscan <サーバーIP>` で取得） |
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

### コンテナレジストリの公開設定

GitHub Container Registry（GHCR）を使って Docker イメージを配信します。
GHCR は GitHub が提供するコンテナレジストリで、リポジトリの権限管理をそのまま利用できます。

リポジトリの Settings > Actions > General で、Workflow permissions を **Read and write permissions** に設定します。これにより GitHub Actions がビルドしたイメージを GHCR に push できるようになります。

---

## 3. 環境変数の準備

`RUNTIME_ENV_DEV` / `RUNTIME_ENV_PROD` に設定する `.env` の内容です。

> **重要**: `DB_PASSWORD`、`AUTH_SECRET`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET` は全て本番用に強力なランダム値を使用してください。サンプル値をそのまま使わないでください。
>
> ランダム値の生成例:
> - Linux / macOS: `openssl rand -base64 48`
> - Windows (PowerShell): `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }) -as [byte[]])`
>
> `AUTH_SECRET` は dev 環境と prod 環境で**異なる値**を使用してください。

```env
# === 必須 ===
DOMAIN=your-domain.com
ACME_EMAIL=admin@your-domain.com
DB_PASSWORD=<強力なランダムパスワード>
AUTH_SECRET=<64文字以上のランダム文字列>
CORS_ORIGIN=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-domain.com

# LiveKit（リアルタイム通信基盤）
# API キー / シークレットは任意のランダム文字列を自分で決めてください
# （外部サービスではなく、同じサーバー内の LiveKit コンテナが使用します）
LIVEKIT_HOST=http://livekit:7880
LIVEKIT_API_KEY=<任意のランダム文字列>
LIVEKIT_API_SECRET=<任意のランダム文字列>

# TURN サーバー（企業ネットワーク等で UDP が使えない場合のフォールバック）
# DOMAIN と同じ値、またはサブドメイン（例: turn.your-domain.com）を設定
# 設定するドメインの DNS A レコードがサーバー IP を指している必要があります
LIVEKIT_TURN_DOMAIN=your-domain.com
LIVEKIT_TURN_TLS_PORT=5349

# コンテナレジストリ認証（プライベートリポジトリの場合のみ必要）
# パブリックリポジトリの場合は不要です
# GHCR_USER=<GitHub ユーザー名>
# GHCR_TOKEN=<GitHub Personal Access Token（read:packages スコープ）>

# リリースワークフローが自動設定する値（手動設定不要）
# API_IMAGE, WEB_IMAGE, RELEASE_SHA はデプロイ時に自動注入されます

# === オプション ===

# アプリ表示名（管理画面からも変更可能）
# APP_TITLE=corp-internal
# NEXT_PUBLIC_APP_TITLE=corp-internal
```

> **管理画面から設定する項目**: 以下はデプロイ後に `https://your-domain.com/admin/settings` から設定します（環境変数では設定しません）:
> - Google SSO（OAuth クライアント ID/シークレット）、許可ドメイン
> - LLM プロバイダ（Gemini API キー、Vertex AI、Z.ai）
> - メールプロバイダ（SMTP / Resend）
> - ストレージプロバイダ（S3 互換 / GCS）

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
ssh deploy@<サーバーIP>
cd /opt/wiki
docker compose ps              # 全コンテナが running であること
curl http://localhost:3001/health   # {"status":"ok"} が返ること
```

---

## 5. 初期ユーザー登録（ゼロユーザーブートストラップ）

デプロイ直後はユーザーが存在しないため、最初のユーザー登録のみ開放されています。

1. ブラウザで `https://your-domain.com/login` にアクセス
2. **メールアドレス + パスワード** で登録する
   - 初回はメールプロバイダが未設定のため、メール認証リンクは不要（自動でメール認証済みになります）
   - Google SSO はこの時点では使用できません（管理画面での設定が必要なため）
3. **最初に登録したユーザーが自動的に管理者（admin）に昇格**
4. 以降の自己登録は自動的に閉鎖されます
5. 追加ユーザーは管理画面（`/admin/users`）から管理者が招待・追加します

---

## 6. 管理画面での初期設定

`https://your-domain.com/admin/settings` から以下を設定できます。

### サイト設定
- サイトタイトル・タグライン
- サイトアイコン（ファビコン）

### 認証設定
- Google SSO（OAuth クライアント ID/シークレット）
- 許可ドメイン（自己登録を許可するメールドメイン）
- パスワード認証の有効/無効

### メールプロバイダ
- なし（コンソール出力）/ SMTP / Resend から選択

### LLM プロバイダ
- Google Gemini（API キー）/ Vertex AI / Z.ai から選択
- Embedding モデル設定
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

DB マイグレーションはリリース時に自動実行されます。

### ロールバック

GitHub Actions > App Rollback から実行します。

過去のイメージタグは GitHub リポジトリの Packages ページ、または Actions の過去のリリースログから確認できます。

必要な入力:
- 環境（dev / prod）
- ロールバック先の API イメージタグ
- ロールバック先の Web イメージタグ
- コミット SHA

### ブレークグラス復旧

GitHub Actions が使えない緊急時:

```bash
ssh deploy@<サーバーIP>
cd /opt/wiki
cp .env.previous .env          # 前回のデプロイ状態に戻す
docker compose pull
docker compose up -d --remove-orphans
curl http://localhost:3001/health
```

### ログ確認

```bash
ssh deploy@<サーバーIP>
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
LiveKit ──→ UDP 50000-50020 (RTC メディア)
```

### コンテナ一覧

| コンテナ | イメージ | 役割 |
|---|---|---|
| traefik | `traefik:v3.3` | リバースプロキシ、TLS 終端 |
| db | `pgvector/pgvector:pg17` | データベース（pgvector 拡張付き） |
| valkey | `valkey/valkey:8-alpine` | LiveKit 用キャッシュ/ブローカー |
| livekit | `livekit/livekit-server` | リアルタイム会議基盤 |
| livekit-egress | `livekit/egress` | 会議録画エンジン |
| api | GHCR (Hono) | バックエンド API |
| web | GHCR (Next.js) | フロントエンド |
| worker | GHCR (Node.js) | AI エージェント・バックグラウンドワーカー |

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
- UDP 50000-50020 がファイアウォールで開放されているか確認
- `NEXT_PUBLIC_LIVEKIT_URL` が `wss://your-domain.com` になっているか確認

### 認証エラー（401）
- `AUTH_SECRET` が設定されているか確認
- Google SSO: 管理画面で OAuth クライアント ID/シークレットが正しく設定されているか確認
- 管理画面の許可ドメイン設定がユーザーのメールドメインと一致しているか確認

---

## 関連ドキュメント

- `DEVELOPMENT.md` — ローカル開発ガイド
- `docs/release-workflows.md` — リリースワークフロー詳細
- `docs/ops-runbook.md` — 運用手順書
- `docs/system-architecture.md` — システムアーキテクチャ
