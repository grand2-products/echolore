# Next.js App ページ構成

## ディレクトリ構造

```
apps/web/app/
├── (auth)/                          # 認証関連ルートグループ
│   └── login/
│       └── page.tsx                 # ログインページ
├── (main)/                          # メインアプリケーションルートグループ
│   ├── page.tsx                     # ホーム（Wiki一覧）
│   ├── wiki/
│   │   ├── [id]/
│   │   │   └── page.tsx             # Wikiページ表示・編集
│   │   └── new/
│   │       └── page.tsx             # 新規作成
│   ├── meetings/
│   │   ├── page.tsx                 # ミーティング一覧
│   │   ├── coworking/
│   │   │   └── page.tsx             # Everybody Coworkingモード
│   │   └── [id]/
│   │       └── page.tsx             # Roomモード（ビデオ会議ルーム）
│   └── search/
│       └── page.tsx                 # 検索ページ
├── api/                             # API Routes
│   ├── pages/
│   │   └── route.ts                 # Wiki CRUD API
│   ├── meetings/
│   │   └── route.ts                 # Meeting API
│   ├── search/
│   │   └── route.ts                 # 検索API
│   └── transcript/
│       └── route.ts                 # AI文字起こし・議事録API
└── layout.tsx                       # ルートレイアウト
```

## ページ一覧

### 認証関連 `(auth)` ルートグループ

| パス | ファイル | 説明 |
|------|----------|------|
| `/login` | `(auth)/login/page.tsx` | Google SSO ログインページ |

### メインアプリケーション `(main)` ルートグループ

| パス | ファイル | 説明 |
|------|----------|------|
| `/` | `(main)/page.tsx` | ホームページ - Wiki一覧表示 |
| `/wiki/[id]` | `(main)/wiki/[id]/page.tsx` | Wikiページ詳細表示・編集（TipTapエディタ） |
| `/wiki/new` | `(main)/wiki/new/page.tsx` | 新規Wikiページ作成 |
| `/meetings` | `(main)/meetings/page.tsx` | ミーティング一覧 |
| `/meetings/coworking` | `(main)/meetings/coworking/page.tsx` | **Everybody Coworkingモード** - 全社員の仮想オフィス空間 |
| `/meetings/[id]` | `(main)/meetings/[id]/page.tsx` | **Roomモード** - ビデオ会議ルーム（LiveKit + AI機能） |
| `/search` | `(main)/search/page.tsx` | フルテキスト検索ページ |

## API Routes

| パス | ファイル | 説明 |
|------|----------|------|
| `/api/pages` | `api/pages/route.ts` | Wikiページ CRUD API |
| `/api/meetings` | `api/meetings/route.ts` | ミーティング API |
| `/api/search` | `api/search/route.ts` | 検索 API |
| `/api/transcript` | `api/transcript/route.ts` | AI文字起こし・議事録生成 API |

## ルートグループの目的

### `(auth)` グループ
- 認証関連のページをグループ化
- 独立したレイアウト適用可能
- 認証が必要なページと分離

### `(main)` グループ
- メインアプリケーションのページをグループ化
- 共通のレイアウト（ヘッダー、サイドバー等）を適用
- 認証済みユーザー向けコンテンツ

## 動的ルート

### `/wiki/[id]`
- WikiページのIDをパラメータとして受け取る
- 例: `/wiki/abc123` → `params.id = "abc123"`

### `/meetings/[id]`
- ミーティングルームのIDをパラメータとして受け取る
- 例: `/meetings/room-456` → `params.id = "room-456"`

---

## 機能別詳細

### Wiki機能（TipTapエディタ）

#### 使用技術
- **エディタ**: TipTap 2.x（NotionライクなBlock-basedエディタ）
- **状態管理**: Zustand 4.x（軽量、persistミドルウェア）
- **データフェッチ**: TanStack Query 5.x（キャッシュ、再試行）

#### ブロックタイプ
- テキスト（段落、見出し1-3）
- リスト（箇条書き、番号付き）
- 画像（GCSアップロード）
- ファイル添付
- コードブロック
- 引用

