# クリーンアーキテクチャ改善計画

## 目標

API レイヤーの依存関係を整理し、保守性とテスト容易性を向上させる。

## 現状の問題

### 依存関係違反

#### services → db 直接アクセス (19ファイル)

| ファイル |
|---------|
| `services/admin/group-service.ts` |
| `services/admin/permission-service.ts` |
| `services/auth/auth-utils.ts` |
| `services/auth/oauth-service.ts` |
| `services/auth/password-service.ts` |
| `services/auth/session-service.ts` |
| `services/auth/token-service.ts` |
| `services/calendar/google-calendar-auth-service.ts` |
| `services/calendar/google-calendar-sync-service.ts` |
| `services/knowledge/knowledge-scan-service.ts` |
| `services/knowledge/knowledge-suggestion-service.ts` |
| `services/meeting/recording-service.ts` |
| `services/notification/notification-service.ts` |
| `services/wiki/embedding-service.ts` |
| `services/wiki/import-service.ts` |
| `services/wiki/space-service.ts` |
| `services/wiki/vector-search-service.ts` |
| `services/wiki/wiki-service.ts` |

#### policies → db 直接アクセス (1ファイル)

| ファイル |
|---------|
| `policies/authorization-policy.ts` |

#### routes → repositories 直接アクセス (19ファイル)

| ファイル |
|---------|
| `routes/admin/admin-groups.ts` |
| `routes/admin/admin-site-settings.ts` |
| `routes/admin/admin-space-permissions.ts` |
| `routes/ai-chat.ts` |
| `routes/aituber.ts` |
| `routes/files.ts` |
| `routes/internal-room-ai.ts` |
| `routes/knowledge-suggestions.ts` |
| `routes/livekit.ts` |
| `routes/meetings/meeting-agents.ts` |
| `routes/meetings/meeting-crud.ts` |
| `routes/meetings/meeting-pipeline.ts` |
| `routes/meetings/meeting-recordings.ts` |
| `routes/meetings/meeting-summaries.ts` |
| `routes/meetings/meeting-transcripts.ts` |
| `routes/metrics.ts` |
| `routes/site.ts` |
| `routes/users.ts` |
| `routes/wiki/wiki-blocks.ts` |
| `routes/wiki/wiki-files.ts` |
| `routes/wiki/wiki-import.ts` |
| `routes/wiki/wiki-pages.ts` |
| `routes/wiki/wiki-permissions.ts` |
| `routes/wiki/wiki-revisions.ts` |
| `routes/wiki/wiki-trash.ts` |

### 現状の依存図

```
routes ──────────┬──→ services ─────────┬──→ repositories ──→ db
                 │                       │
                 └──→ repositories ──────┘
                        (違反)
                                          ↓
                    policies ───────────→ db (違反)
                                          ↑
                    services ───────────→ ai (密結合)
```

## 目標アーキテクチャ

```
interfaces/
    routes/          → HTTP handlers, バリデーション
    dto.ts           → リクエスト/レスポンス型

application/
    services/        → ビジネスロジック
    policies/        → 認可ポリシー

domain/
    entities/        → ドメインエンティティ (オプション)
    value-objects/   → 値オブジェクト (オプション)

infrastructure/
    repositories/    → データアクセス抽象化
    ai/              → AI/LLM ゲートウェイ
    db/              → データベース接続
```

### 目標の依存ルール

```
routes → services → policies → repositories → db
                 ↘           ↘
                   → ai (interface) ← ai-gateway
```

## フェーズ1: High Priority (週1-2)

### 1.1 services → DB 直接アクセス除去

**対象ファイル: 18ファイル**

- [x] `services/admin/group-service.ts`
- [x] `services/admin/permission-service.ts`
- [x] `services/auth/auth-utils.ts`
- [x] `services/auth/oauth-service.ts`
- [x] `services/auth/password-service.ts`
- [x] `services/auth/session-service.ts`
- [x] `services/auth/token-service.ts`
- [x] `services/calendar/google-calendar-auth-service.ts`
- [x] `services/calendar/google-calendar-sync-service.ts`
- [x] `services/knowledge/knowledge-scan-service.ts`
- [x] `services/knowledge/knowledge-suggestion-service.ts`
- [x] `services/meeting/recording-service.ts`
- [x] `services/notification/notification-service.ts`
- [x] `services/wiki/embedding-service.ts`
- [x] `services/wiki/import-service.ts`
- [x] `services/wiki/space-service.ts`
- [x] `services/wiki/vector-search-service.ts`
- [x] `services/wiki/wiki-service.ts`

**作業内容:**

