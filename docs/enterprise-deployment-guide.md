# Enterprise Deployment Guide (AWS ECS)

Last updated: 2026-03-15

This document describes how to deploy echolore in a high-availability enterprise environment on AWS using ECS + RDS + ElastiCache + S3. Kubernetes は不要。

The standard single-host deployment is described in `DEPLOYMENT.md` and `contributing-deployment.md`. This guide covers multi-AZ redundancy, managed data services, and formal security controls for SLA 99.9%+ environments.

## Architecture Overview

```
Internet
  │
  ├── CloudFront (CDN, optional)
  │
  ├── ALB (HTTPS :443, ACM certificate)
  │     ├── /*       → Target Group: web (ECS)
  │     ├── /api/*   → Target Group: api (ECS)
  │     └── /rtc/*   → Target Group: livekit (ECS)
  │
  ├── NLB (UDP :3478, TCP :5349) → Target Group: livekit TURN
  │
  └── VPC
       ├── Public Subnet (ALB, NLB, NAT Gateway)
       ├── Private Subnet (ECS tasks, LiveKit)
       └── Isolated Subnet (RDS, ElastiCache)
```

### Component Mapping

| Standard (single-host) | Enterprise (AWS) |
|---|---|
| Docker Compose | ECS Fargate (api, web, worker) + ECS EC2 (livekit, egress) |
| Traefik | ALB + NLB + ACM |
| PostgreSQL container | RDS for PostgreSQL 17 (Multi-AZ, pgvector) |
| Valkey container | ElastiCache for Valkey (Multi-AZ) |
| Local file volume | S3 |
| Let's Encrypt | ACM (AWS Certificate Manager) |
| Secrets in `.env` | AWS Secrets Manager |
| Docker socket | 不要 |

## VPC Design

```
VPC: 10.0.0.0/16

  Public Subnets (ALB, NAT GW):
    10.0.0.0/24   (ap-northeast-1a)
    10.0.1.0/24   (ap-northeast-1c)

  Private Subnets (ECS tasks):
    10.0.10.0/24  (ap-northeast-1a)
    10.0.11.0/24  (ap-northeast-1c)

  Isolated Subnets (RDS, ElastiCache):
    10.0.20.0/24  (ap-northeast-1a)
    10.0.21.0/24  (ap-northeast-1c)
```

- ECS タスクは Private Subnet に配置、インターネットへは NAT Gateway 経由
- RDS / ElastiCache は Isolated Subnet (インターネットルートなし)
- Security Group で最小権限のポートのみ許可

## ECS Cluster

### Capacity Strategy

| Service | Launch Type | Why |
|---|---|---|
| api | **Fargate** | ステートレス、Auto Scaling が簡単 |
| web | **Fargate** | 同上 |
| worker | **Fargate** | 同上 |
| livekit | **EC2** | hostNetwork 相当の UDP ポート公開が必要 |
| livekit-egress | **EC2** | SYS_ADMIN capability が必要 |

LiveKit と Egress は Fargate では動かせないため、専用の EC2 Capacity Provider を使う。

### ECS Task Definition: api

```json
{
  "family": "echolore-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/echolore-ecs-execution",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/echolore-api-task",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "ghcr.io/grand2-products/echolore/api:latest",
      "portMappings": [
        { "containerPort": 3001, "protocol": "tcp" }
      ],
      "secrets": [
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:DB_PASSWORD::" },
        { "name": "AUTH_SECRET", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:AUTH_SECRET::" },
        { "name": "LIVEKIT_API_KEY", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:LIVEKIT_API_KEY::" },
        { "name": "LIVEKIT_API_SECRET", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:LIVEKIT_API_SECRET::" },
        { "name": "GEMINI_API_KEY", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:GEMINI_API_KEY::" },
        { "name": "ENCRYPTION_KEY", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:ENCRYPTION_KEY::" },
        { "name": "ROOM_AI_WORKER_SECRET", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:ROOM_AI_WORKER_SECRET::" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3001" },
        { "name": "DATABASE_URL", "value": "postgresql://wiki:${DB_PASSWORD}@echolore-db.xxxxx.ap-northeast-1.rds.amazonaws.com:5432/wiki?sslmode=require" },
        { "name": "VALKEY_URL", "value": "rediss://echolore-valkey.xxxxx.apne1.cache.amazonaws.com:6379" },
        { "name": "LIVEKIT_HOST", "value": "http://livekit.echolore.internal:7880" },
        { "name": "CORS_ORIGIN", "value": "https://echolore.example.com" },
        { "name": "APP_BASE_URL", "value": "https://echolore.example.com" },
        { "name": "FILE_STORAGE_PATH", "value": "/tmp/files" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/health"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 20
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/echolore/api",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "api"
        }
      }
    }
  ]
}
```

