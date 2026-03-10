# 社内Wiki 仕様書

## 1. 概要

NotionライクなBlock-basedエディタを持つ社内Wikiシステム。Room議事録の自動スタック機能、パーソナルページ、フォルダによる階層管理を含む。

## 2. 機能一覧

### 2.1 スペース・フォルダ構成

#### スペース类型

| スペース | 説明 | アクセス権限 |
|---------|------|-------------|
| **全社** | 全社員アクセス可能 | 全員閲覧・編集 |
| **チーム** | 特定チーム用 | チームメンバーのみ |
| **個人** | パーソナルページ | 本人のみ |

#### 初期フォルダ構成

```
📁 全社/
├── 📁 お知らせ/
├── 📁 ガイドライン/
├── 📁 テンプレート/
└── 📁 ミーティング議事録/
    ├── 📁 2024/
    │   ├── 📁 01/
    │   ├── 📁 02/
    │   └── 📁 03/

📁 チーム/
├── 📁 エンジニアリング/
│   ├── 📁 技術ドキュメント/
│   ├── 📁 インフラ/
│   └── 📁 開発プロセス/
├── 📁 デザイン/
├── 📁 マーケティング/
└── 📁 営業/

📁 個人/
├── 📁 [ユーザー名]/
│   ├── 📄 メモ/
│   ├── 📁 下書き/
│   └── 📁 ブックマーク/
└── 📁 [ユーザー名]/
    └── ...
```

### 2.2 パーソナルページ

#### 機能概要

各ユーザーが独自に管理できる個人用Wikiスペース。

| 機能 | 説明 |
|------|------|
| 个人トップページ | `/personal/[username]` でアクセス |
| メモ・下書き | 公開前のドラフト保存 |
| ブックマーク | 他ページへのショートカット |
| タスク管理 | 個人タスクのメモ |
| プロフィール | 自己紹介ページ |

#### パーソナルページ構成例

```
/personal/tanaka-taro/
├── 📄 ダッシュボード        # 個人トップページ
├── 📁 メモ/
│   ├── 📄 アイデアメモ
│   └── 📄 読書メモ
├── 📁 下書き/
│   └── 📄 提案書ドラフト
├── 📁 ブックマーク/
│   └── 🔗 プロジェクトXへのリンク
└── 📄 プロフィール          # 公開可能
```

#### アクセス制御

| 項目 | 設定 |
|------|------|
| デフォルト | 非公開（本人のみ） |
| 公開設定 | オプションで他ユーザーに公開可能 |
| 管理者権限 | 管理者は全ページアクセス可能 |

### 2.3 フォルダ管理

| 機能 | 説明 |
|------|------|
| フォルダ作成 | 新規フォルダ作成 |
| フォルダ移動 | ドラッグ&ドロップで移動 |
| フォルダ削除 | 中身ごと削除（確認ダイアログ） |
| アイコン設定 | 絵文字アイコン割り当て |
| 色分け | フォルダカラー設定 |

### 2.4 ページ管理

| 機能 | 説明 |
|------|------|
| ページ作成 | 新規Wikiページ作成 |
| ページ編集 | 既存ページの編集 |
| ページ削除 | ページ削除（子ページ含む） |
| ページ移動 | ページの階層移動 |
| 複製 | ページのコピー |

### 2.5 ブロックエディタ (TipTap)

#### 対応ブロック类型

| ブロック类型 | 説明 |
|-------------|------|
| paragraph | 標準テキスト |
| heading1-3 | 見出し (H1-H3) |
| bulletList | 箇条書き |
| orderedList | 番号付きリスト |
| codeBlock | コードブロック |
| blockquote | 引用 |
| image | 画像 (GCS保存) |
| file | 添付ファイル (GCS保存) |
| divider | 区切り線 |
| callout | コールアウトボックス |
| toggle | 折りたたみブロック |

#### エディタ機能

| 機能 | 説明 |
|------|------|
| リアルタイムプレビュー | 編集中の即時反映 |
| Markdownショートカット | `#`, `-`, `1.` など |
| キーボードショートカット | `Ctrl+B` (太字), `Ctrl+I` (斜体) |
| ドラッグ&ドロップ | ブロック順序変更 |
| スラッシュコマンド | `/` でブロック挿入 |
| 自動保存 | 変更後自動保存 |

### 2.6 ファイル管理

| 機能 | 説明 |
|------|------|
| 画像アップロード | Drag & Drop / Paste / ファイル選択 |
| ファイルアップロード | PDF, Office文件など |
| サイズ制限 | 1ファイル最大10MB |
| 保存先 | Google Cloud Storage |

### 2.7 検索機能

| 機能 | 説明 |
|------|------|
| フルテキスト検索 | PostgreSQL全文検索 |
| タイトル検索 | ページタイトル検索 |
| コンテンツ検索 | ブロック内容検索 |
| スペース絞り込み | 特定スペース内で検索 |
| 日本語対応 | `to_tsvector('japanese', ...)` |

### 2.8 議事録連携