#### データ構造
```typescript
// pages テーブル
interface Page {
  id: string;
  title: string;
  parent_id: string | null;
  author_id: string;
  created_at: Date;
  updated_at: Date;
}

// blocks テーブル
interface Block {
  id: string;
  page_id: string;
  type: 'text' | 'heading1' | 'heading2' | 'image' | 'file' | ...;
  content: string | object;
  sort_order: number;
}
```

---

### ミーティング機能（2モード構成）

#### Everybody Coworkingモード

| 項目 | 説明 |
|------|------|
| パス | `/meetings/coworking` |
| 用途 | 全社員の「顔」がリアルタイム更新される仮想オフィス空間 |
| 技術 | LiveKit（WebRTC） |
| 機能 | 在席状況可視化、ミュート状態表示、ワンクリック接続 |

**在席ステータス**
- オンライン（緑）
- 離席中（黄）
- オフライン（灰）

#### Roomモード

| 項目 | 説明 |
|------|------|
| パス | `/meetings/[id]` |
| 用途 | 必要に応じて作成する会議ルーム |
| 技術 | LiveKit + Google Cloud Speech-to-Text + Vertex AI |
| 機能 | 画面共有、AI文字起こし、議事録自動生成 |

**AI機能（Roomモード必須）**

| 機能 | 技術 | 説明 |
|------|------|------|
| 話者分離 | Speech-to-Text Diarization | 発話者を識別 |
| リアルタイム文字起こし | Google Cloud Speech-to-Text v2 | 日本語対応 |
| 録画 | LiveKit Egress | クラウド保存（GCS） |
| AI要約・議事録生成 | Vertex AI (Gemini) | 会議終了後に自動生成 |
| 議事録スタック | 自動 | Wikiページとして自動保存 |

**議事録フロー**
```
1. Room開始 → 録画・文字起こし開始
2. 会議中 → リアルタイム文字起こし表示
3. Room終了 → AI要約生成
4. 議事録自動作成 → Wikiにスタック
```

---

## コンポーネント構成

```
apps/web/
├── app/                    # ページ (上記参照)
├── components/
│   ├── ui/                 # 基本UIコンポーネント（共通）
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Avatar.tsx
│   │   └── ...
│   ├── wiki/               # Wiki関連コンポーネント
│   │   ├── WikiEditor.tsx        # TipTapベースエディタ
│   │   ├── WikiList.tsx          # ページ一覧
│   │   ├── WikiTree.tsx          # ページ階層ツリー
│   │   ├── BlockEditor.tsx       # ブロック編集
│   │   └── ...
│   ├── meetings/           # ミーティング関連コンポーネント
│   │   ├── MeetingRoom.tsx       # Roomモードメイン
│   │   ├── CoworkingSpace.tsx    # Everybody Coworkingメイン
│   │   ├── MeetingList.tsx       # ルーム一覧
│   │   ├── VideoCall.tsx         # LiveKit映像コンポーネント
│   │   ├── Transcript.tsx        # リアルタイム文字起こし表示
│   │   ├── StatusIndicator.tsx   # 在席ステータス表示
│   │   └── ...
│   ├── layout/             # レイアウトコンポーネント
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Footer.tsx
│   │   └── ...
│   └── shared/             # 共有コンポーネント（packages/uiから参照）
│       └── ...
├── lib/                    # ユーティリティ
│   ├── api.ts              # APIクライアント（fetchラッパー）
│   ├── auth.ts             # 認証関連（OAuth2 Proxy連携）
│   ├── livekit.ts          # LiveKitクライアント
│   ├── speech.ts           # Speech-to-Text連携
│   └── utils.ts            # 共通ユーティリティ
└── stores/                 # Zustandストア
    ├── wikiStore.ts        # Wiki状態管理
    ├── meetingStore.ts     # ミーティング状態管理
    └── userStore.ts        # ユーザー状態管理
```

---