1. `wiki-service.ts` のDB直接操作をリポジトリに移動:
   ```typescript
   // 現状 (wiki-service.ts:163-179)
   const [page] = await tx.insert(pages).values(input).returning();
   await tx.insert(pageInheritance).values({...});
   
   // 修正後
   const page = await createPageWithInheritance(tx, input);
   ```

2. 新規リポジトリ関数を追加:
   - `repositories/wiki/wiki-repository.ts`
     - `createPageWithInheritance()`
     - `updatePagePermissions()`
   - `repositories/meeting/meeting-repository.ts`
     - 確認して追加

**受け入れ基準:**
- [x] services 内の `import { db }` が削除されている
- [x] services 内で `db.select/insert/update/delete` が使われていない
- [x] 全テストがパス (296/296)

### 1.2 routes → repositories 直接アクセス除去

**対象ファイル: 25ファイル**

- [ ] `routes/admin/admin-groups.ts`
- [ ] `routes/admin/admin-site-settings.ts`
- [ ] `routes/admin/admin-space-permissions.ts`
- [ ] `routes/ai-chat.ts`
- [ ] `routes/aituber.ts`
- [ ] `routes/files.ts`
- [ ] `routes/internal-room-ai.ts`
- [ ] `routes/knowledge-suggestions.ts`
- [ ] `routes/livekit.ts`
- [ ] `routes/meetings/meeting-agents.ts`
- [ ] `routes/meetings/meeting-crud.ts`
- [ ] `routes/meetings/meeting-pipeline.ts`
- [ ] `routes/meetings/meeting-recordings.ts`
- [ ] `routes/meetings/meeting-summaries.ts`
- [ ] `routes/meetings/meeting-transcripts.ts`
- [ ] `routes/metrics.ts`
- [ ] `routes/site.ts`
- [ ] `routes/users.ts`
- [ ] `routes/wiki/wiki-blocks.ts`
- [ ] `routes/wiki/wiki-files.ts`
- [ ] `routes/wiki/wiki-import.ts`
- [ ] `routes/wiki/wiki-pages.ts`
- [ ] `routes/wiki/wiki-permissions.ts`
- [ ] `routes/wiki/wiki-revisions.ts`
- [ ] `routes/wiki/wiki-trash.ts`

**作業内容:**

1. `wiki-pages.ts` のリポジトリ呼び出しをサービスに移動:
   ```typescript
   // 現状 (wiki-pages.ts:7-13)
   import { getPageById, softDeletePage } from "../../repositories/wiki/wiki-repository.js";
   
   // 修正後
   import { getPage, deletePage } from "../../services/wiki/wiki-service.js";
   ```

2. サービス層に不足している関数を追加:
   - `getPage()` - 認可チェック付き取得
   - `deletePage()` - ソフトデリート + 副作用処理

**受け入れ基準:**
- [ ] routes 内で `repositories/` を import していない
- [ ] 全テストがパス

## フェーズ2: Medium Priority (週3-4)

### 2.1 policies → DB 直接アクセス除去

**対象ファイル:**
- [x] `policies/authorization-policy.ts`

**作業内容:**

1. 認可リポジトリを作成:
   ```
   repositories/auth/
     authorization-repository.ts
   ```

2. DB クエリをリポジトリに移動:
   ```typescript
   // 現状 (authorization-policy.ts:4-12)
   import { db } from "../db/index.js";
   const result = await db.select()...
   
   // 修正後
   import { getPagePermissions, getSpacePermissions } from "../repositories/auth/authorization-repository.js";
   ```

**受け入れ基準:**
- [x] policies 内の `import { db }` が削除されている
- [x] 認可テストがパス

### 2.2 AI依存の抽象化

**対象:**
- [ ] `services/wiki/wiki-service.ts` (embeddings)
- [ ] `services/ai-chat/ai-chat-ai-service.ts`
- [ ] `services/aituber/*.ts`

**作業内容:**