Roomモードで生成された議事録は自動的にWikiページとして作成:

```
/全社/ミーティング議事録/2024/03/2024-03-15_定例会議/
├── 📄 議事録.md (自動生成)
├── 🔗 録画.mp4 (リンク)
└── 📄 文字起こし.txt (全文)
```

## 3. データベーススキーマ

```sql
-- スペース
CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'company', 'team', 'personal'
    owner_id TEXT REFERENCES users(id), -- personalの場合の所有者
    icon TEXT, -- 絵文字アイコン
    color TEXT, -- カラー
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- フォルダ
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    parent_id TEXT REFERENCES folders(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wikiページ
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    space_id TEXT REFERENCES spaces(id),
    folder_id TEXT REFERENCES folders(id),
    parent_id TEXT REFERENCES pages(id),
    author_id TEXT REFERENCES users(id),
    is_public BOOLEAN DEFAULT false, -- パーソナルページの公開設定
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ブロック (Notionライク)
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ファイル
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    gcs_path TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_folders_space ON folders(space_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_pages_space ON pages(space_id);
CREATE INDEX idx_pages_folder ON pages(folder_id);
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_sort ON blocks(page_id, sort_order);

-- 全文検索
CREATE INDEX idx_pages_title_search ON pages USING gin(to_tsvector('japanese', title));
CREATE INDEX idx_blocks_content_search ON blocks USING gin(to_tsvector('japanese', content));
```

## 4. API エンドポイント

```
/api
├── /spaces
│   ├── GET    /                      # スペース一覧
│   ├── POST   /                      # スペース作成 (admin)
│   └── GET    /:id                   # スペース詳細
├── /folders
│   ├── GET    /?space_id=:id         # フォルダ一覧
│   ├── POST   /                      # フォルダ作成
│   ├── PUT    /:id                   # フォルダ更新
│   ├── DELETE /:id                   # フォルダ削除
│   └── PUT    /:id/move              # フォルダ移動
├── /pages
│   ├── GET    /?folder_id=:id        # ページ一覧
│   ├── POST   /                      # ページ作成
│   ├── GET    /:id                   # ページ取得
│   ├── PUT    /:id                   # ページ更新
│   ├── DELETE /:id                   # ページ削除
│   ├── GET    /:id/blocks            # ブロック一覧
│   ├── PUT    /:id/move              # ページ移動
│   └── POST   /:id/duplicate         # ページ複製
├── /personal
│   ├── GET    /:username             # パーソナルページトップ
│   └── PUT    /:username/settings    # 公開設定
├── /blocks
│   ├── POST   /                      # ブロック作成
│   ├── PUT    /:id                   # ブロック更新
│   ├── DELETE /:id                   # ブロック削除
│   └── PUT    /:id/order             # ブロック順序変更
├── /search
│   └── GET    /?q=:query&space=:id   # フルテキスト検索
└── /upload
    └── POST   /                      # ファイルアップロード (GCS)
```

## 5. UI構成

### 5.1 画面レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [ユーザー] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # ページタイトル                    [編集] [⋯] │
│   📁 お知らせ │                                                  │
│   📁 ガイドライン│  テキストブロックのサンプルです。              │
│   📁 議事録   │                                                  │
│              │  ## 見出し2                                      │
│ 👥 チーム    │                                                  │
│   📁 エンジニア│  - 箇条書き1                                    │
│   📁 デザイン │  - 箇条書き2                                    │
│   📁 マーケ  │                                                  │
│              │  > コールアウト                                  │
│ 👤 個人      │                                                  │
│   📁 田中太郎 │  [ブロックを追加]                                │
│     📄 メモ  │                                                  │
│     📁 下書き │                                                  │
│              │                                                  │
│ [+ 新規作成] │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.2 パーソナルページ

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [田中太郎] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # 田中太郎のワークスペース           [設定]    │
│   ...        │                                                  │
│              │  ## 📌 ピン留め                                   │
│ 👤 個人      │  ┌────────────────────────────────────────────┐ │
│   📁 田中太郎 │  │ 📄 今週のタスク                            │ │
│     📄 ダッシュボード│  │ 📄 提案書ドラフト                          │ │
│     📁 メモ   │  └────────────────────────────────────────────┘ │
│       📄 アイデア│                                                  │
│       📄 読書メモ│  ## 📁 最近の編集                               │
│     📁 下書き │  ┌────────────────────────────────────────────┐ │
│       📄 提案書│  │ 📄 メモ (2分前)                            │ │
│     📁 ブックマーク│  │ 📄 プロフィール (昨日)                     │ │
│     📄 プロフィール│  └────────────────────────────────────────────┘ │
│              │                                                  │
│ [+ 新規作成] │  [公開設定: 🔒 非公開 ▼]                        │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.3 コンポーネント構成

