# 次のタスク（Handover用）

## 📋 現在の進捗状況

### 完了
- [x] plan/overview.mdを確認して現在の実装状況を分析
- [x] 不足機能の洗い出しと実装計画の作成（`plan/implementation-status.md`）
- [x] APIクライアントの作成（`apps/web/lib/api.ts`）
- [x] MeetingsページのAPI接続（`apps/web/app/(main)/meetings/page.tsx`）

### 進行中
- [ ] ページ階層構造のUI実装（PageTree のドラッグ&ドロップ、折りたたみ改善）

## 🔴 次にやるべきタスク（優先度順）

### 1. WikiページのAPI接続
**対象ファイル**:
- `apps/web/app/(main)/wiki/page.tsx`
- `apps/web/app/(main)/wiki/[id]/page.tsx`
- `apps/web/app/(main)/wiki/new/page.tsx`

**作業内容**:
- `samplePages`（サンプルデータ）を削除
- `wikiApi`を使用してAPIからデータを取得
- ページツリーをAPIデータで構築

**実装例**:
```typescript
// apps/web/app/(main)/wiki/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { wikiApi, type Page } from "@/lib/api";
import { PageTree, type PageNode } from "@/components/wiki";

export default function WikiListPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    wikiApi.listPages()
      .then((data) => setPages(data.pages))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ページツリーの構築
  const buildPageTree = (pages: Page[]): PageNode[] => {
    const pageMap = new Map<string, PageNode>();
    const roots: PageNode[] = [];

    // 全ページをマップに追加
    pages.forEach((page) => {
      pageMap.set(page.id, {
        id: page.id,
        title: page.title,
        parentId: page.parentId || undefined,
        children: [],
      });
    });

    // 親子関係を構築
    pages.forEach((page) => {
      const node = pageMap.get(page.id)!;
      if (page.parentId) {
        const parent = pageMap.get(page.parentId);
        parent?.children?.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const pageTree = buildPageTree(pages);

  if (loading) return <div className="p-8">読み込み中...</div>;

  return (
    // ... 既存のJSX、samplePagesをpageTreeに置き換え
  );
}
```

### 2. Wiki詳細ページのAPI接続
**対象ファイル**: `apps/web/app/(main)/wiki/[id]/page.tsx`

**作業内容**:
- `wikiApi.getPage(id)`でページとブロックを取得
- ブロックエディタでコンテンツを表示

### 3. Wiki新規作成ページのAPI接続
**対象ファイル**: `apps/web/app/(main)/wiki/new/page.tsx`

**作業内容**:
- `wikiApi.createPage()`でページを作成
- 作成後に詳細ページへリダイレクト

### 4. Block-basedエディタの実装
**対象ファイル**:
- `apps/web/components/wiki/WikiEditor.tsx`
- `apps/web/components/wiki/Toolbar.tsx`

**作業内容**:
- ブロックタイプの追加（見出し、リスト、画像、コード等）
- ブロックの追加・削除・並べ替え
- `wikiApi.createBlock()` / `wikiApi.deleteBlock()` の使用

### 5. 検索機能の実装
**対象ファイル**:
- `apps/api/src/routes/wiki.ts`（検索エンドポイント追加）
- `apps/web/app/(main)/search/page.tsx`

**作業内容**:
- PostgreSQL全文検索の実装
- 検索APIエンドポイントの追加
- 検索UIの実装

## 📁 重要ファイル

| ファイル | 説明 |
|---------|------|
| `plan/implementation-status.md` | 実装状況の詳細 |
| `apps/web/lib/api.ts` | APIクライアント |
| `apps/api/src/routes/wiki.ts` | Wiki APIエンドポイント |
| `apps/api/src/db/schema.ts` | データベーススキーマ |

## 🚀 開発環境の起動

```bash
# APIサーバー
cd apps/api && pnpm dev

# Webサーバー
cd apps/web && pnpm dev
```

## 📝 注意点

- 認証が未実装のため、`creatorId`や`authorId`は固定値（"demo-user"等）を使用
- 管理者機能（`apps/api/src/routes/admin.ts`）はインメモリストアを使用中
- LiveKit接続は環境変数の設定が必要
