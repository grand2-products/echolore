# EchoLore デプロイメントガイド

EchoLore をサーバーにデプロイするための手順書です。

## 前提条件

### サーバー要件
- OS: Debian 12 / Ubuntu 22.04 以降（Linux）
- メモリ: 4GB 以上（録画・AI 機能を使う場合は 8GB 推奨）
- ストレージ: 20GB 以上
- ポート開放: 80, 443, 3478/udp, 5349/tcp（TURN）, 50000-50020/udp（LiveKit RTC メディア用）

### ソフトウェア要件
- Docker Engine（インストール: https://docs.docker.com/engine/install/）
- Docker Compose v2 プラグイン（インストール: https://docs.docker.com/compose/install/linux/）

### ファイアウォール設定例（ufw）

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw allow 5349/tcp
sudo ufw allow 50000:50020/udp
sudo ufw reload
```

### 外部サービス
- ドメイン名（DNS の A レコードをサーバー IP に設定済み）

### オプション（デプロイ後に管理画面から設定）
- Google Cloud Console プロジェクト（Google SSO・Gemini・Vertex AI・GCS 用）→ [付録 A](#付録-a-gcp-プロジェクトセットアップ) 参照
- LLM プロバイダ（Gemini / Vertex AI / Z.ai — AI 要約・エージェント機能用）
- メールプロバイダ（SMTP / Resend — メール送信用）
- ストレージプロバイダ（S3 互換 / GCS — ファイルストレージをクラウドに置く場合）

---

## 1. インストール（ワンコマンド）

```bash
curl -fsSL https://github.com/grand2-products/echolore/releases/latest/download/install.sh | bash
```

対話形式でドメイン名とメールアドレスを入力するだけで、以下が自動で行われます:

- Docker/Compose の存在確認（**未インストールの場合はエラー停止** — 事前に「ソフトウェア要件」のリンク先からインストールしてください）
- シークレットの自動生成（DB パスワード、認証キー、LiveKit キー等）
- `/opt/echolore/` にファイル配置
- Docker イメージの pull と起動
- データベースマイグレーション
- ヘルスチェック

> **再実行について:** install.sh は安全に再実行できます。既に `.env` が存在する場合は上書き確認が表示され、既存のシークレットは保持されます。

### サーバー再起動時の自動復旧

すべてのコンテナは `restart: unless-stopped` ポリシーで構成されています。
サーバーを再起動すると Docker デーモンが起動次第、全コンテナが自動的に復旧します。

Docker デーモン自体の自動起動を確認:

```bash
sudo systemctl enable docker
```

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
ls -la .env.backup.*
cp .env.backup.<timestamp> .env
docker compose pull
docker compose up -d --remove-orphans
```

例:

```bash
cd /opt/echolore
cp .env.backup.20260316120000 .env
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

### 単一インスタンス向け: cron + GCS への日次ファイルバックアップ

1. バックアップ先バケットを作成（例: `gs://echolore-prod-backups`）— GCS の初期設定は [付録 A-5](#a-5-google-cloud-storagegcs) 参照
2. サーバーに `gcloud` CLI をインストールし、サービスアカウントで認証
3. `roles/storage.objectAdmin`（最小化するなら bucket 単位の書き込み権限）を付与

`/opt/echolore/scripts/backup-files-to-gcs.sh` を作成:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_BUCKET="gs://echolore-prod-backups"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVE_NAME="echolore-files-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="/tmp/${ARCHIVE_NAME}"

cd /opt/echolore

# Docker volume(file_data) からアーカイブ作成
docker run --rm \
  -v echolore_file_data:/data \
  -v /tmp:/backup \
  alpine sh -c "tar czf /backup/${ARCHIVE_NAME} -C /data ."

# GCS へアップロード
gcloud storage cp "${ARCHIVE_PATH}" "${BACKUP_BUCKET}/files/${ARCHIVE_NAME}"

# ローカル一時ファイルを削除
rm -f "${ARCHIVE_PATH}"
```

実行権限を付与:

```bash
chmod +x /opt/echolore/scripts/backup-files-to-gcs.sh
```

cron 設定（毎日 03:30 実行）:

```bash
cat <<'CRON' | sudo tee /etc/cron.d/echolore-files-backup >/dev/null
30 3 * * * root /opt/echolore/scripts/backup-files-to-gcs.sh >> /var/log/echolore-files-backup.log 2>&1
CRON

