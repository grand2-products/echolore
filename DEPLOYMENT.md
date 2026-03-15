# EchoLore デプロイメントガイド

EchoLore をサーバーにデプロイするための手順書です。

## 前提条件

### サーバー要件
- OS: Debian 12 / Ubuntu 22.04 以降（Linux）
- メモリ: 4GB 以上（録画・AI 機能を使う場合は 8GB 推奨）
- ストレージ: 20GB 以上
- ポート開放: 80, 443, 3478/udp, 5349/tcp（TURN）, 50000-50020/udp（LiveKit RTC メディア用）

### 外部サービス
- ドメイン名（DNS の A レコードをサーバー IP に設定済み）

### オプション（デプロイ後に管理画面から設定）
- Google Cloud Console プロジェクト（Google SSO 用 OAuth クライアント ID/シークレット）
- LLM プロバイダ（Gemini / Vertex AI / Z.ai — AI 要約・エージェント機能用）
- メールプロバイダ（SMTP / Resend — メール送信用）
- ストレージプロバイダ（S3 互換 / GCS — ファイルストレージをクラウドに置く場合）

---

## 1. インストール（ワンコマンド）

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | bash
```

対話形式でドメイン名とメールアドレスを入力するだけで、以下が自動で行われます:

- Docker/Compose の存在確認
- シークレットの自動生成（DB パスワード、認証キー、LiveKit キー等）
- `/opt/echolore/` にファイル配置
- Docker イメージの pull と起動
- データベースマイグレーション
- ヘルスチェック

### 非対話モード

CI/CD やスクリプトから使う場合:

```bash
DOMAIN=echolore.example.com ACME_EMAIL=admin@example.com \
  curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | bash -s -- --unattended
```

---

## 2. 初期ユーザー登録

デプロイ直後はユーザーが存在しないため、最初のユーザー登録のみ開放されています。

1. ブラウザで `https://your-domain.com/login` にアクセス
2. **メールアドレス + パスワード** で登録する
   - 初回はメールプロバイダが未設定のため、メール認証リンクは不要（自動でメール認証済みになります）
   - Google SSO はこの時点では使用できません（管理画面での設定が必要なため）
3. **最初に登録したユーザーが自動的に管理者（admin）に昇格**
4. 以降の自己登録は自動的に閉鎖されます
5. 追加ユーザーは管理画面（`/admin/users`）から管理者が招待・追加します

---

## 3. 管理画面での初期設定

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

### 映像品質設定
- 会議 / コワーキングそれぞれの Simulcast / Dynacast / Adaptive Stream

---

## 4. アップデート

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/update.sh | bash
```

特定バージョンに更新する場合:

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/update.sh | bash -s -- --version v0.2.0
```

アップデートは以下を自動で行います:
- `.env` のバックアップ
- compose ファイルの更新
- 新イメージの pull
- データベースマイグレーション
- サービスの再起動
- ヘルスチェック

### ロールバック

直前のバージョンに戻す場合:

```bash
cd /opt/echolore
cp .env.backup.<timestamp> .env
docker compose pull
docker compose up -d --remove-orphans
```

---

## 5. バックアップ

### データベース

```bash
cd /opt/echolore
docker compose exec -T db pg_dump -U wiki wiki > backup_$(date +%Y%m%d).sql
```

### リストア

```bash
cd /opt/echolore
docker compose exec -T db psql -U wiki wiki < backup_20260315.sql
```

### ファイルストレージ

ローカルストレージの場合、`file_data` Docker ボリュームにファイルが保存されています:

```bash
docker run --rm -v echolore_file_data:/data -v $(pwd):/backup alpine tar czf /backup/files_backup.tar.gz -C /data .
```

---

## 6. トラブルシューティング

### ログ確認

```bash
cd /opt/echolore
docker compose logs --tail=200 api
docker compose logs --tail=200 web
docker compose logs --tail=200 traefik
```

### ヘルスチェック

```bash
cd /opt/echolore

# API
curl http://localhost:3001/health

# 全コンテナ
docker compose ps
```

### API が起動しない
- `docker compose logs api` でエラー確認
- DB が healthy か確認: `docker compose exec -T db pg_isready -U wiki -d wiki`

### TLS 証明書が取得できない
- ドメインの DNS A レコードがサーバー IP を指しているか確認
- ポート 80 が開放されているか確認（ACME HTTP チャレンジに必要）
- `docker compose logs traefik` で証明書エラーを確認

### ファイルアップロードが失敗する
- ストレージプロバイダが正しく設定されているか管理画面で確認
- ローカルストレージの場合: ボリュームのパーミッション確認
- S3/GCS の場合: 管理画面の「接続テスト」で疎通確認

### LiveKit に接続できない
- UDP 50000-50020 がファイアウォールで開放されているか確認
- TURN サーバーのドメイン DNS が正しく設定されているか確認

### 認証エラー（401）
- `AUTH_SECRET` が設定されているか確認
- Google SSO: 管理画面で OAuth クライアント ID/シークレットが正しく設定されているか確認

---

## アーキテクチャ概要

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

## 関連ドキュメント

- `docs/contributing-deployment.md` — 開発者向けデプロイガイド
- `docs/release-workflows.md` — リリースワークフロー詳細
- `docs/ops-runbook.md` — 運用手順書
- `docs/system-architecture.md` — システムアーキテクチャ