```
components/
├── wiki/
│   ├── Sidebar.tsx           # サイドバー（スペース・フォルダツリー）
│   ├── SpaceSelector.tsx     # スペース切り替え
│   ├── FolderTree.tsx        # フォルダツリー
│   ├── PageList.tsx          # ページ一覧
│   ├── PageEditor.tsx        # ブロックエディタ
│   ├── BlockComponent.tsx    # 各ブロックタイプの表示
│   ├── SlashCommand.tsx      # スラッシュコマンドメニュー
│   ├── Toolbar.tsx           # フォーマットツールバー
│   ├── SearchBar.tsx         # 検索バー
│   ├── PersonalDashboard.tsx # パーソナルページダッシュボード
│   └── VisibilityToggle.tsx  # 公開/非公開設定
```

## 6. 技術仕様

### 6.1 使用ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| エディタ | TipTap 2.x | Block-basedエディタ |
| スタイリング | Tailwind CSS 4.x | UIスタイリング |
| 状態管理 | Zustand 5.x | エディタ状態管理 |
| データフェッチ | TanStack Query 5.x | キャッシュ・再試行 |
| ドラッグ&ドロップ | @dnd-kit/core | フォルダ・ページ移動 |

### 6.2 TipTap拡張構成

```typescript
// apps/web/lib/editor/extensions.ts
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlock from '@tiptap/extension-code-block'
import Toggle from './extensions/toggle'

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Image.configure({
    HTMLAttributes: { class: 'rounded-lg max-w-full' },
  }),
  Link.configure({
    openOnClick: true,
  }),
  Placeholder.configure({
    placeholder: '入力を開始するか、/ でコマンドを表示...',
  }),
  CodeBlock,
  Toggle,
]
```

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| ページ読み込み | < 2秒 |
| 保存レスポンス | < 500ms |
| 検索レスポンス | < 1秒 |
| 同時編集者 | 10名/ページ |
| 最大ページ数 | 無制限 |
| 最大ブロック数 | 1000/ページ |
| 最大フォルダ階層 | 10階層 |

## 8. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| リアルタイム共同編集 | 複数人同時編集 | 高 |
| コメント機能 | ブロック単位でコメント | 中 |
| バージョン履歴 | 編集履歴・復元 | 中 |
| テンプレート | ページテンプレート | 中 |
| エクスポート | PDF/Markdown出力 | 低 |
| タグ機能 | ページタグ付け | 低 |
| お気に入り | ページのお気に入り登録 | 低 |
| ピン留め | サイドバーにピン留め | 低 |

## 1. 概要

NotionライクなBlock-basedエディタを持つ社内Wikiシステム。Room議事録の自動スタック機能、パーソナルページ、フォルダによる階層管理を含む。

## 2. 機能一覧

### 2.1 スペース・フォルダ構成

#### スペース类型

| スペース | 説明 | アクセス権限 |
|---------|------|-------------|
| **全社** | 全社員アクセス可能 | 全員閲覧・編集 |
| **チーム** | 特定チーム用 | チームメンバーのみ |
| **個人** | パーソナルページ | 本人のみ |

#### 初期フォルダ構成

```
📁 全社/
├── 📁 お知らせ/
├── 📁 ガイドライン/
├── 📁 テンプレート/
└── 📁 ミーティング議事録/
    ├── 📁 2024/
    │   ├── 📁 01/
    │   ├── 📁 02/
    │   └── 📁 03/

📁 チーム/
├── 📁 エンジニアリング/
│   ├── 📁 技術ドキュメント/
│   ├── 📁 インフラ/
│   └── 📁 開発プロセス/
├── 📁 デザイン/
├── 📁 マーケティング/
└── 📁 営業/

📁 個人/
├── 📁 [ユーザー名]/
│   ├── 📄 メモ/
│   ├── 📁 下書き/
│   └── 📁 ブックマーク/
└── 📁 [ユーザー名]/
    └── ...
```

### 2.2 パーソナルページ

#### 機能概要

各ユーザーが独自に管理できる個人用Wikiスペース。

| 機能 | 説明 |
|------|------|
| 个人トップページ | `/personal/[username]` でアクセス |
| メモ・下書き | 公開前のドラフト保存 |
| ブックマーク | 他ページへのショートカット |
| タスク管理 | 個人タスクのメモ |
| プロフィール | 自己紹介ページ |

#### パーソナルページ構成例

```
/personal/tanaka-taro/
├── 📄 ダッシュボード        # 個人トップページ
├── 📁 メモ/
│   ├── 📄 アイデアメモ
│   └── 📄 読書メモ
├── 📁 下書き/
│   └── 📄 提案書ドラフト
├── 📁 ブックマーク/
│   └── 🔗 プロジェクトXへのリンク
└── 📄 プロフィール          # 公開可能
```

#### アクセス制御

| 項目 | 設定 |
|------|------|
| デフォルト | 非公開（本人のみ） |
| 公開設定 | オプションで他ユーザーに公開可能 |
| 管理者権限 | 管理者は全ページアクセス可能 |

### 2.3 フォルダ管理

