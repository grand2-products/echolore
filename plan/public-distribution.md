# EchoLore パブリック配布モデルへの移行計画

## Context

echolore を **EchoLore**（AI ベースのナレッジツール）として OSS 公開する。デプロイモデルを「fork して自前ビルド」から「インストールスクリプト実行」に変更する。併せてプロジェクト名を `echolore` → `echolore` にリネームする。

**現状の問題**: fork + private 化すると GHCR 認証、GitHub Secrets 設定、SSH 鍵管理など前提知識が多すぎる。

**目標**: `curl | bash` でインストールし、`.env` を編集して起動するだけで動く。

---

## Phase 1: プロジェクトリネーム（echolore → echolore）

### 1-1. パッケージ名の変更

| 現在 | 変更後 |
|---|---|
| `echolore` (root) | `echolore` |
| `@echolore/api` | `@echolore/api` |
| `@echolore/web` | `@echolore/web` |
| `@echolore/worker` | `@echolore/worker` |
| `@echolore/shared` | `@echolore/shared` |
| `@echolore/ui` | `@echolore/ui` |

対象ファイル: 全 `package.json`、全 `Dockerfile`（`pnpm --filter` コマンド）、`docker-compose.dev.yml`

### 1-2. Docker container_name の変更

`echolore-*` → `echolore-*`

対象: `docker-compose.yml` の全 container_name（traefik, db, valkey, livekit, livekit-egress, api, web, worker）

### 1-3. systemd / スクリプトの変更

- `dev.ps1`: container_name 参照

### 1-4. ドキュメントの変更

- `README.md`: タイトル、説明文
- `AGENTS.md`: リポジトリ名、目的
- `SECURITY.md`: メールアドレス
- `DEPLOYMENT.md`: 全体
- root `package.json` の description

### 1-5. GHCR イメージパス

`ghcr.io/grand2-products/echolore/*` → `ghcr.io/grand2-products/echolore/*`

---

## Phase 2: SSH デプロイパイプライン削除

以下を削除:
- `.github/workflows/app-release.yml`
- `.github/workflows/app-rollback.yml`
- `.github/workflows/bootstrap-validate.yml`
- `scripts/release/remote-runtime-apply.sh`
- `scripts/release/remote-bootstrap-validate.sh`
- `scripts/release/local-bootstrap-validate.ps1`
- `scripts/setup/vps-init.sh`（install.sh に置き換え）

以下は維持:
- `.github/workflows/ci.yml`（lint/test/build）

---

## Phase 3: タグベースリリースワークフロー

### 3-1. `.github/workflows/publish-release.yml` 新規作成

トリガー: タグ `v*.*.*` の push

1. api, web, worker の 3 イメージをビルド
2. Docker タグ: `v0.1.0`（pinned）, `0.1`（minor track）, `latest`
3. GitHub Release 作成（changelog 自動生成）
4. `docker-compose.production.yml` と `install.sh` をリリースアセットとして添付

---

## Phase 4: エンドユーザー向け compose + スクリプト

### 4-1. `docker-compose.production.yml` 新規作成

現在の `docker-compose.yml` をベースに簡素化:
- イメージ: `ghcr.io/grand2-products/echolore/api:${ECHOLORE_VERSION:-latest}`
- 外部ポートのみ: 80, 443, 3478/udp, 5349/tcp, 50000-50020/udp
- デバッグポート（DB, Valkey, API, Web のホストバインド）削除
- `./docker/init-db.sql` バインドマウント削除（migrate.ts に移動）
- ファイルストレージ: named volume `file_data`

### 4-2. `apps/api/src/db/migrate.ts` に pgvector 拡張作成を追加

```typescript
await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
```

`docker/init-db.sql` のバインドマウントが不要になる。

### 4-3. `scripts/install.sh` 新規作成

