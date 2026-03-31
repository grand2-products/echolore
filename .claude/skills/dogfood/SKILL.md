---
name: dogfood
description: Dogfooding環境（docker-compose.dogfood.yml）の起動・停止・ビルド・ログ確認・ヘルスチェック、およびdogfoodingシナリオに沿った手動テストのガイドを行うスキル。「dogfood」「dogfooding」「本番相当でテスト」「ドッグフード」「手動テスト」「シナリオテスト」と言われたら必ずこのスキルを使う。ミーティングや Wiki を実際に触って確認したい、という文脈でも発動すること。
---

# Dogfooding

echolore をローカルで本番相当のDockerイメージとしてビルド・起動し、`docs/dogfooding/scenarios.md` のシナリオに沿って手動テストを行うためのスキル。

## 環境の概要

- **Compose ファイル:** `docker-compose.dogfood.yml`
- **env ファイル:** `.env.dogfood`（テンプレート: `.env.dogfood.example`）
- **コンテナ名プレフィックス:** `echolore-dogfood-*`
- **ネットワーク:** 単一の `dogfood` ネットワーク（Traefik不使用）
- **ポート:** dev 環境と同じデフォルト値（web: 17860, api: 17821, livekit: 17822, db: 17824, valkey: 17825）

## 操作コマンド

すべてのコマンドはプロジェクトルートで実行する。

### 初回セットアップ

```bash
cp .env.dogfood.example .env.dogfood
# .env.dogfood を編集してシークレットを設定
```

### ビルド & 起動

```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood up --build -d
```

初回は api/web/worker のイメージビルドに数分かかる。`--build` を付けないと前回ビルドしたイメージを再利用する。

### 特定サービスだけリビルド

api だけ変更した場合など:

```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood up --build -d api
```

### ヘルスチェック

```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood ps
```

全サービスが `healthy` / `running` であることを確認する。api の healthcheck は start_period が 20秒あるので、起動直後は `starting` でも問題ない。

### ログ確認

```bash
# 全サービス
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood logs -f --tail=50

# 特定サービス
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood logs -f api
```

### 停止

```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood down
```

### データリセット（全データ削除して再起動）

```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood down -v
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood up --build -d
```

`-v` を付けると PostgreSQL と Valkey のデータボリュームも削除される。ゼロユーザー状態からやり直したい時に使う。

## Dogfooding シナリオの実行

シナリオ定義は `docs/dogfooding/scenarios.md` にある。チェックリストのテンプレートは `docs/dogfooding/checklist-template.md`。

### フロー

1. **環境を起動** — 上記のビルド & 起動コマンドを実行
2. **ヘルスチェック** — 全サービスが healthy であることを確認
3. **シナリオ選択** — ユーザーに実施したいシナリオを選んでもらう。選択肢:
   - 全シナリオ通し（初回 dogfooding 向け）
   - 特定シナリオのみ（変更箇所に関連するもの）
   - クイックスモーク（シナリオ 1, 2, 8 の主要項目のみ）
4. **シナリオ実行** — `scenarios.md` から該当シナリオのチェック項目を表示し、ユーザーが各項目を確認しながら進める。Claude は操作手順の補足説明や、API での確認コマンドを提示してサポートする
5. **問題の記録** — 発見した問題は会話内で記録し、必要に応じて GitHub Issue 化する
6. **結果まとめ** — 実施シナリオの Pass/Fail を一覧で表示

### サポートできること

シナリオ実行中、Claude は以下の補助を行える:

- **API レスポンスの確認:** `curl` でエンドポイントを叩いて結果を確認
- **DB の状態確認:** `docker compose exec db psql -U wiki -d wiki -c "..."` でデータを確認
- **ログの問題診断:** エラーログから原因を特定
- **Issue 化:** 発見した問題を `gh issue create` で GitHub Issue に起票

### API 確認の例

```bash
# Health check
curl -s http://localhost:17721/health | jq .

# 認証なしで API アクセス → 401 を確認
curl -s -o /dev/null -w "%{http_code}" http://localhost:17721/api/pages
```

## トラブルシューティング

### ポートが競合する

dev 環境と同じポートを使うため、`dev.ps1` や `docker-compose.dev.yml` が起動中だと競合する。先にそちらを停止する:

```bash
docker compose -f docker-compose.dev.yml down
```

### api が起動しない

ログを確認:
```bash
docker compose -f docker-compose.dogfood.yml --env-file .env.dogfood logs api
```

よくある原因:
- `ENCRYPTION_KEY` 未設定 → `openssl rand -hex 32` で生成して `.env.dogfood` に設定
- DB マイグレーション失敗 → db コンテナのログも確認
- 環境変数の不足 → `.env.dogfood` の設定を確認

### web が api に接続できない

`ECHOLORE_PUBLIC_API_URL` は Next.js のビルド時ではなくランタイムで参照される（runtime-env パターン）。api の healthcheck が passing になるまで web は起動を待つ。
