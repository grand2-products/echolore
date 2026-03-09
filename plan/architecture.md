# アーキテクチャ設計

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        Users (社員)                              │
│                    Google Account Holder                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cloudflare Network (Edge)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Cloudflare Access                           │    │
│  │         • Google SSO Authentication                      │    │
│  │         • Email domain restriction                       │    │
│  │         • Session management                             │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │              Cloudflare Pages                            │    │
│  │         • Next.js 14 (App Router)                        │    │
│  │         • React Server Components                        │    │
│  │         • Static assets + Edge caching                   │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │              Cloudflare Workers                          │    │
│  │         • REST API endpoints                             │    │
│  │         • Business logic                                 │    │
│  │         • Real-time collaboration (Durable Objects)      │    │
│  └──────┬───────────────────────────────────┬──────────────┘    │
│         │                                   │                    │
│         ▼                                   ▼                    │
│  ┌─────────────┐                    ┌─────────────────┐         │
│  │     D1      │                    │    R2 Storage   │         │
│  │   (SQLite)  │                    │                 │         │
│  │             │                    │ • 画像ファイル   │         │
│  │ • Users     │                    │ • 添付ファイル   │         │
│  │ • Pages     │                    │ • アイコン等     │         │
│  │ • Blocks    │                    └─────────────────┘         │
│  │ • Meetings  │                                                │
│  └─────────────┘                                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Cloudflare Calls                            │    │
│  │         • WebRTC SFU                                     │    │
│  │         • Video/Audio streaming                          │    │
│  │         • Screen sharing                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 2. コンポーネント詳細

### 2.1 Cloudflare Access (認証層)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   User      │────▶│  Access Policy   │────▶│   Google    │
│  Browser    │     │  (Email domain)  │     │   OAuth     │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  JWT Token    │
                    │  (Session)    │
                    └───────────────┘
```

**設定例:**
```toml
# wrangler.toml
[[access]]
required = true
policies = ["internal-users"]

[[access.policies]]
name = "internal-users"
include = [{ email_domain = ["grand2-products.com"] }]
```

### 2.2 Cloudflare Pages + Next.js (フロントエンド層)

**構成:**
- Next.js 14 (App Router)
- React Server Components (SSR)
- Client Components (インタラクティブ部分)

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

### 2.3 Cloudflare Workers (API層)

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
    └── POST   /              # ファイルアップロード (R2)
```

### 2.4 Cloudflare D1 (データベース層)

**スキーマ設計:**

```sql
-- ユーザー
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT DEFAULT 'member', -- admin, member
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Wikiページ
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    parent_id TEXT REFERENCES pages(id),
    author_id TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ブロック (Notionライク)
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- text, heading1, heading2, image, file, etc.
    content TEXT, -- JSON or plain text
    sort_order INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ミーティング
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    creator_id TEXT REFERENCES users(id),
    status TEXT DEFAULT 'scheduled', -- scheduled, active, ended
    started_at DATETIME,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ファイル
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    r2_key TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_sort ON blocks(page_id, sort_order);
```

### 2.5 Cloudflare R2 (ストレージ層)

**バケット構成:**
```
corp-internal-files/
├── images/
│   ├── avatars/
│   └── wiki/
└── attachments/
```

**アクセスパターン:**
- Workers API経由でアップロード/ダウンロード
- 署名付きURLは不要（Accessで認証済み）
- 直接R2アクセスはWorker経由のみ

### 2.6 Cloudflare Calls (WebRTC層)

**構成:**
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Participant│────▶│  Cloudflare      │────▶│  SFU Server │
│    (User)   │     │  Calls API       │     │  (Edge)     │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Session Token│
                    │  (JWT)        │
                    └───────────────┘
```

**実装フロー:**
1. フロントエンド: ミーティングルーム参加リクエスト
2. Workers: Cloudflare Calls APIでセッショントークン発行
3. フロントエンド: トークンでWebRTC接続確立
4. SFU経由で全参加者と音声/動画ストリーミング

## 3. データフロー

### 3.1 Wikiページ作成フロー

```
User                 Frontend           Worker              D1          R2
 │                      │                 │                  │           │
 │───入力(テキスト/画像)─▶│                 │                  │           │
 │                      │                 │                  │           │
 │                      │─画像アップロード▶│                  │           │
 │                      │                 │─────保存──────────────────────▶│
 │                      │                 │◀────R2 key───────────────────│
 │                      │◀──R2 key────────│                  │           │
 │                      │                 │                  │           │
 │                      │─POST /api/pages▶│                  │           │
 │                      │                 │─INSERT page/blocks▶           │
 │                      │                 │                  │           │
 │                      │◀──page id───────│◀─────成功────────│           │
 │◀───リダイレクト───────│                 │                  │           │
```

### 3.2 ビデオ会議参加フロー

```
User              Frontend          Worker         Calls API        SFU
 │                   │                │               │              │
 │─ルームクリック────▶│                │               │              │
 │                   │─GET session───▶│               │              │
 │                   │                │─Create Session▶│             │
 │                   │                │◀──session token│             │
 │                   │◀─session token─│               │              │
 │                   │                │               │              │
 │                   │────────────────────Connect────────────────────▶│
 │◀────────────────────────WebRTC Stream─────────────────────────────│
```

## 4. セキュリティ設計

### 4.1 認証・認可

| 層 | 手法 |
|----|------|
| ネットワーク | Cloudflare Access (Google SSO) |
| API | JWT検証 (Worker内) |
| データベース | ユーザーIDベースの行レベルアクセス制御 |

### 4.2 データ保護

- 通信: 全トラフィックHTTPS (Cloudflare自動)
- DB: D1は暗号化（デフォルト）
- R2: バケットポリシーでWorker経由のみアクセス許可

### 4.3 監査

- Workers ログ (Cloudflare Dashboard)
- Access ログ (ログイン履歴)