## データフロー

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   Page.tsx   │────▶│   Server     │────▶│   Node.js    │     │
│  │  (Client)    │     │  Component   │     │   API (Hono) │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                    │                    │              │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ TanStack     │     │  fetch()     │     │  PostgreSQL  │     │
│  │ Query Cache  │     │  Server      │     │  Database    │     │
│  │  (Zustand)   │     │  Actions     │     │              │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 認証フロー

```
1. ユーザーが保護されたページにアクセス
2. OAuth2 Proxy が Google SSO 認証を要求
3. Google認証画面へリダイレクト
4. 認証成功後、コールバック受信
5. JWT トークンをCookieに設定
6. API リクエスト時にトークンを自動送信
7. Server Components でデータを取得・レンダリング
```

**認証ドメイン制限**
- `@grand2-products.com` のみアクセス許可

---

## 技術スタック関連

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フロントエンド | Next.js 15.x | App Router |
| UIライブラリ | React 19.x | Server Components対応 |
| スタイリング | Tailwind CSS 3.x | ユーティリティファースト |
| エディタ | TipTap 2.x | NotionライクBlock-based |
| 状態管理 | Zustand 4.x | 軽量、persist対応 |
| データフェッチ | TanStack Query 5.x | キャッシュ、再試行 |
| WebRTC | LiveKit | ビデオ通話 |
| バリデーション | Zod 3.x | 型推論、スキーマ検証 |

---

## APIエンドポイント一覧（Hono API）

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
├── /transcript
│   ├── POST   /              # 文字起こし開始
│   ├── GET    /:id           # 文字起こし取得
│   └── POST   /:id/summary   # AI要約生成
└── /upload
    └── POST   /              # ファイルアップロード (GCS)
```

---

## 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | ページ読み込み < 2秒 |
| 可用性 | 99.9%以上 |
| 同時接続数 | 100名対応 |
| データ保持 | 無期限（DBバックアップあり） |
| セキュリティ | HTTPS必須、SSO認証 |

## ディレクトリ構造

```
apps/web/app/
├── (auth)/                          # 認証関連ルートグループ
│   └── login/
│       └── page.tsx                 # ログインページ
├── (main)/                          # メインアプリケーションルートグループ
│   ├── page.tsx                     # ホーム（Wiki一覧）
│   ├── wiki/
│   │   ├── [id]/
│   │   │   └── page.tsx             # Wikiページ表示・編集
│   │   └── new/
│   │       └── page.tsx             # 新規作成
│   ├── meetings/
│   │   ├── page.tsx                 # ミーティング一覧
│   │   ├── coworking/
│   │   │   └── page.tsx             # Everybody Coworkingモード
│   │   └── [id]/
│   │       └── page.tsx             # Roomモード（ビデオ会議ルーム）
│   └── search/
│       └── page.tsx                 # 検索ページ
├── api/                             # API Routes
│   ├── pages/
│   │   └── route.ts                 # Wiki CRUD API
│   ├── meetings/
│   │   └── route.ts                 # Meeting API
│   ├── search/
│   │   └── route.ts                 # 検索API
│   └── transcript/
│       └── route.ts                 # AI文字起こし・議事録API
└── layout.tsx                       # ルートレイアウト
```

## ページ一覧

### 認証関連 `(auth)` ルートグループ

| パス | ファイル | 説明 |
|------|----------|------|
| `/login` | `(auth)/login/page.tsx` | Google SSO ログインページ |

### メインアプリケーション `(main)` ルートグループ

| パス | ファイル | 説明 |
|------|----------|------|
| `/` | `(main)/page.tsx` | ホームページ - Wiki一覧表示 |
| `/wiki/[id]` | `(main)/wiki/[id]/page.tsx` | Wikiページ詳細表示・編集（TipTapエディタ） |
| `/wiki/new` | `(main)/wiki/new/page.tsx` | 新規Wikiページ作成 |
| `/meetings` | `(main)/meetings/page.tsx` | ミーティング一覧 |
| `/meetings/coworking` | `(main)/meetings/coworking/page.tsx` | **Everybody Coworkingモード** - 全社員の仮想オフィス空間 |
| `/meetings/[id]` | `(main)/meetings/[id]/page.tsx` | **Roomモード** - ビデオ会議ルーム（LiveKit + AI機能） |
| `/search` | `(main)/search/page.tsx` | フルテキスト検索ページ |

## API Routes

| パス | ファイル | 説明 |
|------|----------|------|
| `/api/pages` | `api/pages/route.ts` | Wikiページ CRUD API |
| `/api/meetings` | `api/meetings/route.ts` | ミーティング API |
| `/api/search` | `api/search/route.ts` | 検索 API |
| `/api/transcript` | `api/transcript/route.ts` | AI文字起こし・議事録生成 API |

## ルートグループの目的

### `(auth)` グループ
- 認証関連のページをグループ化
- 独立したレイアウト適用可能
- 認証が必要なページと分離

### `(main)` グループ
- メインアプリケーションのページをグループ化
- 共通のレイアウト（ヘッダー、サイドバー等）を適用
- 認証済みユーザー向けコンテンツ

## 動的ルート

### `/wiki/[id]`
- WikiページのIDをパラメータとして受け取る
- 例: `/wiki/abc123` → `params.id = "abc123"`

### `/meetings/[id]`
- ミーティングルームのIDをパラメータとして受け取る
- 例: `/meetings/room-456` → `params.id = "room-456"`

---

## 機能別詳細

### Wiki機能（TipTapエディタ）

#### 使用技術
- **エディタ**: TipTap 2.x（NotionライクなBlock-basedエディタ）
- **状態管理**: Zustand 4.x（軽量、persistミドルウェア）
- **データフェッチ**: TanStack Query 5.x（キャッシュ、再試行）

#### ブロックタイプ
- テキスト（段落、見出し1-3）
- リスト（箇条書き、番号付き）
- 画像（GCSアップロード）
- ファイル添付
- コードブロック
- 引用

#### データ構造
```typescript
// pages テーブル
interface Page {
  id: string;
  title: string;
  parent_id: string | null;
  author_id: string;
  created_at: Date;
  updated_at: Date;
}

