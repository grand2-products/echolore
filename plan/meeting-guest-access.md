# 会議機能：ゲストアクセス（非ログインユーザー対応）

## Context

現在、会議機能は全てのユーザーにログインを要求する。外部の取引先やクライアントが会議に参加するには、システムにアカウントを作成する必要がある。Google Meet風に、招待リンクを共有 → ゲストが名前入力 → ルーム内メンバーが承認 → 参加、というフローを実現する。

## ユーザーフロー

```
[ホスト] 会議作成 → 招待リンク生成 → リンク共有
                                          ↓
[ゲスト] リンクを開く → 名前入力 → 「参加リクエスト」送信
                                          ↓
[ルーム内] 全メンバーに通知 → 誰かが「承認」or「拒否」
                                          ↓
[ゲスト] 承認 → LiveKitトークン取得 → ルーム参加
         拒否 → エラー表示
```

## 設計方針：DB管理の招待トークン + リアルタイム承認

- 招待トークンはDBで管理（取り消し・使用回数制限対応）
- 承認/拒否はLiveKitの `useDataChannel` でリアルタイム通知
- ゲスト待機中はAPIポーリングで承認状態を確認（DataChannelはルーム参加前は使えないため）

## DBスキーマ追加

### `meetingInvites` テーブル
```sql
id               text PK
meeting_id       text FK -> meetings.id (CASCADE) NOT NULL
token            text UNIQUE NOT NULL
created_by_user_id text FK -> users.id NOT NULL
label            text (nullable, 例: "クライアントチーム用")
max_uses         integer (nullable = 無制限)
use_count        integer DEFAULT 0
expires_at       timestamp NOT NULL
revoked_at       timestamp (nullable)
created_at       timestamp DEFAULT now()
```

### `meetingGuestRequests` テーブル（承認待ちキュー + 監査証跡）
```sql
id               text PK
invite_id        text FK -> meetingInvites.id (CASCADE) NOT NULL
meeting_id       text FK -> meetings.id (CASCADE) NOT NULL
guest_name       text NOT NULL
guest_identity   text NOT NULL (例: "guest-田中-a1b2c3")
status           text NOT NULL DEFAULT 'pending'  -- pending, approved, rejected
approved_by_user_id text FK -> users.id (nullable)
ip_address       text (nullable)
user_agent       text (nullable)
created_at       timestamp DEFAULT now()
resolved_at      timestamp (nullable)
```

## APIルート

### パブリック（authGuard前に配置）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/meetings/join/:token` | 招待トークン検証 → 会議情報返却 |
| POST | `/api/meetings/join/:token/request` | 参加リクエスト作成（名前送信） |
| GET | `/api/meetings/join/:token/request/:requestId/status` | 承認状態ポーリング |

**GET `/api/meetings/join/:token`**
- 招待の有効性チェック（期限、使用回数、取り消し）
- 返却: `{ meeting: { id, title, status }, invite: { id, label, expiresAt } }`

**POST `/api/meetings/join/:token/request`**
- Body: `{ guestName: string }`
- 招待再検証 + `meetingGuestRequests` にpending行挿入
- `useCount` をアトミック増加
- 返却: `{ requestId, guestIdentity }`

**GET `.../status`**
- ゲストがポーリング（2秒間隔）
- pending → `{ status: "pending" }`
- approved → `{ status: "approved", token: "<LiveKitトークン>", roomName }`
- rejected → `{ status: "rejected" }`

### 認証済み（既存authGuard配下）

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/meetings/:id/invites` | 招待リンク作成 |
| GET | `/api/meetings/:id/invites` | 招待一覧 |
| DELETE | `/api/meetings/:id/invites/:inviteId` | 招待取り消し |
| GET | `/api/meetings/:id/guest-requests` | 承認待ちリクエスト一覧 |
| POST | `/api/meetings/:id/guest-requests/:requestId/approve` | 承認 |
| POST | `/api/meetings/:id/guest-requests/:requestId/reject` | 拒否 |

## リアルタイム通知（LiveKit DataChannel）

既存の `useDataChannel` パターン（`reaction`, `screen-annotation`）に倣い、`guest-request` チャンネルを追加。

### メッセージ型
```typescript
// ルーム内参加者 → 全員にブロードキャスト
type GuestRequestMessage =
  | { type: "guest-request-new"; requestId: string; guestName: string }
  | { type: "guest-request-resolved"; requestId: string; status: "approved" | "rejected"; resolvedBy: string };