### ECS Task Definition: web

```json
{
  "family": "echolore-web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "web",
      "image": "ghcr.io/grand2-products/echolore/web:latest",
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "NEXT_PUBLIC_API_URL", "value": "https://echolore.example.com" },
        { "name": "NEXT_PUBLIC_LIVEKIT_URL", "value": "wss://echolore.example.com" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:3000"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 20
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/echolore/web",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "web"
        }
      }
    }
  ]
}
```

### ECS Task Definition: worker

```json
{
  "family": "echolore-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "ghcr.io/grand2-products/echolore/worker:latest",
      "portMappings": [
        { "containerPort": 8788, "protocol": "tcp" }
      ],
      "secrets": [
        { "name": "ROOM_AI_WORKER_SECRET", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:ROOM_AI_WORKER_SECRET::" },
        { "name": "LIVEKIT_API_KEY", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:LIVEKIT_API_KEY::" },
        { "name": "LIVEKIT_API_SECRET", "valueFrom": "arn:aws:secretsmanager:...:echolore/production:LIVEKIT_API_SECRET::" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "ROOM_AI_WORKER_MODE", "value": "monitor" },
        { "name": "ROOM_AI_API_BASE_URL", "value": "http://api.echolore.internal:3001" },
        { "name": "ROOM_AI_POLL_INTERVAL_MS", "value": "15000" },
        { "name": "ROOM_AI_HEALTH_PORT", "value": "8788" },
        { "name": "LIVEKIT_HOST", "value": "http://livekit.echolore.internal:7880" }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8788/health"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/echolore/worker",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "worker"
        }
      }
    }
  ]
}
```

Worker を複数タスクで動かす場合、ポーリングベースの会議監視がジョブを重複実行しないよう Valkey 分散ロック or BullMQ キューへの移行が必要。現在の monitor モードは単一インスタンス前提。

### ECS Task Definition: livekit (EC2 launch type)

```json
{
  "family": "echolore-livekit",
  "networkMode": "host",
  "requiresCompatibilities": ["EC2"],
  "containerDefinitions": [
    {
      "name": "livekit",
      "image": "livekit/livekit-server:v1.9",
      "cpu": 2048,
      "memory": 4096,
      "environment": [
        {
          "name": "LIVEKIT_CONFIG",
          "value": "port: 7880\nrtc:\n  port_range_start: 50000\n  port_range_end: 50200\n  use_external_ip: true\nkeys:\n  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}\nroom:\n  auto_create: true\n  empty_timeout: 300\n  max_participants: 100\nredis:\n  address: echolore-valkey.xxxxx.apne1.cache.amazonaws.com:6379\n  use_tls: true\nturn:\n  enabled: true\n  domain: turn.echolore.example.com\n  tls_port: 5349\n  udp_port: 3478\nwebhook:\n  urls:\n    - http://api.echolore.internal:3001/api/livekit/webhook\n  api_key: ${LIVEKIT_API_KEY}\nlogging:\n  level: info"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/echolore/livekit",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "livekit"
        }
      }
    }
  ]
}
```

- `networkMode: host` で EC2 ホストの UDP ポートを直接使用
- EC2 インスタンスの Security Group で UDP 50000-50200, UDP 3478, TCP 5349 を開放
- LiveKit は Redis (Valkey) 共有でマルチノード構成を自動的にサポート
- EC2 インスタンスは c6i.xlarge 以上を推奨 (メディア処理は CPU 負荷が高い)

### ECS Task Definition: livekit-egress (EC2 launch type)