sudo chmod 644 /etc/cron.d/echolore-files-backup
```

> 推奨: GCS バケット側で Lifecycle Rule を設定し、古いバックアップを自動削除してください（例: 30 日保持）。

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

# API（コンテナ内ヘルスチェック）
docker compose exec -T api wget --no-verbose --tries=1 --spider http://localhost:3001/health

# API（外部到達確認）
curl https://your-domain.com/api/health

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

## 付録 A: GCP プロジェクトセットアップ

GCP を初めて使う方向けに、EchoLore で必要な各サービスの設定手順をゼロから説明します。
使いたい機能だけ設定すれば OK です。

セットアップには **2 つのルート** があります:

| ルート | 向いている人 | 手順 |
|---|---|---|
| **手動（Cloud Console）** | GCP 初心者・GUI で確認しながら進めたい | A-1 〜 A-7 を順に実施 |
| **Terraform（推奨）** | IaC に慣れている・再現性が欲しい | A-1 → A-2（OAuth は手動） → [A-T](#a-t-terraform-による一括セットアップ) |

> Terraform ルートでも **OAuth 同意画面とクライアント ID の作成（A-1 + A-2）は手動** です。
> これらは GCP の制約上、API / Terraform では完全に自動化できません。

---

### A-1. GCP プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、Google アカウントでログイン
2. 画面上部のプロジェクトセレクタ → **「新しいプロジェクト」** をクリック
3. プロジェクト名を入力（例: `echolore-prod`）し、「作成」をクリック
4. 作成後、**プロジェクト ID** を控えておく（管理画面の複数箇所で使用）

> 以降の手順はすべて、このプロジェクトが選択された状態で行ってください。

---

### A-2. Google SSO（OAuth ログイン）

Google アカウントでのログインを有効にする場合に設定します。

#### OAuth 同意画面の設定

1. Cloud Console → **「API とサービス」→「OAuth 同意画面」**
2. User Type: **「外部」** を選択（Google Workspace 組織内限定なら「内部」）
3. 以下を入力:
   - アプリ名: サイト名（例: `EchoLore`）
   - ユーザーサポートメール: 管理者のメールアドレス
   - 承認済みドメイン: EchoLore のドメイン（例: `echolore.example.com`）
   - デベロッパーの連絡先メール: 管理者のメールアドレス
4. スコープ: **「スコープを追加または削除」** → `email`, `profile`, `openid` を追加
5. テストユーザー: 「外部」の場合、本番公開前はテストユーザーを追加（最大 100 名）
6. 保存して続行

#### OAuth クライアント ID の作成（Web アプリケーション）

1. **「API とサービス」→「認証情報」→「＋ 認証情報を作成」→「OAuth クライアント ID」**
2. アプリケーションの種類: **「ウェブ アプリケーション」**
3. 名前: 任意（例: `EchoLore Web`）
4. **承認済みのリダイレクト URI** に以下を追加:
   ```
   https://your-domain.com/api/auth/callback/google
   ```
5. 「作成」をクリック
6. 表示される **クライアント ID** と **クライアント シークレット** を控える

#### （オプション）モバイルアプリ用クライアント ID

モバイルアプリからの SSO も使う場合:

- **iOS 用**: アプリケーションの種類 → 「iOS」で別途クライアント ID を作成（バンドル ID を指定）
- **Android 用**: アプリケーションの種類 → 「Android」で別途クライアント ID を作成（パッケージ名と SHA-1 を指定）

#### EchoLore 管理画面への設定

`/admin/settings` の **認証設定** セクションで以下を入力:

| フィールド | 値 |
|---|---|
| Google Client ID | 取得したクライアント ID（`xxxx.apps.googleusercontent.com`） |
| Google Client Secret | 取得したクライアント シークレット |
| 許可ドメイン | SSO を許可するメールドメイン（例: `example.com`） |
| iOS Client ID | （オプション）iOS 用クライアント ID |
| Android Client ID | （オプション）Android 用クライアント ID |
| OAuth Audiences | （オプション）追加の OAuth audience をカンマ区切りで |

#### 本番公開

テストが完了したら、OAuth 同意画面 → **「アプリを公開」** で本番ステータスに移行します。
「外部」の場合、テストユーザー制限が解除され、すべての Google アカウントでログイン可能になります。

---

### Gemini Developer API vs Vertex AI — どちらを選ぶ？

EchoLore の AI 機能（要約・エージェント・Embedding）は、**Gemini Developer API（A-3）** と **Vertex AI（A-4）** のどちらでも動作します。
Google 自身も「まず Gemini Developer API で始め、エンタープライズ統制が必要になったら Vertex AI へ」という使い分けを推奨しています。

| | Gemini Developer API（A-3） | Vertex AI（A-4） |
|---|---|---|
| 認証方式 | API キー | サービスアカウント（IAM） |
| セットアップ | 数分（API キーを貼るだけ） | GCP の IAM・API 有効化が必要 |
| 向いている場面 | 個人利用・PoC・素早い試作 | 社内本番・権限管理・監査ログが必要 |
| データ所在地の指定 | 不可 | リージョン指定可能 |
| VPC Service Controls | 非対応 | 対応 |
| 課金・クォータ管理 | Google AI Studio で確認 | GCP の請求・クォータと統合 |

> 迷ったら **A-3（Gemini Developer API）で始めて**、後から管理画面でプロバイダを切り替えるだけで Vertex AI に移行できます。

---

### A-3. Gemini Developer API（API キー方式）

個人利用や素早い試作に最適です。API キーを取得するだけで利用開始できます。

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. **「API キーを作成」** をクリック → 対象の GCP プロジェクトを選択
3. 生成された API キー（`AIza...`）を控える

#### EchoLore 管理画面への設定

`/admin/settings` の **LLM プロバイダ** セクションで:

| フィールド | 値 |
|---|---|
| プロバイダ | `Google Gemini` を選択 |
| Gemini API Key | 取得した API キー |
| Text Model | 使用モデル（例: `gemini-2.5-flash`） |

> **モデルの選び方:** `gemini-2.5-flash` が汎用的でおすすめです。より軽量・低コストなモデルとして `gemini-3.1-flash-lite-preview` も利用可能ですが、preview のため仕様が予告なく変更される可能性があります。

設定後、**「接続テスト」** ボタンで疎通を確認してください。

---

### A-4. Vertex AI（サービスアカウント方式）

社内本番環境やコンプライアンス要件がある場合に選択します。IAM によるアクセス制御、リージョン指定、VPC Service Controls、監査ログなど GCP のエンタープライズ機能をフル活用できます。

#### API の有効化

Cloud Console → **「API とサービス」→「ライブラリ」** から以下の API を検索し、それぞれ **「有効にする」** をクリック:

| API | 用途 |
|---|---|
| Vertex AI API | LLM 推論（要約・エージェント） |
| Cloud Speech-to-Text API | 音声文字起こし |
| Cloud Text-to-Speech API | 音声合成 |
| Generative Language API | Embedding（セマンティック検索） |

> Speech-to-Text / Text-to-Speech は AI チューバー機能や会議の文字起こしで使用します。不要であれば省略可能です。

#### サービスアカウントの作成

1. Cloud Console → **「IAM と管理」→「サービスアカウント」→「＋ サービスアカウントを作成」**
2. 名前: `echolore`（任意）
3. ロール: **「Vertex AI ユーザー」**（`roles/aiplatform.user`）を付与
4. 「完了」をクリック
5. 作成したサービスアカウントをクリック → **「鍵」タブ →「鍵を追加」→「新しい鍵を作成」→ JSON**
6. ダウンロードされた JSON ファイルの内容を控える

#### EchoLore 管理画面への設定

**共通 GCP クレデンシャル**（`/admin/settings` の **GCP クレデンシャル** セクション）:

| フィールド | 値 |
|---|---|
| GCP Project ID | プロジェクト ID（例: `echolore-prod`） |
| Service Account Key JSON | ダウンロードした JSON の内容をそのまま貼り付け |

**LLM プロバイダ**セクション:

| フィールド | 値 |
|---|---|
| プロバイダ | `Vertex AI` を選択 |
| Vertex Project | プロジェクト ID |
| Vertex Location | リージョン（例: `asia-northeast1`） |
| Vertex Model | 使用モデル（例: `gemini-2.5-flash`） |

> **モデルの選び方:** `gemini-2.5-flash` が汎用的でおすすめです。より軽量・低コストなモデルとして `gemini-3.1-flash-lite-preview` も利用可能ですが、preview のため仕様が予告なく変更される可能性があります。

設定後、**「接続テスト」** ボタンで疎通を確認してください。

---

### A-5. Google Cloud Storage（GCS）

ファイルストレージをクラウドに置く場合に設定します。

> **Terraform ルートの場合:** [A-T](#a-t-terraform-による一括セットアップ) で GCS バケットとIAM は自動作成されます。このセクションの手動手順は不要です（管理画面への設定のみ必要）。

#### API の有効化

1. Cloud Console → **「API とサービス」→「ライブラリ」**
2. **「Cloud Storage API」** を検索し、有効化されていることを確認（通常はデフォルトで有効）

#### バケットの作成

1. Cloud Console → **「Cloud Storage」→「バケット」→「＋ 作成」**
2. バケット名: グローバルに一意な名前（例: `echolore-prod-files`）
3. ロケーション: サーバーに近いリージョン（例: `asia-northeast1`）
4. ストレージクラス: **Standard**（推奨）
5. アクセス制御: **「均一」** を選択
6. 「作成」をクリック

#### サービスアカウントの権限付与

A-4 でサービスアカウントを既に作成済みの場合、そのアカウントに GCS の権限を追加します:

1. Cloud Console → **「IAM と管理」→「IAM」**
2. 該当サービスアカウントの行で **「編集」（鉛筆アイコン）** をクリック
3. **「別のロールを追加」** → **「Storage オブジェクト管理者」**（`roles/storage.objectAdmin`）を付与
4. 保存

サービスアカウントを新規作成する場合は、A-4 の「サービスアカウントの作成」手順を参考に、ロールを **「Storage オブジェクト管理者」** にして作成してください。

#### EchoLore 管理画面への設定

**共通 GCP クレデンシャル** が設定済みの場合（A-4 参照）、GCS はデフォルトでそのクレデンシャルを使用します。

`/admin/settings` の **ストレージプロバイダ** セクション:

| フィールド | 値 |
|---|---|
| プロバイダ | `Google Cloud Storage` を選択 |
| GCS Bucket | バケット名（例: `echolore-prod-files`） |
| デフォルト GCP クレデンシャルを使用 | ON（共通クレデンシャルを使う場合） |

共通クレデンシャルを使わず GCS 専用のクレデンシャルを指定する場合:

| フィールド | 値 |
|---|---|
| デフォルト GCP クレデンシャルを使用 | OFF |
| GCS Project ID | プロジェクト ID |
| GCS Key JSON | サービスアカウントキー JSON |

設定後、**「接続テスト」** ボタンで疎通を確認してください。

---

### A-6. Embedding（セマンティック検索）

LLM プロバイダの設定が完了していれば、Embedding は追加の GCP 設定なしで利用できます。

`/admin/settings` の **Embedding 設定** セクション:

| フィールド | 値 |
|---|---|
| Embedding 有効 | ON |
| Embedding Model | `gemini-embedding-002`（推奨） |

> Embedding を無効にするとセマンティック検索が機能しなくなります。

---

### 付録 B: Z.ai（GLM）セットアップ

GCP を使わず、Z.ai を LLM プロバイダとして利用する場合の手順です。

#### API キーの取得

1. [Z.ai 開放プラットフォーム](https://open.bigmodel.cn/) にアクセスし、アカウントを作成
2. ダッシュボード → **「API Keys」** → **「API キーを作成」**
3. 生成された API キーを控える

#### EchoLore 管理画面への設定

`/admin/settings` の **LLM プロバイダ** セクションで:

| フィールド | 値 |
|---|---|
| プロバイダ | `Z.ai (GLM)` を選択 |
| Z.ai API Key | 取得した API キー |
| Z.ai Model | 使用モデル（例: `glm-5`） |
| Z.ai Coding Plan | 有効にすると Coding Plan 専用エンドポイントを使用（通常は OFF） |

設定後、**「接続テスト」** ボタンで疎通を確認してください。

> Z.ai を選択した場合、Embedding は Z.ai 経由ではなく Gemini Developer API（A-3 の API キー）経由で動作します。Embedding を使う場合は A-3 の API キーも併せて設定してください。

---

### A-7. 推奨構成まとめ

用途に応じた推奨構成です:

| 用途 | 必要な設定 | サービスアカウントのロール |
|---|---|---|
| Google SSO のみ | A-1 + A-2 | 不要（OAuth クライアント ID のみ） |
| SSO + AI（Gemini、シンプル） | A-1 + A-2 + A-3 | 不要（API キーのみ） |
| SSO + AI（Z.ai） | A-1 + A-2 + [付録 B](#付録-b-zaiglmセットアップ) | 不要（Z.ai API キーのみ） |
| SSO + AI + GCS | A-1 + A-2 + A-4 + A-5 | Vertex AI ユーザー + Storage オブジェクト管理者 |
| フル構成（手動） | A-1 〜 A-6 すべて | Vertex AI ユーザー + Storage オブジェクト管理者 |
| フル構成（Terraform） | A-1 + A-2（手動） → [A-T](#a-t-terraform-による一括セットアップ) | Terraform が自動付与 |

> 1 つのサービスアカウントに複数のロールをまとめて付与できます。サービスごとに分ける必要はありません。

---

### A-T. Terraform による一括セットアップ

OAuth（A-1 + A-2）を手動で済ませた後、残りの GCP リソースを Terraform で一括作成できます。
`deploy/terraform/` にファイル一式が用意されています。

#### 前提

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) がインストール済み
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5 がインストール済み
- `gcloud auth login` と `gcloud auth application-default login` が完了済み

#### 手順

**1. Terraform state 用バケットの作成（初回のみ）**

```bash
cd deploy/terraform
chmod +x bootstrap.sh
./bootstrap.sh <PROJECT_ID> [REGION]
```

これにより `gs://<PROJECT_ID>-echolore-tfstate` バケットが作成されます。