// blocks テーブル
interface Block {
  id: string;
  page_id: string;
  type: 'text' | 'heading1' | 'heading2' | 'image' | 'file' | ...;
  content: string | object;
  sort_order: number;
}
```

---

### ミーティング機能（2モード構成）

#### Everybody Coworkingモード

| 項目 | 説明 |
|------|------|
| パス | `/meetings/coworking` |
| 用途 | 全社員の「顔」がリアルタイム更新される仮想オフィス空間 |
| 技術 | LiveKit（WebRTC） |
| 機能 | 在席状況可視化、ミュート状態表示、ワンクリック接続 |

**在席ステータス**
- オンライン（緑）
- 離席中（黄）
- オフライン（灰）

#### Roomモード

| 項目 | 説明 |
|------|------|
| パス | `/meetings/[id]` |
| 用途 | 必要に応じて作成する会議ルーム |
| 技術 | LiveKit + Google Cloud Speech-to-Text + Vertex AI |
| 機能 | 画面共有、AI文字起こし、議事録自動生成 |

**AI機能（Roomモード必須）**

| 機能 | 技術 | 説明 |
|------|------|------|
| 話者分離 | Speech-to-Text Diarization | 発話者を識別 |
| リアルタイム文字起こし | Google Cloud Speech-to-Text v2 | 日本語対応 |
| 録画 | LiveKit Egress | クラウド保存（GCS） |
| AI要約・議事録生成 | Vertex AI (Gemini) | 会議終了後に自動生成 |
| 議事録スタック | 自動 | Wikiページとして自動保存 |

**議事録フロー**
```
1. Room開始 → 録画・文字起こし開始
2. 会議中 → リアルタイム文字起こし表示
3. Room終了 → AI要約生成
4. 議事録自動作成 → Wikiにスタック
```

---

## コンポーネント構成

```
apps/web/
├── app/                    # ページ (上記参照)
├── components/
│   ├── ui/                 # 基本UIコンポーネント（共通）
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Avatar.tsx
│   │   └── ...
│   ├── wiki/               # Wiki関連コンポーネント
│   │   ├── WikiEditor.tsx        # TipTapベースエディタ
│   │   ├── WikiList.tsx          # ページ一覧
│   │   ├── WikiTree.tsx          # ページ階層ツリー
│   │   ├── BlockEditor.tsx       # ブロック編集
│   │   └── ...
│   ├── meetings/           # ミーティング関連コンポーネント
│   │   ├── MeetingRoom.tsx       # Roomモードメイン
│   │   ├── CoworkingSpace.tsx    # Everybody Coworkingメイン
│   │   ├── MeetingList.tsx       # ルーム一覧
│   │   ├── VideoCall.tsx         # LiveKit映像コンポーネント
│   │   ├── Transcript.tsx        # リアルタイム文字起こし表示
│   │   ├── StatusIndicator.tsx   # 在席ステータス表示
│   │   └── ...
│   ├── layout/             # レイアウトコンポーネント
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Footer.tsx
│   │   └── ...
│   └── shared/             # 共有コンポーネント（packages/uiから参照）
│       └── ...
├── lib/                    # ユーティリティ
│   ├── api.ts              # APIクライアント（fetchラッパー）
│   ├── auth.ts             # 認証関連（OAuth2 Proxy連携）
│   ├── livekit.ts          # LiveKitクライアント
│   ├── speech.ts           # Speech-to-Text連携
│   └── utils.ts            # 共通ユーティリティ
└── stores/                 # Zustandストア
    ├── wikiStore.ts        # Wiki状態管理
    ├── meetingStore.ts     # ミーティング状態管理
    └── userStore.ts        # ユーザー状態管理