```json
{
  "family": "echolore-livekit-egress",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["EC2"],
  "containerDefinitions": [
    {
      "name": "egress",
      "image": "livekit/egress:v1.8",
      "cpu": 2048,
      "memory": 4096,
      "linuxParameters": {
        "capabilities": {
          "add": ["SYS_ADMIN"]
        }
      },
      "environment": [
        {
          "name": "EGRESS_CONFIG_BODY",
          "value": "api_key: ${LIVEKIT_API_KEY}\napi_secret: ${LIVEKIT_API_SECRET}\nws_url: ws://livekit.echolore.internal:7880\nredis:\n  address: echolore-valkey.xxxxx.apne1.cache.amazonaws.com:6379\n  use_tls: true\ns3:\n  access_key: ${AWS_ACCESS_KEY_ID}\n  secret: ${AWS_SECRET_ACCESS_KEY}\n  region: ap-northeast-1\n  bucket: echolore-recordings\nlog_level: info"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/echolore/egress",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "egress"
        }
      }
    }
  ]
}
```

Egress は SYS_ADMIN capability が必要なため Fargate では実行不可。EC2 launch type を使用し、Egress 専用の Capacity Provider に配置する。

## ECS Service Configuration

### Auto Scaling

```json
{
  "api": {
    "desiredCount": 2,
    "minCount": 2,
    "maxCount": 8,
    "scalingPolicy": {
      "targetCPU": 70,
      "scaleInCooldown": 300,
      "scaleOutCooldown": 60
    }
  },
  "web": {
    "desiredCount": 2,
    "minCount": 2,
    "maxCount": 4,
    "scalingPolicy": {
      "targetCPU": 70
    }
  },
  "worker": {
    "desiredCount": 1,
    "minCount": 1,
    "maxCount": 1
  },
  "livekit": {
    "desiredCount": 2,
    "minCount": 2,
    "maxCount": 4
  }
}
```

Worker の desiredCount は現在の monitor モード (単一インスタンス前提) に合わせて 1 に設定。ジョブキュー化後にスケールアウト可能。

### Service Discovery (Cloud Map)

ECS サービス間通信に AWS Cloud Map を使用する。

| Service | DNS Name | Port |
|---|---|---|
| api | api.echolore.internal | 3001 |
| livekit | livekit.echolore.internal | 7880 |

Private DNS namespace `echolore.internal` を作成し、ECS サービスの service discovery に登録する。LiveKit の webhook URL や worker の API_BASE_URL はこの内部 DNS 名を使用する。

### ALB Configuration

```
ALB: echolore-alb
  Listener: HTTPS :443 (ACM certificate for echolore.example.com)

  Rules (priority order):
    1. Path: /rtc/*     → Target Group: livekit (port 7880)
       - Stickiness: enabled (WebSocket)
    2. Path: /api/*     → Target Group: api (port 3001)
       - Health check: GET /health
    3. Default          → Target Group: web (port 3000)
       - Health check: GET /

  HTTP :80 → Redirect to HTTPS :443
```

### NLB Configuration (LiveKit TURN)

```
NLB: echolore-turn-nlb
  Listener: UDP :3478 → Target Group: livekit-turn-udp
  Listener: TCP :5349 → Target Group: livekit-turn-tcp (TLS termination at LiveKit)
```

NLB は L4 なので TLS 終端は LiveKit 側で行う。証明書は ACM ではなく LiveKit config で指定するか、ALB 経由の TCP passthrough を使う。

## Managed Data Services

### RDS for PostgreSQL

**要件**: pgvector 拡張が有効であること (RDS PostgreSQL 17 で対応済み)。

推奨構成:
- Engine: PostgreSQL 17
- Instance: db.r6g.large (2 vCPU, 16 GB) からスタート
- Storage: gp3, 100 GB, 自動拡張有効
- Multi-AZ: 有効 (自動フェイルオーバー)
- Backup: 自動スナップショット保持 14 日 + PITR 有効
- Parameter Group: `shared_preload_libraries = 'vector'`
- Subnet Group: Isolated Subnet に配置
- Security Group: Private Subnet (ECS) からの 5432 のみ許可

