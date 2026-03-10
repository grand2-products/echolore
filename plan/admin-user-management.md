# ユーザー管理Admin画面 仕様書

## 1. 概要

社内Wikiシステムにおけるユーザー管理のAdmin画面仕様。ユーザーグループ（権限）の作成・割り当て、およびWikiページの閲覧権限制御を管理する。

## 2. 機能一覧

### 2.1 ユーザーグループ管理

| 機能 | 説明 |
|------|------|
| グループ作成 | 新しいユーザーグループを作成 |
| グループ編集 | グループ名・説明・権限の変更 |
| グループ削除 | グループの削除（メンバーは自動的にデフォルトグループへ） |
| メンバー追加 | グループへのユーザー追加 |
| メンバー削除 | グループからのユーザー削除 |

### 2.2 事前定義グループ

| グループ | 説明 | 権限レベル |
|---------|------|-----------|
| **Admin** | システム管理者 | 全機能への完全アクセス |
| **Member** | 一般社員 | 標準アクセス権限 |
| **Guest** | ゲストユーザー | 限定された閲覧権限 |

### 2.3 権限種別

| 権限 | 説明 | Admin | Member | Guest |
|------|------|-------|--------|-------|
| `admin:*` | 全管理機能 | ✅ | ❌ | ❌ |
| `users:read` | ユーザー一覧閲覧 | ✅ | ✅ | ❌ |
| `users:write` | ユーザー作成・編集 | ✅ | ❌ | ❌ |
| `users:delete` | ユーザー削除 | ✅ | ❌ | ❌ |
| `wiki:read` | Wiki閲覧 | ✅ | ✅ | ✅* |
| `wiki:write` | Wiki編集 | ✅ | ✅ | ❌ |
| `wiki:delete` | Wiki削除 | ✅ | ✅ | ❌ |
| `meeting:read` | 会議閲覧 | ✅ | ✅ | ✅ |
| `meeting:write` | 会議作成 | ✅ | ✅ | ❌ |
| `file:read` | ファイル閲覧 | ✅ | ✅ | ✅* |
| `file:write` | ファイルアップロード | ✅ | ✅ | ❌ |

*Guest権限は公開ページのみ閲覧可能

### 2.4 Wikiページ権限制御

#### アクセス制御レベル

| レベル | 説明 |
|--------|------|
| **公開** | 全ユーザーが閲覧可能 |
| **グループ限定** | 特定グループのみ閲覧可能 |
| **非公開** | 作成者・管理者のみ閲覧可能 |

#### ページ権限設定

| 機能 | 説明 |
|------|------|
| 閲覧権限設定 | ページごとに閲覧可能なグループを指定 |
| 編集権限設定 | ページごとに編集可能なグループを指定 |
| 継承設定 | 親ページの権限を継承するかどうか |
| 一括設定 | フォルダ単位で権限を一括設定 |

## 3. データベーススキーマ

### 3.1 新規テーブル

```sql
-- ユーザーグループ
CREATE TABLE user_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT false, -- システム定義グループかどうか
    permissions JSONB NOT NULL DEFAULT '[]', -- 権限コードの配列
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ユーザー・グループ関連（多対多）
CREATE TABLE user_group_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    added_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id)
);

-- ページ権限
CREATE TABLE page_permissions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES user_groups(id) ON DELETE CASCADE,
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, group_id)
);

-- ページ継承設定
CREATE TABLE page_inheritance (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE UNIQUE,
    inherit_from_parent BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 インデックス

```sql
CREATE INDEX idx_user_group_memberships_user ON user_group_memberships(user_id);
CREATE INDEX idx_user_group_memberships_group ON user_group_memberships(group_id);
CREATE INDEX idx_page_permissions_page ON page_permissions(page_id);
CREATE INDEX idx_page_permissions_group ON page_permissions(group_id);
CREATE INDEX idx_page_inheritance_page ON page_inheritance(page_id);
```

### 3.3 Drizzle ORM スキーマ定義

```typescript
// apps/api/src/db/schema.ts に追加