1. インターフェース定義:
   ```typescript
   // ai/embedding-provider.ts
   export interface EmbeddingProvider {
     isAvailable(): Promise<boolean>;
     embed(text: string, options?: EmbedOptions): Promise<number[] | null>;
export async function listPagesOrderedByUpdatedAt() {
  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      spaceId: pages.spaceId,
      parentId: pages.parentId,
      authorId: pages.authorId,
      deletedAt: pages.deletedAt,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .leftJoin(users, eq(users.id, pages.authorId))
    .leftJoin(spaces, eq(spaces.type, "personal"), eq(spaces.ownerUserId, user.id))
    )
    .orderBy(desc(spaces.updatedAt));

  return rows.map((r) => ({
    ...r,
    ...r.authorName: r.authorName ?? undefined,
    spaceName: spaces.space.type ?? undefined;
    spaceName: spaces.name ?? "General";
  });
  return allSpaces.filter((space) => space.type === "general");
  if (!visibleSpaces.includes(user)) {
    return allSpaces;
  }

  if (user.role === UserRole.Admin) {
    const allSpaces = await listSpaces();
  return filtered;
  } else {
    const now = new Date();
    const allPages = await listPagesOrderedByUpdatedAt();
    return {
      pages: filtered,
      spaceId: spaceId,
      authorId,
      spaceName,
    };
    await getOrCreatePersonalSpace(user);
    const personalSpaces = await listPersonalSpaces(user.id);
    if (personalSpaces.length === 0) {
      await ensureTeamSpacesForAllGroups();
      const personalSpace = {
        id: `space_${nanoid(12)}`,
        name: groupName,
        type: "personal",
        ownerUserId: user.id,
        groupId: null,
        createdAt: now,
        updatedAt: now,
      });
    })
    return space;
  });
);

```

## services/admin/group-service.ts (終了)

services/admin/group-service.ts
- services/admin/permission-service.ts (終了)
services/auth/auth-utils.ts(終了)
- services/auth/session-service.ts(残り)
 services/auth/token-service.ts (残り)
 - [x] services/auth/password-service.ts
    - [x] `services/auth/password-auth-service.ts`残り)
    - [x] `services/calendar/google-calendar-auth-service.ts`、DBから "../../db/index.js";
import { db } from "../../db/index.js";
import { authIdentities, emailVerificationTokens, users, userGroupMemberships, userGroups } from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

import { listSpaces, getGeneralSpace, getPersonalSpaceByUserId, getTeamSpaceByGroupId } from "../../repositories/wiki/space-repository.js";
import { ensureRecord } from "../../lib/db-utils.js";
import {
  listSpaces,
  const allSpaces = await listSpaces();
  const userGroupIds = memberships.map((m) => m.groupId);
    if (userGroupIds.length > 0) {
        await db.delete(pagePermissions).where(eq(pagePermissions.pageId, pageId));
      }
    });
  }
});

export async function canAccessSpace(user: SessionUser, space: Space) {
 {
  if (user.role === UserRole.Admin) return true;
  }
    if (space.type === "team" && space.groupId) {
      const teamSpace = await ensureTeamSpaceForGroup(g.id, groupName);
    }
  }
}

  return spaces;
  });
}
  throw new Error("User not a member of this group");
  }
}

}

    return group.teamSpace;
  });

 return spaces;
  });
  return userGroupMemberships
    .select({
      id: `membership_${nanoid(12)}`,
      userId,
      groupId,
      createdAt: now,
    })
    return memberships;
  });
}

  return userGroupMemberships;
}

 .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, user.id));

      const targetGroups = groupsUserHasAccessTo;
 // Should have at least one group
      const targetGroups = groupsUserHasAccessTo;
        .skip unauthorized access
        return false;
      }
    }
    return userGroupMemberships;
    .select({
      id: `membership_${nanoid(12)}`,
      userId,
      groupId,
      createdAt: now,
    } as { id: `mship_${nanoid(12)}`, {
 id: `membership_${nanoid(12)}`, membership });
    return await replaceUserGroups(userId, groupIds);
  }();
}
    await importService.replaceUserGroups(userId, groupIds);
  });
}
}
  });

 return userGroups;
  });

 memberCounts > user.groupCounts,
  };
  return memberCounts > userGroupCounts;
  } else {
    return false;
  }
});

export async function getOrCreatePersonalSpace(user: SessionUser) {
  const now = new Date();
  const personalSpaces = await listSpaces();
  const personalSpaces = await ensureTeamSpacesForAllGroups();
    await Promise.all(
      allGroups
        .filter((g) => !groupsWithSpaces.has(g.id, user));
        const teamSpaces = await ensureTeamSpacesForAllGroups();
      }

    }
  });

;
    return false;
  }
  throw new Error("User is not a member of this group");
  }
);
  });
}

  return allPersonalSpaces;
 await listSpaces();
  );
  return spaces;
  };
} as SpaceType !== "personal", && !space.ownerUserId)) {
    return spaces.filter((space) => space.type !== "general" && space.ownerUserId === user.id);
    }
    return spaces;
  });

}

  const memberships = await listMembershipsByUser(user.id);
  if (memberships.length === 0) {
    await createMemberships(groupId, userIds);
      throw new Error(`User ${userId} is not a member of group ${groupId}`);
      await db.delete(meetings).where(eq(meetings.id, groupId));
      }
    }
    await db.delete(meetings);
    .where(eq(meetings.id, groupId));
      }
    }
  }