**対話モード**（デフォルト）:
1. 前提確認: Docker, Docker Compose v2, ポート空き
2. プロンプト: `DOMAIN`, `ACME_EMAIL`
3. シークレット自動生成: `DB_PASSWORD`, `AUTH_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `ROOM_AI_WORKER_SECRET`, `ENCRYPTION_KEY`
4. 派生値計算: `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_TURN_DOMAIN`
5. `/opt/echolore/` にディレクトリ作成
6. `docker-compose.production.yml` ダウンロード
7. `.env` 生成
8. `docker compose pull && up -d`
9. ヘルスチェック → 完了メッセージ

**非対話モード**: `--unattended` フラグ、環境変数から読み取り

**冪等性**: 既存 `.env` がある場合は確認

### 4-4. `scripts/update.sh` 新規作成

1. `--version v0.2.0`（省略時は GitHub API で最新取得）
2. `.env` バックアップ
3. compose ファイル更新
4. `ECHOLORE_VERSION` 更新
5. `docker compose pull`
6. マイグレーション: `docker compose run --rm api node dist/apps/api/src/db/migrate.js`
7. `docker compose up -d --remove-orphans`
8. ヘルスチェック

---

## Phase 5: ドキュメント再構成

### 5-1. `DEPLOYMENT.md` → エンドユーザー向けに全面書き直し

- ワンコマンドインストール
- 初回ユーザー登録（パスワード登録のみ、Google SSO は管理画面から後で設定）
- 管理画面設定
- アップデート / ロールバック
- バックアップ
- トラブルシューティング

### 5-2. `docs/contributing-deployment.md` 新規作成

- 開発者/コントリビューター向け
- カスタムイメージビルド手順
- CI/CD パイプラインの説明

### 5-3. `README.md` 更新

- プロジェクト名 EchoLore
- 機能一覧
- Quick Start（install コマンド1行）

---

## ファイル変更一覧

### 新規作成
| ファイル | 用途 |
|---|---|
| `docker-compose.production.yml` | エンドユーザー向け compose |
| `scripts/install.sh` | インストールスクリプト |
| `scripts/update.sh` | アップデートスクリプト |
| `.github/workflows/publish-release.yml` | タグベースイメージ公開 |
| `docs/contributing-deployment.md` | コントリビューター向けデプロイガイド |

### 変更
| ファイル | 変更内容 |
|---|---|
| 全 `package.json` (x7) | `echolore` → `echolore` リネーム |
| 全 `Dockerfile` (x3) | `@echolore/` → `@echolore/` |
| `docker-compose.yml` | container_name 変更、イメージパス変更 |
| `docker-compose.dev.yml` | pnpm filter 変更 |
| `docker-compose.bootstrap-check.yml` | イメージパス変更 |
| `apps/api/src/db/migrate.ts` | pgvector 拡張の自動作成 |
| `dev.ps1` | container_name 参照更新 |
| `DEPLOYMENT.md` | エンドユーザー向け全面書き直し |
| `README.md` | EchoLore として更新 |
| `AGENTS.md` | プロジェクト名・説明更新 |
| `SECURITY.md` | メールアドレス更新 |

### 削除
| ファイル | 理由 |
|---|---|
| `.github/workflows/app-release.yml` | SSH デプロイ廃止 |
| `.github/workflows/app-rollback.yml` | SSH デプロイ廃止 |
| `.github/workflows/bootstrap-validate.yml` | SSH デプロイ廃止 |
| `scripts/release/remote-runtime-apply.sh` | install.sh に置き換え |
| `scripts/release/remote-bootstrap-validate.sh` | 不要 |
| `scripts/release/local-bootstrap-validate.ps1` | 不要 |
| `scripts/setup/vps-init.sh` | install.sh に統合 |

---

## バージョニング

- semver: `v0.1.0`, `v0.2.0`, `v1.0.0`
- Docker タグ: `v0.1.0`, `0.1`, `latest`
- `.env` に `ECHOLORE_VERSION=v0.1.0` をピン留め
- compose: `${ECHOLORE_VERSION:-latest}` で参照

---

## 実装順序

1. **Phase 1** (リネーム) — 全ファイルの `echolore` → `echolore` 一括変換
2. **Phase 2** (SSH パイプライン削除) — ワークフロー + スクリプト削除
3. **Phase 3** (publish-release.yml) — タグベースリリース
4. **Phase 4** (install/update) — compose + スクリプト作成
5. **Phase 5** (ドキュメント) — DEPLOYMENT.md, README.md 書き直し

---

## 検証

1. リネーム後に `pnpm install && pnpm build` 通過
2. `dev.ps1` で開発環境が正常起動
3. テストタグ `v0.0.1-rc.1` push → GHCR にイメージ公開確認
4. クリーン環境で `install.sh` 実行 → 全コンテナ起動・ヘルスチェック通過
5. `update.sh` でバージョンアップ → マイグレーション + 再起動確認
6. `docker logout ghcr.io` 後に匿名 pull 成功確認
