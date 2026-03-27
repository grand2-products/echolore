# ミーティングデータモデル リファクタリング — As-Is / To-Be

## 背景

ミーティング機能において、「現在の参加者」「過去の参加者」の情報がアプリケーションDB上に存在しない。
参加者の状態は LiveKit に完全に委譲されており、ミーティング一覧での参加状況表示や出席レポートが不可能。
また、ミーティングのライフサイクル管理（特に明示的な終了操作）が不十分。

他社サービス（Google Meet / Zoom / Teams）はすべてホストによる「全員終了」機能と出席記録を提供しており、
業務利用を想定する EchoLore にも同等の機能が求められる。

---

## 1. ミーティング参加者トラッキング

### As-Is

```
参加者の状態管理:
  ┌─────────────┐
  │   LiveKit    │  ← リアルタイム参加者の唯一の情報源
  │  (外部依存)  │     participant_joined / participant_left webhook あり
  └──────┬──────┘
         │ room_finished webhook
         ▼
  ┌─────────────┐
  │  meetings   │  status: scheduled → active → ended
  │  (DB)       │  参加者情報なし
  └─────────────┘

  ┌──────────────────────────┐
  │ meetingTranscriptSegments│  発言者の記録はあるが「参加者一覧」ではない
  │ (DB)                     │  発言しなかった参加者は記録されない
  └──────────────────────────┘

  ┌──────────────────────────┐
  │ meetingGuestRequests     │  ゲストの承認/拒否の記録のみ
  │ (DB)                     │  実際に参加したかは不明
  └──────────────────────────┘
```

**課題:**
- ミーティング一覧で「現在何人参加中か」が分からない
- ミーティング終了後、誰が参加していたか復元できない（発言者以外）
- 出席レポートが生成できない
- LiveKit API へのリアルタイム問い合わせは管理者のみ（`GET /api/livekit/rooms/:name/participants`）

### To-Be

```
  ┌─────────────┐
  │   LiveKit    │
  └──────┬──────┘
         │ participant_joined / participant_left webhook
         ▼
  ┌──────────────────────┐    NEW
  │ meetingParticipants  │
  │ (DB)                 │
  │                      │
  │  id                  │
  │  meetingId      → meetings.id (CASCADE)
  │  userId         → users.id (SET NULL) — 登録ユーザー
  │  guestIdentity  — ゲスト識別子 (nullable)
  │  displayName    — 表示名
  │  role           — "host" | "member" | "guest"
  │  joinedAt       — 参加時刻
  │  leftAt         — 退出時刻 (nullable = 現在参加中)
  │  createdAt      — レコード作成時刻
  └──────────────────────┘
         │
         ▼
  ┌─────────────┐
  │  meetings   │  既存 + participantCount (集計用)
  └─────────────┘
```

**API 変更:**
- `GET /api/meetings` レスポンスに `activeParticipantCount` を追加
- `GET /api/meetings/:id/participants` 新設 — 参加者一覧（現在+過去）
- Worker の LiveKit webhook ハンドラで `participant_joined` / `participant_left` 時に DB 記録

**利点:**
- 一覧画面で参加人数バッジを表示可能
- ミーティング詳細で参加者リスト表示
- 出席レポート（joinedAt / leftAt）の生成が可能
- ゲスト・登録ユーザーを統一的に管理

---

## 2. ミーティングライフサイクル

### As-Is

```
ステートマシン:

  scheduled ──[LiveKit room_started]──→ active ──[LiveKit room_finished]──→ ended
                                          ↑                                   │
                                          └──[participant_joined]─────────────┘
                                              (自動復帰)

終了方法:
  1. 自動終了: 最後の参加者が退出 → LiveKit room_finished → Worker → API
  2. API手動: PUT /api/meetings/:id { status: "ended" } (作成者のみ)
  3. UIなし: フロントエンドに「ミーティング終了」ボタンがない
             「Leave（退出）」ボタンのみ = 自分が退出するだけ
```

**課題:**
- ホストが意図的にミーティングを終了する手段がUIにない
- 「Leave」と「End Meeting」の区別がない（Google Meet / Zoom / Teams にはある）
- ended 後に再参加で active に戻る動作は、意図的な終了を無効化してしまう

### To-Be

```
ステートマシン:

  scheduled ──[room_started / participant_joined]──→ active
                                                       │
                              ┌─────────────────────────┤
                              │                         │
                    [host: "End for All"]     [room_finished (自動)]
                              │                         │
                              ▼                         ▼
                        force_ended                   ended
                     (再参加不可)              (再参加で active に復帰可)

UI:
  ┌──────────────────────────────────────────┐
  │  [Leave]  ← 自分だけ退出                  │
  │  [End Meeting for All]  ← 全員終了(host)  │   NEW
  └──────────────────────────────────────────┘
```