```

---

## データフロー

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App Router                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │   Page.tsx   │────▶│   Server     │────▶│   Node.js    │     │
│  │  (Client)    │     │  Component   │     │   API (Hono) │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│         │                    │                    │              │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ TanStack     │     │  fetch()     │     │  PostgreSQL  │     │
│  │ Query Cache  │     │  Server      │     │  Database    │     │
│  │  (Zustand)   │     │  Actions     │     │              │     │
│  └──────────────┘     └──────────────┘     └──────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 認証フロー

```
1. ユーザーが保護されたページにアクセス
2. OAuth2 Proxy が Google SSO 認証を要求
3. Google認証画面へリダイレクト
4. 認証成功後、コールバック受信
5. JWT トークンをCookieに設定
6. API リクエスト時にトークンを自動送信
7. Server Components でデータを取得・レンダリング
```

**認証ドメイン制限**
- `@grand2-products.com` のみアクセス許可

---

## 技術スタック関連

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フロントエンド | Next.js 15.x | App Router |
| UIライブラリ | React 19.x | Server Components対応 |
| スタイリング | Tailwind CSS 3.x | ユーティリティファースト |
| エディタ | TipTap 2.x | NotionライクBlock-based |
| 状態管理 | Zustand 4.x | 軽量、persist対応 |
| データフェッチ | TanStack Query 5.x | キャッシュ、再試行 |
| WebRTC | LiveKit | ビデオ通話 |
| バリデーション | Zod 3.x | 型推論、スキーマ検証 |

---

## APIエンドポイント一覧（Hono API）

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
├── /transcript
│   ├── POST   /              # 文字起こし開始
│   ├── GET    /:id           # 文字起こし取得
│   └── POST   /:id/summary   # AI要約生成
└── /upload
    └── POST   /              # ファイルアップロード (GCS)
```

---

## 非機能要件

| 項目 | 要件 |
|------|------|
| パフォーマンス | ページ読み込み < 2秒 |
| 可用性 | 99.9%以上 |
| 同時接続数 | 100名対応 |
| データ保持 | 無期限（DBバックアップあり） |
| セキュリティ | HTTPS必須、SSO認証 |

