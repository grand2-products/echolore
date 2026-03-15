# バックアップ戦略（リモート VPS 環境）

## 前提

- デプロイ先: Linux VPS (`/opt/wiki`)
- Docker Compose スタック（Traefik / PostgreSQL / Valkey / LiveKit / API / Web）
- ファイルストレージ: ホストバインドマウント `./data/files:/data/files`
- DB: `postgres_data` 名前付きボリューム
- 運用ユーザー: `deploy`

## バックアップ対象

| 対象 | 場所 | RPO目標 | 備考 |
|------|------|---------|------|
| PostgreSQL | `postgres_data` ボリューム | 24h | 全ビジネスデータ。最重要 |
| ファイル | `/opt/wiki/data/files/` | 24h | アップロードファイル、録画 |
| `.env` | `/opt/wiki/.env` | 変更時 | シークレット含む。別管理推奨 |
| `ENCRYPTION_KEY` | `.env` 内 | - | 紛失するとCalendarトークン復号不能。別途安全に保管 |

### バックアップ不要

| 対象 | 理由 |
|------|------|
| Valkey | LiveKit用キャッシュ。再起動で再生成 |
| LetsEncrypt | 自動再取得される |
| コンテナイメージ | GHCR から再pull可能 |

## 方式: 日次 cron + rsync オフサイト

### 1. バックアップスクリプト

`/opt/wiki/scripts/backup.sh` として VPS 上に配置:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/opt/wiki/backups
RETENTION_DAYS=14
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# --- PostgreSQL (custom format, compressed) ---
docker exec echolore-db \
  pg_dump -U wiki -Fc wiki > "$BACKUP_DIR/db-$DATE.dump"

# --- Files (rsync snapshot) ---
rsync -a /opt/wiki/data/files/ "$BACKUP_DIR/files/"

# --- .env (設定のスナップショット) ---
cp /opt/wiki/.env "$BACKUP_DIR/env-$DATE"

# --- Retention ---
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name 'env-*' -mtime +$RETENTION_DAYS -delete

echo "[backup] completed: $DATE"
```

### 2. cron 設定

```
# /etc/cron.d/echolore-backup
0 3 * * * deploy /opt/wiki/scripts/backup.sh >> /opt/wiki/backups/backup.log 2>&1
```

毎日 03:00 に実行。

### 3. オフサイト転送

VPS 上のバックアップだけではディスク障害で全滅する。以下のいずれかで外部に送る:

#### 案A: rsync + SSH（別サーバー）

```bash
rsync -az --delete /opt/wiki/backups/ backup-user@backup-host:/backups/echolore/
```

- 最もシンプル。既存サーバーがあればコスト追加ゼロ
- SSH鍵認証で自動化

#### 案B: rclone + S3互換ストレージ

```bash
rclone sync /opt/wiki/backups/ remote:echolore-backups/
```

- Cloudflare R2 なら egress 無料、$0.015/GB/月
- Backblaze B2 も安価な選択肢
- 設定: `rclone config` で一度セットアップ

#### 推奨: 案B (rclone + R2/B2)

理由:
- VPS とは独立した障害ドメイン
- VPS 1台構成なので別サーバーを持っていない想定
- 月額数百円レベル

### 4. リストア手順

```bash
# DB リストア
docker exec -i echolore-db \
  pg_restore -U wiki -d wiki --clean --if-exists < /opt/wiki/backups/db-YYYYMMDD-HHMMSS.dump

# ファイルリストア
rsync -a /opt/wiki/backups/files/ /opt/wiki/data/files/

# 環境変数リストア
cp /opt/wiki/backups/env-YYYYMMDD-HHMMSS /opt/wiki/.env
docker compose up -d
```

### 5. リストア検証（月次）

```bash
# ダンプファイルの整合性チェック
docker run --rm -v /opt/wiki/backups:/backup postgres:17-alpine \
  pg_restore --list /backup/db-latest.dump > /dev/null && echo "OK"
```

月1回、cron または手動で実行してダンプ破損がないことを確認する。

## シークレット管理の注意

`ENCRYPTION_KEY` は Google Calendar トークンの暗号化に使用している。
このキーを紛失すると、DBバックアップからリストアしても既存トークンは復号できない。

- `.env` のバックアップに含まれるが、オフサイト先でも暗号化を検討
- パスワードマネージャー（1Password / Bitwarden）に別途控えを保管推奨

## vps-init.sh への統合

VPS 初期セットアップ時にバックアップディレクトリと cron を自動作成するなら、
`scripts/setup/vps-init.sh` に以下を追加:

```bash
mkdir -p /opt/wiki/backups /opt/wiki/scripts
chown -R deploy:deploy /opt/wiki/backups /opt/wiki/scripts

# Install backup cron
cat > /etc/cron.d/echolore-backup <<'CRON'
0 3 * * * deploy /opt/wiki/scripts/backup.sh >> /opt/wiki/backups/backup.log 2>&1
CRON
```

## 未決事項

- [ ] オフサイト先の選定（R2 / B2 / 別サーバー）
- [ ] `backup.sh` を `scripts/setup/` に含めてリポジトリ管理するか、VPS上のみに置くか
- [ ] バックアップ失敗時の通知（メール / Slack webhook）