**変更内容:**
- `meetings.status` に `"force_ended"` を追加（ホストが明示的に終了）
- `force_ended` 状態では再参加による active 復帰を抑止
- フロントエンドに「ミーティングを終了」ボタン追加（作成者のみ表示）
- 終了時に LiveKit `roomService.removeParticipant()` で全参加者を退出させる

---

## 3. スキーマ整合性の改善

### As-Is

| 問題 | 箇所 |
|------|------|
| `onDelete` 未設定 | `pages.parentId`, `userGroupMemberships.addedBy`, `pageRevisions.authorId` |
| FK パターン不統一 | `aiChatMessages` のみ `foreignKey()` 関数、他はインライン `.references()` |
| リレーション定義欠落 | `userInvitations` にリレーション未定義 |
| インデックス不足 | `spaces.type`, `pages.deletedAt`, `meetings.status` にインデックスなし |
| スキーマ一極集中 | 1ファイル 1,065行に全36テーブル |

### To-Be

| 改善 | 対応 |
|------|------|
| `onDelete` 明示化 | 全 FK に `onDelete` を明示指定（cascade / set null / restrict） |
| FK パターン統一 | `aiChatMessages` をインライン `.references()` に統一 |
| リレーション補完 | `userInvitations` のリレーション定義追加 |
| インデックス追加 | 頻出フィルタカラムにインデックス追加 |
| スキーマ分割 | ドメインごとにファイル分割（後述） |

**インデックス追加候補:**
```
spaces.type                         — スペース種別フィルタ
pages.deletedAt                     — ソフトデリートクエリ
pages.spaceId                       — スペース内ページ一覧
meetings.status                     — ステータスフィルタ
meetings.creatorId                  — ユーザーのミーティング一覧
meetingParticipants.meetingId        — 参加者一覧 (NEW)
meetingParticipants.userId           — ユーザーの参加履歴 (NEW)
meetingTranscriptSegments.meetingId  — セグメント取得
auditLogs.createdAt                 — 監査ログ時系列
```

---

## 4. スキーマファイル分割（オプション）

### As-Is

```
apps/api/src/db/
  schema.ts          ← 1,065行、全36テーブル + 34リレーション + 型エクスポート
```

### To-Be

```
apps/api/src/db/
  schema/
    index.ts           ← re-export のみ
    common.ts          ← customType (vector) 定義
    auth.ts            ← users, authIdentities, authRefreshTokens, emailVerificationTokens
    groups.ts          ← userGroups, userGroupMemberships, userInvitations
    wiki.ts            ← spaces, pages, blocks, pageRevisions, pagePermissions,
                         spacePermissions, pageInheritance, yjsDocuments, pageEmbeddings
    meetings.ts        ← meetings, meetingParticipants, meetingInvites, meetingGuestRequests,
                         meetingRecordings, meetingTranscriptSegments, transcripts, summaries,
                         googleCalendarTokens
    agents.ts          ← agents, meetingAgentSessions, meetingAgentEvents
    aituber.ts         ← aituberCharacters, aituberSessions, aituberMessages
    ai-chat.ts         ← aiChatConversations, aiChatMessages
    knowledge.ts       ← knowledgeSuggestions
    system.ts          ← files, auditLogs, siteSettings
    relations.ts       ← 全リレーション定義（Drizzle の制約上、1ファイルが望ましい場合あり）
    types.ts           ← 全型エクスポート
```

**注意:** Drizzle ORM はリレーション定義時にテーブル参照が必要なため、
循環参照に注意が必要。分割は段階的に進める。

---

## 5. 実装優先度

| 優先度 | 項目 | 影響範囲 | 工数感 |
|--------|------|----------|--------|
| **P0** | `meetingParticipants` テーブル新設 + webhook 連携 | API, Worker | **実装済み** (migration 0003) |
| **P0** | ミーティング一覧に参加人数を追加 | API, Web | **実装済み** |
| **P1** | 「End Meeting for All」UI + API | API, Web | **実装済み** (`POST /meetings/:id/end` + RoomBody ボタン) |
| **P1** | `onDelete` 整備 (全FK明示化) | API (マイグレーション) | **実装済み** (migration 0004) |
| **P1** | インデックス追加 (11インデックス) | API (マイグレーション) | **実装済み** (migration 0005) |
| **P2** | リレーション定義補完 (`userInvitations`) | API | **実装済み** |
| **P2** | FK パターン統一 (`aiChatMessages` → inline `.references()`) | API | **実装済み** (migration 0005) |
| **P3** | スキーマファイル分割 (tables/relations/types) | API | **実装済み** |

---

## 6. マイグレーション戦略

- 新テーブル (`meetingParticipants`) は **additive change** のため安全にデプロイ可能
- `onDelete` 変更は既存 FK の ALTER が必要 — ダウンタイムなしで可能だが、既存の孤立データの確認が先
- インデックス追加は `CREATE INDEX CONCURRENTLY` で無停止適用
- スキーマ分割はコードのみの変更（マイグレーション不要）