**2. 変数ファイルの準備**

```bash
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` を編集:

```hcl
project_id      = "my-echolore-project"
echolore_domain = "echolore.example.com"
region          = "asia-northeast1"

# Gemini Developer API のみ使う場合は Vertex AI を無効化できる
# enable_vertex_ai = false
```

**3. 初期化・適用**

```bash
terraform init \
  -backend-config="bucket=<PROJECT_ID>-echolore-tfstate" \
  -backend-config="prefix=terraform/state"

terraform plan   # 変更内容を確認
terraform apply  # 実行
```

**4. サービスアカウントキーの取得**

```bash
terraform output -raw service_account_key_json > sa-key.json
cat sa-key.json  # EchoLore 管理画面に貼り付ける内容
```

> **重要:** `sa-key.json` は機密情報です。管理画面に貼り付けた後はファイルを削除してください。
> `terraform.tfvars` と同様、`.gitignore` でリポジトリにコミットされないようになっています。

**5. EchoLore 管理画面への設定**

Terraform が作成したリソースの情報を管理画面に入力します:

```bash
terraform output  # 全出力を確認
```

| 管理画面のセクション | 設定内容 |
|---|---|
| **認証設定** | A-2 で取得した OAuth クライアント ID / シークレット |
| **GCP クレデンシャル** | `service_account_key_json` の出力内容と `project_id` |
| **LLM プロバイダ** | Vertex AI → Project / Location / Model を入力、または Gemini Developer API → API キーを入力（A-3 参照） |
| **ストレージ** | GCS を選択 → `gcs_bucket_name` の出力値を入力 |

#### Terraform が作成するリソース

| リソース | 説明 |
|---|---|
| `google_project_service` | API の有効化（Storage, Vertex AI, Speech-to-Text, Text-to-Speech, Generative Language） |
| `google_service_account` | EchoLore 用サービスアカウント |
| `google_service_account_key` | サービスアカウントキー（JSON） |
| `google_project_iam_member` | IAM ロール付与（Storage Object Admin, Vertex AI User） |
| `google_storage_bucket` | ファイルストレージ用 GCS バケット |

#### リソースの削除

```bash
terraform destroy  # Terraform 管理リソースを削除
# tfstate バケットは手動で削除: gcloud storage rm -r gs://<PROJECT_ID>-echolore-tfstate
```

---

## 関連ドキュメント

- `docs/contributing-deployment.md` — 開発者向けデプロイガイド
- `docs/release-workflows.md` — リリースワークフロー詳細
- `docs/ops-runbook.md` — 運用手順書
- `docs/system-architecture.md` — システムアーキテクチャ