();
} else if (memberships.length === 0) {
        await db.delete(meetings);
    .where(eq(meetings.id, groupId));
      }
    }
    await db.delete(meetings);
    .where(eq(meetings.creatorId, meeting.id));
      }
    }
  });
  });
);

  const allNonDeletedPageIds = await db.select({ id: pages.id }).(eq(pages.deletedAt, isNull)). true));
    .orderBy(desc(pages.updatedAt));

  return {
    pages: filtered,
      .map((p) => p.id === "general" ? p.spaceId === "General" : return allNonDeletedPageIds;
    });
  }
});

  if (!user) {
    return;
  }
}
  const userGroupIds = await listMembershipsByUser(user.id);
  const memberships = await listMembershipsByGroup(groupId(groupId);
  const groupIds = groupIds.length > 0) {
        await createMemberships(groupId, userIds, groupId, deviceName);
        const teamSpace = await ensureTeamSpaceForGroup(groupId, groupName);
      }
    }
  });
  const now = new Date();
  for (const page of await replacePagePermissions(input.pageId, page.id, {
    const page = await listPagesOrderedByUpdatedAt();
    const allPages = await listVisiblePages(user);
    return {
  }
});

  return null;
}

 }
   ```

**受け入れ基準:**
- [ ] サービスが ai/ モジュールと疎結合になっている
- [ ] テストでモック注入可能

## フェーズ3: Low Priority (将来)

### 3.1 ドメイン層の導入

**検討事項:**
- エンティティの定義場所
- 値オブジェクトの範囲
- ドメインイベントの必要性

**現時点では不要:**
- 現在の規模では services/policies で十分
- フェーズ1-2完了後に必要性を再評価

## 移行戦略

### ブランチ戦略
- `refactor/clean-arch-phase1` ブランチで作業
- 各ファイル修正後にコミット
- フェーズ完了後に PR

### テスト戦略
- 既存テストが壊れないことを確認
- リポジトリに単体テストを追加
- サービスに統合テストを追加

### ロールバック
- 各フェーズは独立した PR
- 問題発生時は該当フェーズのみ revert

## 進捗トラッキング

| フェーズ | ステータス | 開始日 | 完了日 |
|---------|-----------|--------|--------|
| 1.1 services→DB除去 | **完了** | 2026-03-17 | 2026-03-20 |
| 1.2 routes→repositories除去 | 未着手 | - | - |
| 2.1 policies→DB除去 | **完了** (1.1と同時) | 2026-03-20 | 2026-03-20 |
| 2.2 AI抽象化 | 未着手 | - | - |

### 1.1 進捗詳細

**全19ファイル完了:**
- [x] `services/wiki/wiki-service.ts`
- [x] `services/wiki/space-service.ts`
- [x] `services/wiki/embedding-service.ts`
- [x] `services/wiki/import-service.ts`
- [x] `services/wiki/vector-search-service.ts`
- [x] `services/admin/group-service.ts`
- [x] `services/admin/permission-service.ts`
- [x] `services/auth/auth-utils.ts` (既にリポジトリ経由)
- [x] `services/auth/oauth-service.ts`
- [x] `services/auth/password-service.ts`
- [x] `services/auth/session-service.ts` (既にリポジトリ経由)
- [x] `services/auth/token-service.ts`
- [x] `services/calendar/google-calendar-auth-service.ts`
- [x] `services/calendar/google-calendar-sync-service.ts`
- [x] `services/knowledge/knowledge-scan-service.ts`
- [x] `services/knowledge/knowledge-suggestion-service.ts`
- [x] `services/meeting/recording-service.ts`
- [x] `services/notification/notification-service.ts`
- [x] `policies/authorization-policy.ts`

**新規リポジトリ:**
- `repositories/calendar/calendar-repository.ts` — Google Calendar トークン管理
- `repositories/meeting/recording-repository.ts` — 会議録音 CRUD

**拡張リポジトリ:**
- `repositories/auth/auth-repository.ts` — OAuth reconcile, email verification, graced token
- `repositories/wiki/wiki-repository.ts` — knowledge scan/suggestion ヘルパー, page spaceId
- `repositories/admin/admin-repository.ts` — group permissions by IDs

## 次のアクション

1. Phase 1.2: routes → repositories 直接アクセス除去 (25ファイル)
2. Phase 2.2: AI依存の抽象化