| 機能 | 説明 |
|------|------|
| フォルダ作成 | 新規フォルダ作成 |
| フォルダ移動 | ドラッグ&ドロップで移動 |
| フォルダ削除 | 中身ごと削除（確認ダイアログ） |
| アイコン設定 | 絵文字アイコン割り当て |
| 色分け | フォルダカラー設定 |

### 2.4 ページ管理

| 機能 | 説明 |
|------|------|
| ページ作成 | 新規Wikiページ作成 |
| ページ編集 | 既存ページの編集 |
| ページ削除 | ページ削除（子ページ含む） |
| ページ移動 | ページの階層移動 |
| 複製 | ページのコピー |

### 2.5 ブロックエディタ (TipTap)

#### 対応ブロック类型

| ブロック类型 | 説明 |
|-------------|------|
| paragraph | 標準テキスト |
| heading1-3 | 見出し (H1-H3) |
| bulletList | 箇条書き |
| orderedList | 番号付きリスト |
| codeBlock | コードブロック |
| blockquote | 引用 |
| image | 画像 (GCS保存) |
| file | 添付ファイル (GCS保存) |
| divider | 区切り線 |
| callout | コールアウトボックス |
| toggle | 折りたたみブロック |

#### エディタ機能

| 機能 | 説明 |
|------|------|
| リアルタイムプレビュー | 編集中の即時反映 |
| Markdownショートカット | `#`, `-`, `1.` など |
| キーボードショートカット | `Ctrl+B` (太字), `Ctrl+I` (斜体) |
| ドラッグ&ドロップ | ブロック順序変更 |
| スラッシュコマンド | `/` でブロック挿入 |
| 自動保存 | 変更後自動保存 |

### 2.6 ファイル管理

| 機能 | 説明 |
|------|------|
| 画像アップロード | Drag & Drop / Paste / ファイル選択 |
| ファイルアップロード | PDF, Office文件など |
| サイズ制限 | 1ファイル最大10MB |
| 保存先 | Google Cloud Storage |

### 2.7 検索機能

| 機能 | 説明 |
|------|------|
| フルテキスト検索 | PostgreSQL全文検索 |
| タイトル検索 | ページタイトル検索 |
| コンテンツ検索 | ブロック内容検索 |
| スペース絞り込み | 特定スペース内で検索 |
| 日本語対応 | `to_tsvector('japanese', ...)` |

### 2.8 議事録連携

Roomモードで生成された議事録は自動的にWikiページとして作成:

```
/全社/ミーティング議事録/2024/03/2024-03-15_定例会議/
├── 📄 議事録.md (自動生成)
├── 🔗 録画.mp4 (リンク)
└── 📄 文字起こし.txt (全文)
```

## 3. データベーススキーマ

```sql
-- スペース
CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'company', 'team', 'personal'
    owner_id TEXT REFERENCES users(id), -- personalの場合の所有者
    icon TEXT, -- 絵文字アイコン
    color TEXT, -- カラー
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- フォルダ
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    parent_id TEXT REFERENCES folders(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wikiページ
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    space_id TEXT REFERENCES spaces(id),
    folder_id TEXT REFERENCES folders(id),
    parent_id TEXT REFERENCES pages(id),
    author_id TEXT REFERENCES users(id),
    is_public BOOLEAN DEFAULT false, -- パーソナルページの公開設定
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ブロック (Notionライク)
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ファイル
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    gcs_path TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_folders_space ON folders(space_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_pages_space ON pages(space_id);
CREATE INDEX idx_pages_folder ON pages(folder_id);
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_sort ON blocks(page_id, sort_order);

-- 全文検索
CREATE INDEX idx_pages_title_search ON pages USING gin(to_tsvector('japanese', title));
CREATE INDEX idx_blocks_content_search ON blocks USING gin(to_tsvector('japanese', content));
```

## 4. API エンドポイント

```
/api
├── /spaces
│   ├── GET    /                      # スペース一覧
│   ├── POST   /                      # スペース作成 (admin)
│   └── GET    /:id                   # スペース詳細
├── /folders
│   ├── GET    /?space_id=:id         # フォルダ一覧
│   ├── POST   /                      # フォルダ作成
│   ├── PUT    /:id                   # フォルダ更新
│   ├── DELETE /:id                   # フォルダ削除
│   └── PUT    /:id/move              # フォルダ移動
├── /pages
│   ├── GET    /?folder_id=:id        # ページ一覧
│   ├── POST   /                      # ページ作成
│   ├── GET    /:id                   # ページ取得
│   ├── PUT    /:id                   # ページ更新
│   ├── DELETE /:id                   # ページ削除
│   ├── GET    /:id/blocks            # ブロック一覧
│   ├── PUT    /:id/move              # ページ移動
│   └── POST   /:id/duplicate         # ページ複製
├── /personal
│   ├── GET    /:username             # パーソナルページトップ
│   └── PUT    /:username/settings    # 公開設定
├── /blocks
│   ├── POST   /                      # ブロック作成
│   ├── PUT    /:id                   # ブロック更新
│   ├── DELETE /:id                   # ブロック削除
│   └── PUT    /:id/order             # ブロック順序変更
├── /search
│   └── GET    /?q=:query&space=:id   # フルテキスト検索
└── /upload
    └── POST   /                      # ファイルアップロード (GCS)
```