import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ユーザーグループ
export const userGroups = pgTable("user_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  permissions: jsonb("permissions").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ユーザー・グループ関連
export const userGroupMemberships = pgTable("user_group_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }).notNull(),
  addedBy: text("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ページ権限
export const pagePermissions = pgTable("page_permissions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }),
  canRead: boolean("can_read").default(true).notNull(),
  canWrite: boolean("can_write").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ページ継承設定
export const pageInheritance = pgTable("page_inheritance", {
  id: text("id").primaryKey(),
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull().unique(),
  inheritFromParent: boolean("inherit_from_parent").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// リレーション定義
export const userGroupsRelations = relations(userGroups, ({ many }) => ({
  members: many(userGroupMemberships),
  pagePermissions: many(pagePermissions),
}));

export const userGroupMembershipsRelations = relations(userGroupMemberships, ({ one }) => ({
  user: one(users, {
    fields: [userGroupMemberships.userId],
    references: [users.id],
  }),
  group: one(userGroups, {
    fields: [userGroupMemberships.groupId],
    references: [userGroups.id],
  }),
  addedByUser: one(users, {
    fields: [userGroupMemberships.addedBy],
    references: [users.id],
  }),
}));

export const pagePermissionsRelations = relations(pagePermissions, ({ one }) => ({
  page: one(pages, {
    fields: [pagePermissions.pageId],
    references: [pages.id],
  }),
  group: one(userGroups, {
    fields: [pagePermissions.groupId],
    references: [userGroups.id],
  }),
}));

export const pageInheritanceRelations = relations(pageInheritance, ({ one }) => ({
  page: one(pages, {
    fields: [pageInheritance.pageId],
    references: [pages.id],
  }),
}));

// 既存のusersテーブルにリレーション追加
export const usersRelations = relations(users, ({ many }) => ({
  // ... 既存のリレーション
  groupMemberships: many(userGroupMemberships),
}));

// 既存のpagesテーブルにリレーション追加
export const pagesRelations = relations(pages, ({ one, many }) => ({
  // ... 既存のリレーション
  permissions: many(pagePermissions),
  inheritance: one(pageInheritance),
}));

// 型エクスポート
export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type NewUserGroupMembership = typeof userGroupMemberships.$inferInsert;
export type PagePermission = typeof pagePermissions.$inferSelect;
export type NewPagePermission = typeof pagePermissions.$inferInsert;
export type PageInheritance = typeof pageInheritance.$inferSelect;
export type NewPageInheritance = typeof pageInheritance.$inferInsert;
```

## 4. API エンドポイント

### 4.1 ユーザーグループ管理

```
/api/admin/groups
├── GET    /                        # グループ一覧取得
├── POST   /                        # グループ作成 (admin)
├── GET    /:id                     # グループ詳細取得
├── PUT    /:id                     # グループ更新 (admin)
├── DELETE /:id                     # グループ削除 (admin)
├── GET    /:id/members             # グループメンバー一覧
├── POST   /:id/members             # メンバー追加 (admin)
└── DELETE /:id/members/:userId     # メンバー削除 (admin)
```

### 4.2 ユーザー管理（Admin拡張）

```
/api/admin/users
├── GET    /                        # ユーザー一覧（グループ情報付き）
├── GET    /:id                     # ユーザー詳細（グループ情報付き）
├── PUT    /:id/groups              # ユーザーのグループ一括更新 (admin)
└── PUT    /:id/role                # ユーザーロール変更 (admin)
```

### 4.3 ページ権限管理

```
/api/admin/permissions
├── GET    /pages/:pageId           # ページ権限一覧取得
├── PUT    /pages/:pageId           # ページ権限一括設定 (admin)
├── DELETE /pages/:pageId/groups/:groupId # 特定グループの権限削除
├── GET    /pages/:pageId/inherit   # 継承設定取得
└── PUT    /pages/:pageId/inherit   # 継承設定変更 (admin)
```

### 4.4 API 詳細仕様

#### グループ作成

```typescript
// POST /api/admin/groups
// Request
{
  "name": "エンジニアリングチーム",
  "description": "エンジニアリングチームメンバー",
  "permissions": ["wiki:read", "wiki:write", "meeting:read", "meeting:write"]
}

// Response
{
  "group": {
    "id": "group_abc123",
    "name": "エンジニアリングチーム",
    "description": "エンジニアリングチームメンバー",
    "isSystem": false,
    "permissions": ["wiki:read", "wiki:write", "meeting:read", "meeting:write"],
    "createdAt": "2024-03-15T10:00:00Z",
    "updatedAt": "2024-03-15T10:00:00Z"
  }
}
```

#### メンバー追加

```typescript
// POST /api/admin/groups/:id/members
// Request
{
  "userIds": ["user_123", "user_456"]
}

// Response
{
  "added": 2,
  "memberships": [
    {
      "id": "membership_001",
      "userId": "user_123",
      "groupId": "group_abc123",
      "createdAt": "2024-03-15T10:00:00Z"
    },
    {
      "id": "membership_002",
      "userId": "user_456",
      "groupId": "group_abc123",
      "createdAt": "2024-03-15T10:00:00Z"
    }
  ]
}
```

#### ページ権限設定

```typescript
// PUT /api/admin/permissions/pages/:pageId
// Request
{
  "inheritFromParent": false,
  "permissions": [
    {
      "groupId": "group_admin",
      "canRead": true,
      "canWrite": true,
      "canDelete": true
    },
    {
      "groupId": "group_engineering",
      "canRead": true,
      "canWrite": true,
      "canDelete": false
    },
    {
      "groupId": "group_marketing",
      "canRead": true,
      "canWrite": false,
      "canDelete": false
    }
  ]
}

// Response
{
  "pageId": "page_123",
  "inheritFromParent": false,
  "permissions": [
    // ... 設定された権限
  ]
}
```

## 5. UI構成

### 5.1 Admin画面レイアウト

```
┌─────────────────────────────────────────────────────────────────────┐
│ [ロゴ] 管理画面                         [管理者名] ▼               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📊 ダッシュボード  │ 👥 ユーザー  │ 📁 グループ  │ 🔐 権限   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  // 各タブのコンテンツエリア                                  │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 ユーザー管理タブ

```
┌─────────────────────────────────────────────────────────────────────┐
│  ユーザー管理                                        [+ ユーザー招待] │
├─────────────────────────────────────────────────────────────────────┤
│  検索: [                    ] 🔍    グループ: [すべて ▼]           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ │ 名前          │ メール              │ グループ    │ 操作 │   │
│  ├───┼───────────────┼─────────────────────┼─────────────┼──────┤   │
│  │ □ │ 田中太郎      │ tanaka@corp.com     │ Admin       │ ⋯   │   │
│  │ □ │ 鈴木花子      │ suzuki@corp.com     │ Member      │ ⋯   │   │
│  │ □ │ 佐藤次郎      │ sato@corp.com       │ Engineering │ ⋯   │   │
│  │ □ │ 山田三郎      │ yamada@corp.com     │ Marketing   │ ⋯   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [全選択]  [一括グループ変更 ▼]                    1-4 / 50件 表示  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 グループ管理タブ

```
┌─────────────────────────────────────────────────────────────────────┐
│  グループ管理                                          [+ 新規作成] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  👑 Admin                                    [編集] [メンバー] │ │
│  │  システム管理者グループ。全ての権限を持ちます。                 │ │
│  │  メンバー: 3人                                                 │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👤 Member                                   [編集] [メンバー] │ │
│  │  一般社員グループ。標準的な権限を持ちます。                     │ │
│  │  メンバー: 45人                                                │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👥 エンジニアリング                          [編集] [メンバー] │ │
│  │  エンジニアリングチームメンバー                                 │ │
│  │  メンバー: 12人                                                │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👥 マーケティング                           [編集] [メンバー] │ │
│  │  マーケティングチームメンバー                                   │ │
│  │  メンバー: 8人                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 グループ編集モーダル

```
┌─────────────────────────────────────────────────────────────────────┐
│  グループ編集                                               [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  グループ名                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ エンジニアリング                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  説明                                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ エンジニアリングチームメンバー                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  権限設定                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ Wiki閲覧 (wiki:read)                                      │   │
│  │ ☑ Wiki編集 (wiki:write)                                     │   │
│  │ ☐ Wiki削除 (wiki:delete)                                    │   │
│  │ ☑ 会議閲覧 (meeting:read)                                   │   │
│  │ ☑ 会議作成 (meeting:write)                                  │   │
│  │ ☑ ファイル閲覧 (file:read)                                  │   │
│  │ ☑ ファイルアップロード (file:write)                         │   │
│  │ ☐ 管理機能 (admin:*)                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                        [キャンセル]  [保存]        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.5 ページ権限設定（Wikiページ内）

```
┌─────────────────────────────────────────────────────────────────────┐
│  # プロジェクトX仕様書                      [編集] [⋯]             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⋯ メニュー                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📋 ページを複製                                              │   │
│  │ 📁 移動                                                      │   │
│  │ 🔐 権限設定                                          →      │   │
│  │ ─────────────                                                │   │
│  │ 🗑️ 削除                                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                    ↓ 権限設定クリック後

┌─────────────────────────────────────────────────────────────────────┐
│  ページ権限設定                                              [×]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  継承設定                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ 親ページの権限を継承する                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  グループ権限                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ グループ          │ 閲覧 │ 編集 │ 削除 │                     │   │
│  │ ──────────────────────────────────────────────────────────  │   │
│  │ 👑 Admin          │  ✅  │  ✅  │  ✅  │                     │   │
│  │ 👥 エンジニアリング│  ✅  │  ✅  │  ☐  │                     │   │
│  │ 👥 マーケティング  │  ✅  │  ☐  │  ☐  │                     │   │
│  │ 👤 Member         │  ☐  │  ☐  │  ☐  │                     │   │
│  │ 👤 Guest          │  ☐  │  ☐  │  ☐  │                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [+ グループを追加]                                                 │
│                                                                     │
│                                        [キャンセル]  [保存]        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.6 コンポーネント構成

```
apps/web/app/
├── (main)/
│   └── admin/
│       ├── layout.tsx           # Admin レイアウト
│       ├── page.tsx             # Admin ダッシュボード
│       ├── users/
│       │   ├── page.tsx         # ユーザー一覧
│       │   └── [id]/
│       │       └── page.tsx     # ユーザー詳細
│       ├── groups/
│       │   ├── page.tsx         # グループ一覧
│       │   └── [id]/
│       │       ├── page.tsx     # グループ詳細
│       │       └── members/
│       │           └── page.tsx # グループメンバー管理
│       └── permissions/
│           └── page.tsx         # 権限一覧・設定

components/
├── admin/
│   ├── AdminLayout.tsx          # Admin レイアウト
│   ├── AdminSidebar.tsx         # Admin サイドバー
│   ├── UserTable.tsx            # ユーザー一覧テーブル
│   ├── UserRow.tsx              # ユーザー行
│   ├── GroupCard.tsx            # グループカード
│   ├── GroupForm.tsx            # グループ作成・編集フォーム
│   ├── PermissionEditor.tsx     # 権限エディタ
│   ├── MemberSelector.tsx       # メンバー選択
│   ├── PagePermissionModal.tsx  # ページ権限設定モーダル
│   └── PermissionMatrix.tsx     # 権限マトリックス表示
└── wiki/
    └── PageMenu.tsx             # ページメニュー（権限設定追加）
```

## 6. 実装計画

### 6.1 フェーズ1: データベース・バックエンド（2日）

1. **スキーマ追加**
   - `user_groups` テーブル作成
   - `user_group_memberships` テーブル作成
   - `page_permissions` テーブル作成
   - `page_inheritance` テーブル作成

2. **マイグレーション**
   - Drizzle マイグレーションファイル作成
   - 初期データ（デフォルトグループ）投入

3. **API実装**
   - グループ CRUD API
   - メンバーシップ管理 API
   - ページ権限管理 API

### 6.2 フェーズ2: フロントエンド Admin画面（3日）

1. **Admin レイアウト**
   - Admin 専用レイアウト作成
   - ナビゲーション実装

2. **ユーザー管理画面**
   - ユーザー一覧表示
   - グループ割り当て機能

3. **グループ管理画面**
   - グループ一覧表示
   - グループ作成・編集フォーム
   - メンバー管理機能

### 6.3 フェーズ3: 権限制御ロジック（2日）

1. **権限チェックミドルウェア**
   - API レベルでの権限チェック
   - ページアクセス時の権限検証

2. **Wiki統合**
   - ページ表示時の権限チェック
   - ページメニューへの権限設定追加

3. **UI表示制御**
   - 権限に基づくボタン・リンクの表示制御

### 6.4 フェーズ4: テスト・調整（1日）

1. **単体テスト**
   - API テスト
   - 権限チェックロジックテスト

2. **統合テスト**
   - E2E テストシナリオ

3. **パフォーマンス調整**
   - 権限チェックのクエリ最適化

## 7. 権限チェックロジック

### 7.1 ヘルパー関数

```typescript
// apps/api/src/utils/permissions.ts

import { db } from "../db/index.js";
import { users, userGroups, userGroupMemberships, pagePermissions, pageInheritance } from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";

export type Permission = 
  | "admin:*"
  | "users:read" | "users:write" | "users:delete"
  | "wiki:read" | "wiki:write" | "wiki:delete"
  | "meeting:read" | "meeting:write"
  | "file:read" | "file:write";

// ユーザーが特定の権限を持っているかチェック
export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  // ユーザーのグループを取得
  const memberships = await db
    .select({ group: userGroups })
    .from(userGroupMemberships)
    .innerJoin(userGroups, eq(userGroupMemberships.groupId, userGroups.id))
    .where(eq(userGroupMemberships.userId, userId));

  // いずれかのグループが権限を持っていれば true
  return memberships.some(({ group }) => {
    const permissions = group.permissions as string[];
    return permissions.includes("admin:*") || permissions.includes(permission);
  });
}

// ユーザーがページにアクセスできるかチェック
export async function canAccessPage(
  userId: string, 
  pageId: string, 
  accessType: "read" | "write" | "delete"
): Promise<boolean> {
  // Admin権限チェック
  if (await hasPermission(userId, "admin:*")) {
    return true;
  }

  // ページの権限設定を取得（継承を考慮）
  const effectivePermissions = await getEffectivePagePermissions(pageId);

  // ユーザーのグループを取得
  const userGroupsList = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, userId));

  const userGroupIds = userGroupsList.map(g => g.groupId);

  // いずれかのグループが権限を持っているかチェック
  return effectivePermissions.some(pp => 
    userGroupIds.includes(pp.groupId) && 
    (accessType === "read" ? pp.canRead : 
     accessType === "write" ? pp.canWrite : 
     pp.canDelete)
  );
}

// ページの有効な権限設定を取得（継承を考慮）
async function getEffectivePagePermissions(pageId: string): Promise<PagePermission[]> {
  // 継承設定を確認
  const [inheritance] = await db
    .select()
    .from(pageInheritance)
    .where(eq(pageInheritance.pageId, pageId));

  if (inheritance?.inheritFromParent) {
    // 親ページの権限を取得
    const [page] = await db
      .select({ parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.id, pageId));

    if (page?.parentId) {
      return getEffectivePagePermissions(page.parentId);
    }
  }

  // このページの権限設定を返す
  return db
    .select()
    .from(pagePermissions)
    .where(eq(pagePermissions.pageId, pageId));
}
```

### 7.2 APIミドルウェア

```typescript
// apps/api/src/middleware/requirePermission.ts

import { Context, Next } from "hono";
import { hasPermission, Permission } from "../utils/permissions.js";

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    // セッションからユーザーIDを取得（実装に依存）
    const userId = c.get("userId");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!(await hasPermission(userId, permission))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}

// 使用例
adminRoutes.post("/groups", requirePermission("admin:*"), async (c) => {
  // グループ作成処理
});
```

## 8. セキュリティ考慮事項

### 8.1 権限昇格防止

- ユーザーは自分自身のグループを変更できない
- Admin以外はAdminグループにメンバーを追加できない
- システム定義グループ（Admin, Member, Guest）は削除不可

### 8.2 監査ログ

```sql
-- 権限変更ログ
CREATE TABLE permission_audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL, -- 'group_created', 'member_added', 'permission_changed', etc.
    actor_id TEXT REFERENCES users(id),
    target_type TEXT, -- 'user', 'group', 'page'
    target_id TEXT,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.3 レート制限

- グループ作成: 10回/時間
- メンバー追加: 100回/時間
- 権限変更: 50回/時間

## 9. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| 組織階層 | 部署・チーム階層構造 | 中 |
| 一時権限 | 期間限定の権限付与 | 低 |
| 権限テンプレート | よく使う権限セットのテンプレート化 | 低 |
| 承認フロー | 権限変更の承認プロセス | 低 |
| SSO連携強化 | Google Groups との同期 | 中 |

## 1. 概要

社内Wikiシステムにおけるユーザー管理のAdmin画面仕様。ユーザーグループ（権限）の作成・割り当て、およびWikiページの閲覧権限制御を管理する。

## 2. 機能一覧

### 2.1 ユーザーグループ管理

| 機能 | 説明 |
|------|------|
| グループ作成 | 新しいユーザーグループを作成 |
| グループ編集 | グループ名・説明・権限の変更 |
| グループ削除 | グループの削除（メンバーは自動的にデフォルトグループへ） |
| メンバー追加 | グループへのユーザー追加 |
| メンバー削除 | グループからのユーザー削除 |

### 2.2 事前定義グループ

| グループ | 説明 | 権限レベル |
|---------|------|-----------|
| **Admin** | システム管理者 | 全機能への完全アクセス |
| **Member** | 一般社員 | 標準アクセス権限 |
| **Guest** | ゲストユーザー | 限定された閲覧権限 |

### 2.3 権限種別

| 権限 | 説明 | Admin | Member | Guest |
|------|------|-------|--------|-------|
| `admin:*` | 全管理機能 | ✅ | ❌ | ❌ |
| `users:read` | ユーザー一覧閲覧 | ✅ | ✅ | ❌ |
| `users:write` | ユーザー作成・編集 | ✅ | ❌ | ❌ |
| `users:delete` | ユーザー削除 | ✅ | ❌ | ❌ |
| `wiki:read` | Wiki閲覧 | ✅ | ✅ | ✅* |
| `wiki:write` | Wiki編集 | ✅ | ✅ | ❌ |
| `wiki:delete` | Wiki削除 | ✅ | ✅ | ❌ |
| `meeting:read` | 会議閲覧 | ✅ | ✅ | ✅ |
| `meeting:write` | 会議作成 | ✅ | ✅ | ❌ |
| `file:read` | ファイル閲覧 | ✅ | ✅ | ✅* |
| `file:write` | ファイルアップロード | ✅ | ✅ | ❌ |

*Guest権限は公開ページのみ閲覧可能

### 2.4 Wikiページ権限制御

#### アクセス制御レベル

| レベル | 説明 |
|--------|------|
| **公開** | 全ユーザーが閲覧可能 |
| **グループ限定** | 特定グループのみ閲覧可能 |
| **非公開** | 作成者・管理者のみ閲覧可能 |

#### ページ権限設定

| 機能 | 説明 |
|------|------|
| 閲覧権限設定 | ページごとに閲覧可能なグループを指定 |
| 編集権限設定 | ページごとに編集可能なグループを指定 |
| 継承設定 | 親ページの権限を継承するかどうか |
| 一括設定 | フォルダ単位で権限を一括設定 |

## 3. データベーススキーマ

### 3.1 新規テーブル

```sql
-- ユーザーグループ
CREATE TABLE user_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT false, -- システム定義グループかどうか
    permissions JSONB NOT NULL DEFAULT '[]', -- 権限コードの配列
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ユーザー・グループ関連（多対多）
CREATE TABLE user_group_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
    added_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id)
);

-- ページ権限
CREATE TABLE page_permissions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES user_groups(id) ON DELETE CASCADE,
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, group_id)
);

-- ページ継承設定
CREATE TABLE page_inheritance (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE UNIQUE,
    inherit_from_parent BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 インデックス

```sql
CREATE INDEX idx_user_group_memberships_user ON user_group_memberships(user_id);
CREATE INDEX idx_user_group_memberships_group ON user_group_memberships(group_id);
CREATE INDEX idx_page_permissions_page ON page_permissions(page_id);
CREATE INDEX idx_page_permissions_group ON page_permissions(group_id);
CREATE INDEX idx_page_inheritance_page ON page_inheritance(page_id);
```

### 3.3 Drizzle ORM スキーマ定義

```typescript
// apps/api/src/db/schema.ts に追加

import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ユーザーグループ
export const userGroups = pgTable("user_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  permissions: jsonb("permissions").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ユーザー・グループ関連
export const userGroupMemberships = pgTable("user_group_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }).notNull(),
  addedBy: text("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ページ権限
export const pagePermissions = pgTable("page_permissions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }),
  canRead: boolean("can_read").default(true).notNull(),
  canWrite: boolean("can_write").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ページ継承設定
export const pageInheritance = pgTable("page_inheritance", {
  id: text("id").primaryKey(),
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull().unique(),
  inheritFromParent: boolean("inherit_from_parent").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// リレーション定義
export const userGroupsRelations = relations(userGroups, ({ many }) => ({
  members: many(userGroupMemberships),
  pagePermissions: many(pagePermissions),
}));

export const userGroupMembershipsRelations = relations(userGroupMemberships, ({ one }) => ({
  user: one(users, {
    fields: [userGroupMemberships.userId],
    references: [users.id],
  }),
  group: one(userGroups, {
    fields: [userGroupMemberships.groupId],
    references: [userGroups.id],
  }),
  addedByUser: one(users, {
    fields: [userGroupMemberships.addedBy],
    references: [users.id],
  }),
}));

export const pagePermissionsRelations = relations(pagePermissions, ({ one }) => ({
  page: one(pages, {
    fields: [pagePermissions.pageId],
    references: [pages.id],
  }),
  group: one(userGroups, {
    fields: [pagePermissions.groupId],
    references: [userGroups.id],
  }),
}));

export const pageInheritanceRelations = relations(pageInheritance, ({ one }) => ({
  page: one(pages, {
    fields: [pageInheritance.pageId],
    references: [pages.id],
  }),
}));

// 既存のusersテーブルにリレーション追加
export const usersRelations = relations(users, ({ many }) => ({
  // ... 既存のリレーション
  groupMemberships: many(userGroupMemberships),
}));

// 既存のpagesテーブルにリレーション追加
export const pagesRelations = relations(pages, ({ one, many }) => ({
  // ... 既存のリレーション
  permissions: many(pagePermissions),
  inheritance: one(pageInheritance),
}));

// 型エクスポート
export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type NewUserGroupMembership = typeof userGroupMemberships.$inferInsert;
export type PagePermission = typeof pagePermissions.$inferSelect;
export type NewPagePermission = typeof pagePermissions.$inferInsert;
export type PageInheritance = typeof pageInheritance.$inferSelect;
export type NewPageInheritance = typeof pageInheritance.$inferInsert;
```

## 4. API エンドポイント

### 4.1 ユーザーグループ管理

```
/api/admin/groups
├── GET    /                        # グループ一覧取得
├── POST   /                        # グループ作成 (admin)
├── GET    /:id                     # グループ詳細取得
├── PUT    /:id                     # グループ更新 (admin)
├── DELETE /:id                     # グループ削除 (admin)
├── GET    /:id/members             # グループメンバー一覧
├── POST   /:id/members             # メンバー追加 (admin)
└── DELETE /:id/members/:userId     # メンバー削除 (admin)
```

### 4.2 ユーザー管理（Admin拡張）

```
/api/admin/users
├── GET    /                        # ユーザー一覧（グループ情報付き）
├── GET    /:id                     # ユーザー詳細（グループ情報付き）
├── PUT    /:id/groups              # ユーザーのグループ一括更新 (admin)
└── PUT    /:id/role                # ユーザーロール変更 (admin)
```

### 4.3 ページ権限管理

```
/api/admin/permissions
├── GET    /pages/:pageId           # ページ権限一覧取得
├── PUT    /pages/:pageId           # ページ権限一括設定 (admin)
├── DELETE /pages/:pageId/groups/:groupId # 特定グループの権限削除
├── GET    /pages/:pageId/inherit   # 継承設定取得
└── PUT    /pages/:pageId/inherit   # 継承設定変更 (admin)
```

### 4.4 API 詳細仕様

#### グループ作成

```typescript
// POST /api/admin/groups
// Request
{
  "name": "エンジニアリングチーム",
  "description": "エンジニアリングチームメンバー",
  "permissions": ["wiki:read", "wiki:write", "meeting:read", "meeting:write"]
}

// Response
{
  "group": {
    "id": "group_abc123",
    "name": "エンジニアリングチーム",
    "description": "エンジニアリングチームメンバー",
    "isSystem": false,
    "permissions": ["wiki:read", "wiki:write", "meeting:read", "meeting:write"],
    "createdAt": "2024-03-15T10:00:00Z",
    "updatedAt": "2024-03-15T10:00:00Z"
  }
}
```

#### メンバー追加

```typescript
// POST /api/admin/groups/:id/members
// Request
{
  "userIds": ["user_123", "user_456"]
}

// Response
{
  "added": 2,
  "memberships": [
    {
      "id": "membership_001",
      "userId": "user_123",
      "groupId": "group_abc123",
      "createdAt": "2024-03-15T10:00:00Z"
    },
    {
      "id": "membership_002",
      "userId": "user_456",
      "groupId": "group_abc123",
      "createdAt": "2024-03-15T10:00:00Z"
    }
  ]
}
```

#### ページ権限設定

```typescript
// PUT /api/admin/permissions/pages/:pageId
// Request
{
  "inheritFromParent": false,
  "permissions": [
    {
      "groupId": "group_admin",
      "canRead": true,
      "canWrite": true,
      "canDelete": true
    },
    {
      "groupId": "group_engineering",
      "canRead": true,
      "canWrite": true,
      "canDelete": false
    },
    {
      "groupId": "group_marketing",
      "canRead": true,
      "canWrite": false,
      "canDelete": false
    }
  ]
}

// Response
{
  "pageId": "page_123",
  "inheritFromParent": false,
  "permissions": [
    // ... 設定された権限
  ]
}
```

## 5. UI構成

### 5.1 Admin画面レイアウト

```
┌─────────────────────────────────────────────────────────────────────┐
│ [ロゴ] 管理画面                         [管理者名] ▼               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  📊 ダッシュボード  │ 👥 ユーザー  │ 📁 グループ  │ 🔐 権限   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │  // 各タブのコンテンツエリア                                  │  │
│  │                                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 ユーザー管理タブ

```
┌─────────────────────────────────────────────────────────────────────┐
│  ユーザー管理                                        [+ ユーザー招待] │
├─────────────────────────────────────────────────────────────────────┤
│  検索: [                    ] 🔍    グループ: [すべて ▼]           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ │ 名前          │ メール              │ グループ    │ 操作 │   │
│  ├───┼───────────────┼─────────────────────┼─────────────┼──────┤   │
│  │ □ │ 田中太郎      │ tanaka@corp.com     │ Admin       │ ⋯   │   │
│  │ □ │ 鈴木花子      │ suzuki@corp.com     │ Member      │ ⋯   │   │
│  │ □ │ 佐藤次郎      │ sato@corp.com       │ Engineering │ ⋯   │   │
│  │ □ │ 山田三郎      │ yamada@corp.com     │ Marketing   │ ⋯   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [全選択]  [一括グループ変更 ▼]                    1-4 / 50件 表示  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 グループ管理タブ

```
┌─────────────────────────────────────────────────────────────────────┐
│  グループ管理                                          [+ 新規作成] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  👑 Admin                                    [編集] [メンバー] │ │
│  │  システム管理者グループ。全ての権限を持ちます。                 │ │
│  │  メンバー: 3人                                                 │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👤 Member                                   [編集] [メンバー] │ │
│  │  一般社員グループ。標準的な権限を持ちます。                     │ │
│  │  メンバー: 45人                                                │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👥 エンジニアリング                          [編集] [メンバー] │ │
│  │  エンジニアリングチームメンバー                                 │ │
│  │  メンバー: 12人                                                │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │  👥 マーケティング                           [編集] [メンバー] │ │
│  │  マーケティングチームメンバー                                   │ │
│  │  メンバー: 8人                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.4 グループ編集モーダル

```
┌─────────────────────────────────────────────────────────────────────┐
│  グループ編集                                               [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  グループ名                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ エンジニアリング                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  説明                                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ エンジニアリングチームメンバー                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  権限設定                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ Wiki閲覧 (wiki:read)                                      │   │
│  │ ☑ Wiki編集 (wiki:write)                                     │   │
│  │ ☐ Wiki削除 (wiki:delete)                                    │   │
│  │ ☑ 会議閲覧 (meeting:read)                                   │   │
│  │ ☑ 会議作成 (meeting:write)                                  │   │
│  │ ☑ ファイル閲覧 (file:read)                                  │   │
│  │ ☑ ファイルアップロード (file:write)                         │   │
│  │ ☐ 管理機能 (admin:*)                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│                                        [キャンセル]  [保存]        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.5 ページ権限設定（Wikiページ内）

```
┌─────────────────────────────────────────────────────────────────────┐
│  # プロジェクトX仕様書                      [編集] [⋯]             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ⋯ メニュー                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📋 ページを複製                                              │   │
│  │ 📁 移動                                                      │   │
│  │ 🔐 権限設定                                          →      │   │
│  │ ─────────────                                                │   │
│  │ 🗑️ 削除                                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                    ↓ 権限設定クリック後

┌─────────────────────────────────────────────────────────────────────┐
│  ページ権限設定                                              [×]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  継承設定                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ☑ 親ページの権限を継承する                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  グループ権限                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ グループ          │ 閲覧 │ 編集 │ 削除 │                     │   │
│  │ ──────────────────────────────────────────────────────────  │   │
│  │ 👑 Admin          │  ✅  │  ✅  │  ✅  │                     │   │
│  │ 👥 エンジニアリング│  ✅  │  ✅  │  ☐  │                     │   │
│  │ 👥 マーケティング  │  ✅  │  ☐  │  ☐  │                     │   │
│  │ 👤 Member         │  ☐  │  ☐  │  ☐  │                     │   │
│  │ 👤 Guest          │  ☐  │  ☐  │  ☐  │                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [+ グループを追加]                                                 │
│                                                                     │
│                                        [キャンセル]  [保存]        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.6 コンポーネント構成

```
apps/web/app/
├── (main)/
│   └── admin/
│       ├── layout.tsx           # Admin レイアウト
│       ├── page.tsx             # Admin ダッシュボード
│       ├── users/
│       │   ├── page.tsx         # ユーザー一覧
│       │   └── [id]/
│       │       └── page.tsx     # ユーザー詳細
│       ├── groups/
│       │   ├── page.tsx         # グループ一覧
│       │   └── [id]/
│       │       ├── page.tsx     # グループ詳細
│       │       └── members/
│       │           └── page.tsx # グループメンバー管理
│       └── permissions/
│           └── page.tsx         # 権限一覧・設定

components/
├── admin/
│   ├── AdminLayout.tsx          # Admin レイアウト
│   ├── AdminSidebar.tsx         # Admin サイドバー
│   ├── UserTable.tsx            # ユーザー一覧テーブル
│   ├── UserRow.tsx              # ユーザー行
│   ├── GroupCard.tsx            # グループカード
│   ├── GroupForm.tsx            # グループ作成・編集フォーム
│   ├── PermissionEditor.tsx     # 権限エディタ
│   ├── MemberSelector.tsx       # メンバー選択
│   ├── PagePermissionModal.tsx  # ページ権限設定モーダル
│   └── PermissionMatrix.tsx     # 権限マトリックス表示
└── wiki/
    └── PageMenu.tsx             # ページメニュー（権限設定追加）
```

## 6. 実装計画

### 6.1 フェーズ1: データベース・バックエンド（2日）

1. **スキーマ追加**
   - `user_groups` テーブル作成
   - `user_group_memberships` テーブル作成
   - `page_permissions` テーブル作成
   - `page_inheritance` テーブル作成

2. **マイグレーション**
   - Drizzle マイグレーションファイル作成
   - 初期データ（デフォルトグループ）投入

3. **API実装**
   - グループ CRUD API
   - メンバーシップ管理 API
   - ページ権限管理 API

### 6.2 フェーズ2: フロントエンド Admin画面（3日）

1. **Admin レイアウト**
   - Admin 専用レイアウト作成
   - ナビゲーション実装

2. **ユーザー管理画面**
   - ユーザー一覧表示
   - グループ割り当て機能

3. **グループ管理画面**
   - グループ一覧表示
   - グループ作成・編集フォーム
   - メンバー管理機能

### 6.3 フェーズ3: 権限制御ロジック（2日）

1. **権限チェックミドルウェア**
   - API レベルでの権限チェック
   - ページアクセス時の権限検証

2. **Wiki統合**
   - ページ表示時の権限チェック
   - ページメニューへの権限設定追加

3. **UI表示制御**
   - 権限に基づくボタン・リンクの表示制御

### 6.4 フェーズ4: テスト・調整（1日）

1. **単体テスト**
   - API テスト
   - 権限チェックロジックテスト

2. **統合テスト**
   - E2E テストシナリオ

3. **パフォーマンス調整**
   - 権限チェックのクエリ最適化

## 7. 権限チェックロジック

### 7.1 ヘルパー関数

```typescript
// apps/api/src/utils/permissions.ts

import { db } from "../db/index.js";
import { users, userGroups, userGroupMemberships, pagePermissions, pageInheritance } from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";

export type Permission = 
  | "admin:*"
  | "users:read" | "users:write" | "users:delete"
  | "wiki:read" | "wiki:write" | "wiki:delete"
  | "meeting:read" | "meeting:write"
  | "file:read" | "file:write";

// ユーザーが特定の権限を持っているかチェック
export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  // ユーザーのグループを取得
  const memberships = await db
    .select({ group: userGroups })
    .from(userGroupMemberships)
    .innerJoin(userGroups, eq(userGroupMemberships.groupId, userGroups.id))
    .where(eq(userGroupMemberships.userId, userId));

  // いずれかのグループが権限を持っていれば true
  return memberships.some(({ group }) => {
    const permissions = group.permissions as string[];
    return permissions.includes("admin:*") || permissions.includes(permission);
  });
}

// ユーザーがページにアクセスできるかチェック
export async function canAccessPage(
  userId: string, 
  pageId: string, 
  accessType: "read" | "write" | "delete"
): Promise<boolean> {
  // Admin権限チェック
  if (await hasPermission(userId, "admin:*")) {
    return true;
  }

  // ページの権限設定を取得（継承を考慮）
  const effectivePermissions = await getEffectivePagePermissions(pageId);

  // ユーザーのグループを取得
  const userGroupsList = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, userId));

  const userGroupIds = userGroupsList.map(g => g.groupId);

  // いずれかのグループが権限を持っているかチェック
  return effectivePermissions.some(pp => 
    userGroupIds.includes(pp.groupId) && 
    (accessType === "read" ? pp.canRead : 
     accessType === "write" ? pp.canWrite : 
     pp.canDelete)
  );
}

// ページの有効な権限設定を取得（継承を考慮）
async function getEffectivePagePermissions(pageId: string): Promise<PagePermission[]> {
  // 継承設定を確認
  const [inheritance] = await db
    .select()
    .from(pageInheritance)
    .where(eq(pageInheritance.pageId, pageId));

  if (inheritance?.inheritFromParent) {
    // 親ページの権限を取得
    const [page] = await db
      .select({ parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.id, pageId));

    if (page?.parentId) {
      return getEffectivePagePermissions(page.parentId);
    }
  }

  // このページの権限設定を返す
  return db
    .select()
    .from(pagePermissions)
    .where(eq(pagePermissions.pageId, pageId));
}
```

### 7.2 APIミドルウェア

```typescript
// apps/api/src/middleware/requirePermission.ts

import { Context, Next } from "hono";
import { hasPermission, Permission } from "../utils/permissions.js";

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    // セッションからユーザーIDを取得（実装に依存）
    const userId = c.get("userId");

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!(await hasPermission(userId, permission))) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}

// 使用例
adminRoutes.post("/groups", requirePermission("admin:*"), async (c) => {
  // グループ作成処理
});
```

## 8. セキュリティ考慮事項

### 8.1 権限昇格防止

- ユーザーは自分自身のグループを変更できない
- Admin以外はAdminグループにメンバーを追加できない
- システム定義グループ（Admin, Member, Guest）は削除不可

### 8.2 監査ログ

```sql
-- 権限変更ログ
CREATE TABLE permission_audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL, -- 'group_created', 'member_added', 'permission_changed', etc.
    actor_id TEXT REFERENCES users(id),
    target_type TEXT, -- 'user', 'group', 'page'
    target_id TEXT,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.3 レート制限

- グループ作成: 10回/時間
- メンバー追加: 100回/時間
- 権限変更: 50回/時間

## 9. 将来拡張

| 機能 | 説明 | 優先度 |
|------|------|--------|
| 組織階層 | 部署・チーム階層構造 | 中 |
| 一時権限 | 期間限定の権限付与 | 低 |
| 権限テンプレート | よく使う権限セットのテンプレート化 | 低 |
| 承認フロー | 権限変更の承認プロセス | 低 |
| SSO連携強化 | Google Groups との同期 | 中 |