初期セットアップ:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

echolore の Drizzle マイグレーションが残りのスキーマを自動作成する。

接続文字列:

```
DATABASE_URL=postgresql://wiki:<password>@echolore-db.xxxxx.ap-northeast-1.rds.amazonaws.com:5432/wiki?sslmode=require
```

接続プーリング: ECS タスク数 x API の pool size がRDS の max_connections を超えないよう注意。必要に応じて RDS Proxy を導入する。

### ElastiCache for Valkey

推奨構成:
- Engine: Valkey 8 (Redis 互換)
- Node type: cache.r6g.large からスタート
- Cluster Mode: Disabled (single shard, Multi-AZ replica)
- Multi-AZ: 有効 (自動フェイルオーバー)
- Encryption in-transit: 有効 (TLS)
- Subnet Group: Isolated Subnet に配置
- Security Group: Private Subnet (ECS) からの 6379 のみ許可

接続:

```
# API
VALKEY_URL=rediss://echolore-valkey.xxxxx.apne1.cache.amazonaws.com:6379

# LiveKit config
redis:
  address: echolore-valkey.xxxxx.apne1.cache.amazonaws.com:6379
  use_tls: true
```

### S3

echolore は admin 設定画面からストレージプロバイダーを S3 に切り替え可能。

推奨構成:
- Bucket: `echolore-files-<account-id>` (グローバル一意)
- Region: ECS と同一リージョン
- Public access: 全ブロック
- Encryption: SSE-S3 (default) or SSE-KMS
- Versioning: 有効
- Lifecycle: 録画ファイルは 90 日後に S3 Glacier Instant Retrieval に移行
- CORS: echolore ドメインのみ許可

IAM Policy (api task role):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::echolore-files-ACCOUNT_ID",
        "arn:aws:s3:::echolore-files-ACCOUNT_ID/*"
      ]
    }
  ]
}
```

Egress の録画出力も S3 に直接書き込むよう設定する (Egress config の `s3` セクション)。

## Security

### IAM Roles

| Role | Attached To | Purpose |
|---|---|---|
| `echolore-ecs-execution` | All task definitions (execution role) | ECR pull, Secrets Manager read, CloudWatch Logs write |
| `echolore-api-task` | api task (task role) | S3 read/write |
| `echolore-egress-task` | egress task (task role) | S3 write (recordings) |

Task role と execution role を分離する。Execution role は ECS エージェントが使用し、task role はコンテナ内のアプリケーションコードが使用する。

### Secrets Manager

1 つの Secret に全キーを JSON で格納:

```json
{
  "DB_PASSWORD": "...",
  "AUTH_SECRET": "...",
  "LIVEKIT_API_KEY": "...",
  "LIVEKIT_API_SECRET": "...",
  "GEMINI_API_KEY": "...",
  "ENCRYPTION_KEY": "...",
  "ROOM_AI_WORKER_SECRET": "..."
}
```

ECS task definition の `secrets` フィールドで個別キーを参照する (前述の task definition 参照)。

自動ローテーション: DB_PASSWORD は RDS と連動した自動ローテーションを設定可能。他のキーはアプリケーション側の対応が必要なため手動管理。

### Security Groups

```
sg-alb:
  Inbound:  TCP 443 from 0.0.0.0/0
  Inbound:  TCP 80  from 0.0.0.0/0 (redirect only)

sg-ecs-fargate:
  Inbound:  TCP 3000-3001 from sg-alb
  Inbound:  TCP 8788      from sg-alb (worker health check)
  Outbound: TCP 5432      to sg-rds
  Outbound: TCP 6379      to sg-valkey
  Outbound: TCP 443       to 0.0.0.0/0 (S3, Gemini API, etc.)

sg-ecs-livekit:
  Inbound:  TCP 7880           from sg-alb
  Inbound:  UDP 3478           from 0.0.0.0/0
  Inbound:  TCP 5349           from 0.0.0.0/0
  Inbound:  UDP 50000-50200    from 0.0.0.0/0
  Outbound: TCP 6379           to sg-valkey

sg-rds:
  Inbound:  TCP 5432 from sg-ecs-fargate