```

### フロー
1. ゲストが `POST .../request` → API が `meetingGuestRequests` にpending行作成
2. APIレスポンス後、フロントエンドが会議ルーム内の既存接続者へ通知する方法:
   - **方式**: APIサーバーがLiveKit Server SDK の `sendData` でルームにDataChannelメッセージを送信
   - これにより、ゲストがルーム外にいてもルーム内参加者に通知できる
3. ルーム内メンバーが承認/拒否 → `POST .../approve` or `.../reject`
4. ゲストはステータスポーリングで結果を検知 → 承認ならLiveKitトークンで参加

## フロントエンド

### 新規ページ: `/join/:token`（`(main)`レイアウト外）

`app/join/layout.tsx` — 認証不要のミニマルレイアウト

`app/join/[token]/page.tsx` — ゲスト参加ページ
- ステート: `loading` → `name-entry` → `waiting` → `in-room` / `rejected` / `error`
- `loading`: GET でトークン検証
- `name-entry`: 名前入力フォーム + 「参加リクエスト」ボタン
- `waiting`: 「承認を待っています...」画面 + ステータスポーリング
- `in-room`: LiveKitRoom に接続
- `rejected`: 「参加が拒否されました」表示
- `error`: 期限切れ/取り消し済み/満員 表示

### GuestRoomBody（簡易版ルーム）
RoomBodyから以下を除外:
- AI Agent パネル
- 録画コントロール
- 文字起こしパネル

残す: ビデオグリッド、画面共有、メディアトグル、リアクション

### ゲスト承認通知UI（ルーム内）
`apps/web/components/livekit/GuestApprovalBanner.tsx`
- DataChannel `guest-request` を購読
- 新しいリクエスト時: 画面上部にトースト「田中さんが参加を希望しています [承認] [拒否]」
- いずれかが操作したら消える

### InviteDialog（招待管理モーダル）
`apps/web/components/meetings/InviteDialog.tsx`
- 会議ルームページに「ゲスト招待」ボタン（オーナー/管理者のみ）
- ラベル（任意）、使用回数上限（任意）、有効期限（1h/6h/24h/7d）
- リンクコピーボタン
- 既存招待の一覧・取り消し

## セキュリティ

- **トークン**: `crypto.randomUUID()` (128bit)
- **レート制限**: パブリックPOSTにIP単位10回/分
- **useCount競合**: `WHERE use_count < max_uses` でアトミック更新
- **ゲストID**: `guest-` プレフィックスで区別
- **CSRF**: `/api/meetings/join/` はCSRFスキップ（トークン自体が保護）
- **承認バイパス防止**: LiveKitトークンは承認後のステータスポーリングレスポンスでのみ返却。`status=approved` のリクエストにのみトークン発行
- **セッション不保持**: ゲストはcookie/JWTなし

## 変更ファイル一覧

### 新規作成
| ファイル | 目的 |
|----------|------|
| `apps/api/src/routes/meeting-guest.ts` | パブリック ゲスト参加・ステータスポーリングルート |
| `apps/api/src/routes/meetings/meeting-invites.ts` | 認証済み 招待管理・承認/拒否ルート |
| `apps/api/drizzle/XXXX_meeting_invites.sql` | マイグレーション（自動生成） |
| `apps/web/app/join/layout.tsx` | ゲスト用ミニマルレイアウト |
| `apps/web/app/join/[token]/page.tsx` | ゲスト参加ページ（名前入力 → 待機 → ルーム） |
| `apps/web/app/join/[token]/GuestRoomBody.tsx` | ゲスト用簡易ルーム |
| `apps/web/components/livekit/GuestApprovalBanner.tsx` | ルーム内承認通知トースト |
| `apps/web/components/meetings/InviteDialog.tsx` | 招待管理モーダル |

### 変更
| ファイル | 変更内容 |
|----------|----------|
| `apps/api/src/db/schema.ts` | `meetingInvites`, `meetingGuestRequests` テーブル追加 |
| `apps/api/src/index.ts` | `meetingGuestRoutes` をauthGuard前にマウント |
| `apps/api/src/routes/meetings/index.ts` | `meetingInviteRoutes` 追加 |
| `apps/api/src/lib/security-middleware.ts` | CSRF スキップリスト追加 |
| `packages/shared/src/contracts/index.ts` | 招待/ゲストリクエスト DTO追加 |
| `apps/web/lib/api/meetings.ts` | 招待/ゲスト API関数追加 |
| `apps/web/lib/api/fetch.ts` | `fetchPublic` ヘルパー追加 |
| `apps/web/app/(main)/meetings/[id]/page.tsx` | 「ゲスト招待」ボタン追加 |
| `apps/web/app/(main)/meetings/[id]/RoomBody.tsx` | `GuestApprovalBanner` 統合 |

## 実装順序

1. スキーマ + マイグレーション
2. 共有コントラクト (DTO)
3. バックエンド: パブリックゲストルート（トークン検証、リクエスト作成、ステータスポーリング）
4. バックエンド: 認証済みルート（招待CRUD、承認/拒否）
5. バックエンド: DataChannel通知（LiveKit Server SDK sendData）
6. フロントエンド: APIクライアント
7. フロントエンド: ゲスト参加ページ（名前入力 → 待機 → ルーム）
8. フロントエンド: GuestApprovalBanner（ルーム内承認UI）
9. フロントエンド: InviteDialog（招待管理）
10. テスト・検証

## 検証方法

1. `npx drizzle-kit generate && npx drizzle-kit migrate` でマイグレーション
2. `AUTH_SECRET=test npx vitest run` で全テスト通過
3. `npx tsc --noEmit` で型チェック
4. 手動テスト:
   - 会議作成 → 招待リンク生成 → シークレットウィンドウで開く
   - 名前入力 → 参加リクエスト → ルーム内に通知が表示される
   - 承認 → ゲストがルームに参加
   - 拒否 → ゲストに「拒否されました」表示
   - 有効期限切れリンク → エラー表示
   - 招待取り消し後 → エラー表示
   - maxUses到達後 → 「満員」表示

## 未決事項

- [ ] ゲストが退室後に再参加する場合、再承認が必要か？（現案: 同じrequestIdで再接続可能、再承認不要）
- [ ] 承認待ちタイムアウト（例: 5分で自動キャンセル）は必要か？