## 5. UI構成

### 5.1 画面レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [ユーザー] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # ページタイトル                    [編集] [⋯] │
│   📁 お知らせ │                                                  │
│   📁 ガイドライン│  テキストブロックのサンプルです。              │
│   📁 議事録   │                                                  │
│              │  ## 見出し2                                      │
│ 👥 チーム    │                                                  │
│   📁 エンジニア│  - 箇条書き1                                    │
│   📁 デザイン │  - 箇条書き2                                    │
│   📁 マーケ  │                                                  │
│              │  > コールアウト                                  │
│ 👤 個人      │                                                  │
│   📁 田中太郎 │  [ブロックを追加]                                │
│     📄 メモ  │                                                  │
│     📁 下書き │                                                  │
│              │                                                  │
│ [+ 新規作成] │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.2 パーソナルページ

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [田中太郎] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # 田中太郎のワークスペース           [設定]    │
│   ...        │                                                  │
│              │  ## 📌 ピン留め                                   │
│ 👤 個人      │  ┌────────────────────────────────────────────┐ │
│   📁 田中太郎 │  │ 📄 今週のタスク                            │ │
│     📄 ダッシュボード│  │ 📄 提案書ドラフト                          │ │
│     📁 メモ   │  └────────────────────────────────────────────┘ │
│       📄 アイデア│                                                  │
│       📄 読書メモ│  ## 📁 最近の編集                               │
│     📁 下書き │  ┌────────────────────────────────────────────┐ │
│       📄 提案書│  │ 📄 メモ (2分前)                            │ │
│     📁 ブックマーク│  │ 📄 プロフィール (昨日)                     │ │
│     📄 プロフィール│  └────────────────────────────────────────────┘ │
│              │                                                  │
│ [+ 新規作成] │  [公開設定: 🔒 非公開 ▼]                        │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.3 コンポーネント構成

```
components/
├── wiki/
│   ├── Sidebar.tsx           # サイドバー（スペース・フォルダツリー）
│   ├── SpaceSelector.tsx     # スペース切り替え
│   ├── FolderTree.tsx        # フォルダツリー
│   ├── PageList.tsx          # ページ一覧
│   ├── PageEditor.tsx        # ブロックエディタ
│   ├── BlockComponent.tsx    # 各ブロックタイプの表示
│   ├── SlashCommand.tsx      # スラッシュコマンドメニュー
│   ├── Toolbar.tsx           # フォーマットツールバー
│   ├── SearchBar.tsx         # 検索バー
│   ├── PersonalDashboard.tsx # パーソナルページダッシュボード
│   └── VisibilityToggle.tsx  # 公開/非公開設定
```

## 6. 技術仕様

### 6.1 使用ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| エディタ | TipTap 2.x | Block-basedエディタ |
| スタイリング | Tailwind CSS 4.x | UIスタイリング |
| 状態管理 | Zustand 5.x | エディタ状態管理 |
| データフェッチ | TanStack Query 5.x | キャッシュ・再試行 |
| ドラッグ&ドロップ | @dnd-kit/core | フォルダ・ページ移動 |

### 6.2 TipTap拡張構成

```typescript
// apps/web/lib/editor/extensions.ts
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlock from '@tiptap/extension-code-block'
import Toggle from './extensions/toggle'

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Image.configure({
    HTMLAttributes: { class: 'rounded-lg max-w-full' },
  }),
  Link.configure({
    openOnClick: true,
  }),
  Placeholder.configure({
    placeholder: '入力を開始するか、/ でコマンドを表示...',
  }),
  CodeBlock,
  Toggle,
]
```

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| ページ読み込み | < 2秒 |
| 保存レスポンス | < 500ms |
| 検索レスポンス | < 1秒 |
| 同時編集者 | 10名/ページ |
| 最大ページ数 | 無制限 |
| 最大ブロック数 | 1000/ページ |
| 最大フォルダ階層 | 10階層 |

## 8. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| リアルタイム共同編集 | 複数人同時編集 | 高 |
| コメント機能 | ブロック単位でコメント | 中 |
| バージョン履歴 | 編集履歴・復元 | 中 |
| テンプレート | ページテンプレート | 中 |
| エクスポート | PDF/Markdown出力 | 低 |
| タグ機能 | ページタグ付け | 低 |
| お気に入り | ページのお気に入り登録 | 低 |
| ピン留め | サイドバーにピン留め | 低 |

## 1. 概要

NotionライクなBlock-basedエディタを持つ社内Wikiシステム。Room議事録の自動スタック機能、パーソナルページ、フォルダによる階層管理を含む。

## 2. 機能一覧

### 2.1 スペース・フォルダ構成

#### スペース类型