sg-valkey:
  Inbound:  TCP 6379 from sg-ecs-fargate
  Inbound:  TCP 6379 from sg-ecs-livekit
```

### Container Security

- 既存 Dockerfile は Node Alpine ベース + `user: "1000:1000"` (非 root)
- Fargate はデフォルトで read-only root filesystem をサポート (ephemeral storage は writable)
- ECR / GHCR へのイメージ push 時に Trivy スキャンを CI に組み込む

### Authentication Integration

echolore は現在 Google SSO とパスワード認証をサポート。エンタープライズでは:

- **SAML/OIDC**: Entra ID, Okta 等との連携が必要な場合、Auth.js のプロバイダーを追加実装
- **MFA**: IdP 側で MFA を強制するのが最も簡単な対応

## Observability

### Logging

ECS の `awslogs` log driver で CloudWatch Logs に直接出力 (前述の task definition で設定済み)。

Log Group 構成:

```
/ecs/echolore/api
/ecs/echolore/web
/ecs/echolore/worker
/ecs/echolore/livekit
/ecs/echolore/egress
```

- Retention: 30 日 (コスト削減のため。長期保存が必要なら S3 にエクスポート)
- Log Insights でクエリ可能

### Metrics

CloudWatch Container Insights を ECS クラスタで有効化する。追加費用なしで以下が取得可能:

- CPU / Memory utilization (per task, per service)
- Network I/O
- Running task count

アプリケーションメトリクスが必要な場合は、API に CloudWatch Embedded Metrics Format (EMF) を組み込む。

### Alerting

CloudWatch Alarms:

| Alarm | Metric | Threshold | Action |
|---|---|---|---|
| API 全タスクダウン | ECS RunningTaskCount (api) | = 0 for 1 min | SNS → PagerDuty / Slack |
| API 高エラー率 | ALB 5xx count / request count | > 5% for 5 min | SNS → Slack |
| RDS CPU 高負荷 | RDS CPUUtilization | > 80% for 10 min | SNS → Slack |
| RDS 空き容量 | RDS FreeStorageSpace | < 10 GB | SNS → Slack |
| Valkey メモリ | ElastiCache DatabaseMemoryUsagePercentage | > 80% | SNS → Slack |
| Valkey 接続数 | ElastiCache CurrConnections | > 1000 | SNS → Slack |

### Health Checks

ALB の Target Group health check が各サービスの死活監視を兼ねる:

- api: `GET /health` (port 3001)
- web: `GET /` (port 3000)
- worker: `GET /health` (port 8788, internal only)
- livekit: TCP 7880

## CI/CD

### Pipeline

```
GitHub PR
  → CI (lint, test, build, image scan)
  → merge to main
  → tag v*.*.*
  → publish-release.yml:
      1. Build & push images to GHCR (existing workflow)
      2. NEW: Push images to ECR (GHCR → ECR mirror, or build directly to ECR)
      3. Update ECS service (rolling update)
```

### ECS Deployment

```bash
# 各サービスを最新イメージで更新 (rolling update)
aws ecs update-service \
  --cluster echolore \
  --service api \
  --force-new-deployment

aws ecs update-service \
  --cluster echolore \
  --service web \
  --force-new-deployment
```

ECS のデフォルトは rolling update (minimumHealthyPercent: 100, maximumPercent: 200)。新タスクが healthy になってから旧タスクを停止する。

### DB Migration Strategy

echolore は API 起動時に Drizzle の `migrate()` を自動実行する。ECS での注意点:

- **replicas > 1 の場合**: 複数タスクが同時にマイグレーションを実行する可能性がある。Drizzle のマイグレーションはべき等だが、安全のため ECS RunTask で migration-only タスクを先行実行し、その後 api サービスを更新する構成を推奨
- **破壊的マイグレーション**: `rollback-recovery-architecture.md` の手順に従う

```bash
# マイグレーション先行実行
aws ecs run-task \
  --cluster echolore \
  --task-definition echolore-api \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","-e","import(\"./dist/db/index.js\")"]}]}' \
  --network-configuration '...' \
  --launch-type FARGATE