| スペース | 説明 | アクセス権限 |
|---------|------|-------------|
| **全社** | 全社員アクセス可能 | 全員閲覧・編集 |
| **チーム** | 特定チーム用 | チームメンバーのみ |
| **個人** | パーソナルページ | 本人のみ |

#### 初期フォルダ構成

```
📁 全社/
├── 📁 お知らせ/
├── 📁 ガイドライン/
├── 📁 テンプレート/
└── 📁 ミーティング議事録/
    ├── 📁 2024/
    │   ├── 📁 01/
    │   ├── 📁 02/
    │   └── 📁 03/

📁 チーム/
├── 📁 エンジニアリング/
│   ├── 📁 技術ドキュメント/
│   ├── 📁 インフラ/
│   └── 📁 開発プロセス/
├── 📁 デザイン/
├── 📁 マーケティング/
└── 📁 営業/

📁 個人/
├── 📁 [ユーザー名]/
│   ├── 📄 メモ/
│   ├── 📁 下書き/
│   └── 📁 ブックマーク/
└── 📁 [ユーザー名]/
    └── ...
```

### 2.2 パーソナルページ

#### 機能概要

各ユーザーが独自に管理できる個人用Wikiスペース。

| 機能 | 説明 |
|------|------|
| 个人トップページ | `/personal/[username]` でアクセス |
| メモ・下書き | 公開前のドラフト保存 |
| ブックマーク | 他ページへのショートカット |
| タスク管理 | 個人タスクのメモ |
| プロフィール | 自己紹介ページ |

#### パーソナルページ構成例

```
/personal/tanaka-taro/
├── 📄 ダッシュボード        # 個人トップページ
├── 📁 メモ/
│   ├── 📄 アイデアメモ
│   └── 📄 読書メモ
├── 📁 下書き/
│   └── 📄 提案書ドラフト
├── 📁 ブックマーク/
│   └── 🔗 プロジェクトXへのリンク
└── 📄 プロフィール          # 公開可能
```

#### アクセス制御

| 項目 | 設定 |
|------|------|
| デフォルト | 非公開（本人のみ） |
| 公開設定 | オプションで他ユーザーに公開可能 |
| 管理者権限 | 管理者は全ページアクセス可能 |

### 2.3 フォルダ管理

| 機能 | 説明 |
|------|------|
| フォルダ作成 | 新規フォルダ作成 |
| フォルダ移動 | ドラッグ&ドロップで移動 |
| フォルダ削除 | 中身ごと削除（確認ダイアログ） |
| アイコン設定 | 絵文字アイコン割り当て |
| 色分け | フォルダカラー設定 |

### 2.4 ページ管理

| 機能 | 説明 |
|------|------|
| ページ作成 | 新規Wikiページ作成 |
| ページ編集 | 既存ページの編集 |
| ページ削除 | ページ削除（子ページ含む） |
| ページ移動 | ページの階層移動 |
| 複製 | ページのコピー |

### 2.5 ブロックエディタ (TipTap)

#### 対応ブロック类型

| ブロック类型 | 説明 |
|-------------|------|
| paragraph | 標準テキスト |
| heading1-3 | 見出し (H1-H3) |
| bulletList | 箇条書き |
| orderedList | 番号付きリスト |
| codeBlock | コードブロック |
| blockquote | 引用 |
| image | 画像 (GCS保存) |
| file | 添付ファイル (GCS保存) |
| divider | 区切り線 |
| callout | コールアウトボックス |
| toggle | 折りたたみブロック |

#### エディタ機能

| 機能 | 説明 |
|------|------|
| リアルタイムプレビュー | 編集中の即時反映 |
| Markdownショートカット | `#`, `-`, `1.` など |
| キーボードショートカット | `Ctrl+B` (太字), `Ctrl+I` (斜体) |
| ドラッグ&ドロップ | ブロック順序変更 |
| スラッシュコマンド | `/` でブロック挿入 |
| 自動保存 | 変更後自動保存 |

### 2.6 ファイル管理

| 機能 | 説明 |
|------|------|
| 画像アップロード | Drag & Drop / Paste / ファイル選択 |
| ファイルアップロード | PDF, Office文件など |
| サイズ制限 | 1ファイル最大10MB |
| 保存先 | Google Cloud Storage |

### 2.7 検索機能

| 機能 | 説明 |
|------|------|
| フルテキスト検索 | PostgreSQL全文検索 |
| タイトル検索 | ページタイトル検索 |
| コンテンツ検索 | ブロック内容検索 |
| スペース絞り込み | 特定スペース内で検索 |
| 日本語対応 | `to_tsvector('japanese', ...)` |

### 2.8 議事録連携

Roomモードで生成された議事録は自動的にWikiページとして作成:

```
/全社/ミーティング議事録/2024/03/2024-03-15_定例会議/
├── 📄 議事録.md (自動生成)
├── 🔗 録画.mp4 (リンク)
└── 📄 文字起こし.txt (全文)
```

## 3. データベーススキーマ