# マイグレーション完了後にサービス更新
aws ecs update-service --cluster echolore --service api --force-new-deployment
```

### Rollback

```bash
# 前バージョンのイメージで task definition を更新し、サービスを更新
aws ecs update-service \
  --cluster echolore \
  --service api \
  --task-definition echolore-api:<previous-revision>
```

DB ロールバックが必要な場合は `rollback-recovery-architecture.md` 参照。

## Disaster Recovery

| 目標 | 構成 |
|---|---|
| **RPO < 1h, RTO < 30min** | RDS 自動バックアップ + PITR、S3 Cross-Region Replication、別リージョンに ECS クラスタ待機 |
| **RPO ≈ 0, RTO < 5min** | RDS Read Replica (cross-region) を昇格、S3 CRR、Route 53 failover |

単一リージョン Multi-AZ で SLA 99.9% は達成可能。マルチリージョンは 99.99% 以上が必要な場合のみ。

## Cost Estimate (AWS ap-northeast-1, Single Region)

| Resource | Spec | Monthly (USD) |
|---|---|---|
| ECS Fargate (api x2) | 1 vCPU, 2 GB each | ~$60 |
| ECS Fargate (web x2) | 0.5 vCPU, 1 GB each | ~$30 |
| ECS Fargate (worker x1) | 0.5 vCPU, 1 GB | ~$15 |
| EC2 (LiveKit x2) | c6i.xlarge | ~$300 |
| EC2 (Egress x1) | c6i.large | ~$75 |
| RDS PostgreSQL | db.r6g.large, Multi-AZ | ~$400 |
| ElastiCache Valkey | cache.r6g.large, Multi-AZ | ~$250 |
| ALB + NLB | 2 LB | ~$50 |
| S3 + transfer | ~100 GB | ~$50 |
| NAT Gateway | 2 AZ | ~$90 |
| CloudWatch | Logs + Container Insights | ~$30 |
| Secrets Manager | 7 secrets | ~$3 |
| **Total** | | **~$1,350/mo** |

K8s (EKS $75/mo + 運用工数) より安く、運用もシンプル。Fargate はアイドル時の無駄が少ない。

## Checklist: Enterprise Readiness

### Infrastructure
- [ ] VPC + Subnet 構築 (Public / Private / Isolated, 2 AZ)
- [ ] Security Groups 作成
- [ ] RDS for PostgreSQL プロビジョニング (Multi-AZ, pgvector)
- [ ] ElastiCache for Valkey プロビジョニング (Multi-AZ)
- [ ] S3 バケット作成 (versioning, lifecycle, encryption)
- [ ] ACM 証明書発行
- [ ] ALB + NLB 構築
- [ ] ECS クラスタ作成 (Fargate + EC2 Capacity Provider)
- [ ] Cloud Map namespace 作成 (`echolore.internal`)
- [ ] NAT Gateway 作成

### Application
- [ ] ECR リポジトリ作成 (or GHCR からの pull 設定)
- [ ] Secrets Manager にシークレット格納
- [ ] IAM Roles 作成 (execution role, task roles)
- [ ] Task Definition 登録 (api, web, worker, livekit, egress)
- [ ] ECS Service 作成 + Auto Scaling 設定
- [ ] ALB Target Group + Listener Rules 設定
- [ ] admin 設定画面で S3 ストレージプロバイダーに切替
- [ ] DNS レコード設定 (Route 53 or 外部 DNS)

### Operations
- [ ] CloudWatch Log Groups 作成 + retention 設定
- [ ] Container Insights 有効化
- [ ] CloudWatch Alarms 設定 + SNS 通知先
- [ ] CI/CD パイプライン拡張 (ECR push + ECS deploy)
- [ ] DB マイグレーション RunTask 手順の確立
- [ ] RDS 自動バックアップ確認
- [ ] イメージスキャン (Trivy) を CI に追加
- [ ] IdP 連携 (SAML / OIDC) — 必要な場合

## Related Files

- `./system-architecture.md`
- `./contributing-deployment.md`
- `./observability-architecture.md`
- `./rollback-recovery-architecture.md`
- `./ops-runbook.md`
- `../DEPLOYMENT.md`