```sql
-- スペース
CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'company', 'team', 'personal'
    owner_id TEXT REFERENCES users(id), -- personalの場合の所有者
    icon TEXT, -- 絵文字アイコン
    color TEXT, -- カラー
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- フォルダ
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    space_id TEXT REFERENCES spaces(id),
    parent_id TEXT REFERENCES folders(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wikiページ
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    space_id TEXT REFERENCES spaces(id),
    folder_id TEXT REFERENCES folders(id),
    parent_id TEXT REFERENCES pages(id),
    author_id TEXT REFERENCES users(id),
    is_public BOOLEAN DEFAULT false, -- パーソナルページの公開設定
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ブロック (Notionライク)
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    page_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ファイル
CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    gcs_path TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_folders_space ON folders(space_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_pages_space ON pages(space_id);
CREATE INDEX idx_pages_folder ON pages(folder_id);
CREATE INDEX idx_pages_parent ON pages(parent_id);
CREATE INDEX idx_blocks_page ON blocks(page_id);
CREATE INDEX idx_blocks_sort ON blocks(page_id, sort_order);

-- 全文検索
CREATE INDEX idx_pages_title_search ON pages USING gin(to_tsvector('japanese', title));
CREATE INDEX idx_blocks_content_search ON blocks USING gin(to_tsvector('japanese', content));
```

## 4. API エンドポイント

```
/api
├── /spaces
│   ├── GET    /                      # スペース一覧
│   ├── POST   /                      # スペース作成 (admin)
│   └── GET    /:id                   # スペース詳細
├── /folders
│   ├── GET    /?space_id=:id         # フォルダ一覧
│   ├── POST   /                      # フォルダ作成
│   ├── PUT    /:id                   # フォルダ更新
│   ├── DELETE /:id                   # フォルダ削除
│   └── PUT    /:id/move              # フォルダ移動
├── /pages
│   ├── GET    /?folder_id=:id        # ページ一覧
│   ├── POST   /                      # ページ作成
│   ├── GET    /:id                   # ページ取得
│   ├── PUT    /:id                   # ページ更新
│   ├── DELETE /:id                   # ページ削除
│   ├── GET    /:id/blocks            # ブロック一覧
│   ├── PUT    /:id/move              # ページ移動
│   └── POST   /:id/duplicate         # ページ複製
├── /personal
│   ├── GET    /:username             # パーソナルページトップ
│   └── PUT    /:username/settings    # 公開設定
├── /blocks
│   ├── POST   /                      # ブロック作成
│   ├── PUT    /:id                   # ブロック更新
│   ├── DELETE /:id                   # ブロック削除
│   └── PUT    /:id/order             # ブロック順序変更
├── /search
│   └── GET    /?q=:query&space=:id   # フルテキスト検索
└── /upload
    └── POST   /                      # ファイルアップロード (GCS)
```

## 5. UI構成

### 5.1 画面レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [ユーザー] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # ページタイトル                    [編集] [⋯] │
│   📁 お知らせ │                                                  │
│   📁 ガイドライン│  テキストブロックのサンプルです。              │
│   📁 議事録   │                                                  │
│              │  ## 見出し2                                      │
│ 👥 チーム    │                                                  │
│   📁 エンジニア│  - 箇条書き1                                    │
│   📁 デザイン │  - 箇条書き2                                    │
│   📁 マーケ  │                                                  │
│              │  > コールアウト                                  │
│ 👤 個人      │                                                  │
│   📁 田中太郎 │  [ブロックを追加]                                │
│     📄 メモ  │                                                  │
│     📁 下書き │                                                  │
│              │                                                  │
│ [+ 新規作成] │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.2 パーソナルページ

```
┌─────────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]           [田中太郎] ▼  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│ 🏢 全社      │  # 田中太郎のワークスペース           [設定]    │
│   ...        │                                                  │
│              │  ## 📌 ピン留め                                   │
│ 👤 個人      │  ┌────────────────────────────────────────────┐ │
│   📁 田中太郎 │  │ 📄 今週のタスク                            │ │
│     📄 ダッシュボード│  │ 📄 提案書ドラフト                          │ │
│     📁 メモ   │  └────────────────────────────────────────────┘ │
│       📄 アイデア│                                                  │
│       📄 読書メモ│  ## 📁 最近の編集                               │
│     📁 下書き │  ┌────────────────────────────────────────────┐ │
│       📄 提案書│  │ 📄 メモ (2分前)                            │ │
│     📁 ブックマーク│  │ 📄 プロフィール (昨日)                     │ │
│     📄 プロフィール│  └────────────────────────────────────────────┘ │
│              │                                                  │
│ [+ 新規作成] │  [公開設定: 🔒 非公開 ▼]                        │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### 5.3 コンポーネント構成

```
components/
├── wiki/
│   ├── Sidebar.tsx           # サイドバー（スペース・フォルダツリー）
│   ├── SpaceSelector.tsx     # スペース切り替え
│   ├── FolderTree.tsx        # フォルダツリー
│   ├── PageList.tsx          # ページ一覧
│   ├── PageEditor.tsx        # ブロックエディタ
│   ├── BlockComponent.tsx    # 各ブロックタイプの表示
│   ├── SlashCommand.tsx      # スラッシュコマンドメニュー
│   ├── Toolbar.tsx           # フォーマットツールバー
│   ├── SearchBar.tsx         # 検索バー
│   ├── PersonalDashboard.tsx # パーソナルページダッシュボード
│   └── VisibilityToggle.tsx  # 公開/非公開設定
```

## 6. 技術仕様

### 6.1 使用ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| エディタ | TipTap 2.x | Block-basedエディタ |
| スタイリング | Tailwind CSS 4.x | UIスタイリング |
| 状態管理 | Zustand 5.x | エディタ状態管理 |
| データフェッチ | TanStack Query 5.x | キャッシュ・再試行 |
| ドラッグ&ドロップ | @dnd-kit/core | フォルダ・ページ移動 |

### 6.2 TipTap拡張構成

```typescript
// apps/web/lib/editor/extensions.ts
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlock from '@tiptap/extension-code-block'
import Toggle from './extensions/toggle'

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Image.configure({
    HTMLAttributes: { class: 'rounded-lg max-w-full' },
  }),
  Link.configure({
    openOnClick: true,
  }),
  Placeholder.configure({
    placeholder: '入力を開始するか、/ でコマンドを表示...',
  }),
  CodeBlock,
  Toggle,
]
```

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| ページ読み込み | < 2秒 |
| 保存レスポンス | < 500ms |
| 検索レスポンス | < 1秒 |
| 同時編集者 | 10名/ページ |
| 最大ページ数 | 無制限 |
| 最大ブロック数 | 1000/ページ |
| 最大フォルダ階層 | 10階層 |

## 8. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| リアルタイム共同編集 | 複数人同時編集 | 高 |
| コメント機能 | ブロック単位でコメント | 中 |
| バージョン履歴 | 編集履歴・復元 | 中 |
| テンプレート | ページテンプレート | 中 |
| エクスポート | PDF/Markdown出力 | 低 |
| タグ機能 | ページタグ付け | 低 |
| お気に入り | ページのお気に入り登録 | 低 |
| ピン留め | サイドバーにピン留め | 低 |

```

### 5.2 コンポーネント構成

```
components/
├── wiki/
│   ├── PageTree.tsx          # ページツリーサイドバー
│   ├── PageEditor.tsx        # ブロックエディタ
│   ├── BlockComponent.tsx    # 各ブロックタイプの表示
│   ├── SlashCommand.tsx      # スラッシュコマンドメニュー
│   ├── Toolbar.tsx           # フォーマットツールバー
│   └── SearchBar.tsx         # 検索バー
```

### 5.3 UIイメージ

```
┌─────────────────────────────────────────────────────────────┐
│ [ロゴ] 社内Wiki              [検索...]        [ユーザー] ▼ │
├────────────┬────────────────────────────────────────────────┤
│            │                                                │
│ 📁 ページ一覧│# ページタイトル                    [編集] [⋯] │
│            │                                                │
│ 📄 ホーム   │テキストブロックのサンプルです。              │
│   📁 プロジェクト│                                            │
│     📄 仕様書│## 見出し2                                    │
│     📄 議事録│                                                │
│   📁 チーム │- 箇条書き1                                   │
│     📄 メンバー│- 箇条書き2                                   │
│            │                                                │
│ [+ 新規ページ]│> コールアウト                                │
│            │                                                │
└────────────┴────────────────────────────────────────────────┘
```

## 6. 技術仕様

### 6.1 使用ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| エディタ | TipTap 2.x | Block-basedエディタ |
| スタイリング | Tailwind CSS 3.x | UIスタイリング |
| 状態管理 | Zustand 4.x | エディタ状態管理 |
| データフェッチ | TanStack Query 5.x | キャッシュ・再試行 |

### 6.2 TipTap拡張構成

```typescript
// apps/web/lib/editor/extensions.ts
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlock from '@tiptap/extension-code-block'

export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Image.configure({
    HTMLAttributes: { class: 'rounded-lg max-w-full' },
  }),
  Link.configure({
    openOnClick: true,
  }),
  Placeholder.configure({
    placeholder: '入力を開始するか、/ でコマンドを表示...',
  }),
  CodeBlock,
]
```

## 7. 非機能要件

| 項目 | 要件 |
|------|------|
| ページ読み込み | < 2秒 |
| 保存レスポンス | < 500ms |
| 検索レスポンス | < 1秒 |
| 同時編集者 | 10名/ページ |
| 最大ページ数 | 無制限 |
| 最大ブロック数 | 1000/ページ |

## 8. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| リアルタイム共同編集 | 複数人同時編集 | 高 |
| コメント機能 | ブロック単位でコメント | 中 |
| バージョン履歴 | 編集履歴・復元 | 中 |
| テンプレート | ページテンプレート | 中 |
| エクスポート | PDF/Markdown出力 | 低 |
| タグ機能 | ページタグ付け | 低 |

