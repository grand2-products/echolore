import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace(/^\[/, "").replace(/\]$/, "").split(",").map(Number);
  },
});

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  emailVerifiedAt: timestamp("email_verified_at"),
  tokenVersion: integer("token_version").default(1).notNull(),
  role: text("role").default("member").notNull(), // admin, member
  suspendedAt: timestamp("suspended_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(), // google, password
    providerUserId: text("provider_user_id"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    providerUserUnique: uniqueIndex("auth_identities_provider_user_unique").on(
      table.provider,
      table.providerUserId
    ),
    userProviderUnique: uniqueIndex("auth_identities_user_provider_unique").on(
      table.userId,
      table.provider
    ),
  })
);

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull(), // password-registration
  pendingName: text("pending_name"),
  pendingPasswordHash: text("pending_password_hash"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    clientType: text("client_type").notNull(), // web, mobile
    authMode: text("auth_mode").notNull(), // password, sso
    deviceName: text("device_name"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    rotatedFromId: text("rotated_from_id"),
    revokedAt: timestamp("revoked_at"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_refresh_tokens_token_hash_unique").on(table.tokenHash),
  })
);

// User invitations table
export const userInvitations = pgTable("user_invitations", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role").default("member").notNull(),
  groupIds: jsonb("group_ids").notNull().$type<string[]>(),
  invitedByUserId: text("invited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User groups table
export const userGroups = pgTable("user_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  permissions: jsonb("permissions").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User group memberships table (many-to-many)
export const userGroupMemberships = pgTable("user_group_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  groupId: text("group_id")
    .references(() => userGroups.id, { onDelete: "cascade" })
    .notNull(),
  addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Wiki spaces table
export const spaces = pgTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(), // "general" | "team" | "personal"
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    personalOwnerUnique: uniqueIndex("spaces_personal_owner_unique")
      .on(table.type, table.ownerUserId)
      .where(sql`type = 'personal'`),
    teamGroupUnique: uniqueIndex("spaces_team_group_unique")
      .on(table.type, table.groupId)
      .where(sql`type = 'team'`),
    typeIdx: index("spaces_type_idx").on(table.type),
  })
);

// Wiki pages table
export const pages = pgTable(
  "pages",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    spaceId: text("space_id")
      .references(() => spaces.id, { onDelete: "cascade" })
      .notNull(),
    parentId: text("parent_id"),
    authorId: text("author_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    spaceIdIdx: index("pages_space_id_idx").on(table.spaceId),
    deletedAtIdx: index("pages_deleted_at_idx").on(table.deletedAt),
    parentIdIdx: index("pages_parent_id_idx").on(table.parentId),
  })
);

// Blocks table (Notion-like block-based content)
export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .references(() => pages.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(), // text, heading1, heading2, image, file, etc.
  content: text("content"), // JSON or plain text
  properties: jsonb("properties").$type<Record<string, unknown> | null>(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Page revisions table (version history snapshots)
export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").notNull().$type<
      Array<{
        type: string;
        content: string | null;
        properties: Record<string, unknown> | null;
        sortOrder: number;
      }>
    >(),
    authorId: text("author_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pageRevisionUnique: uniqueIndex("page_revisions_page_id_revision_number_idx").on(
      table.pageId,
      table.revisionNumber
    ),
  })
);

// Page permissions table
export const pagePermissions = pgTable("page_permissions", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .references(() => pages.id, { onDelete: "cascade" })
    .notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }),
  canRead: boolean("can_read").default(true).notNull(),
  canWrite: boolean("can_write").default(false).notNull(),
  canDelete: boolean("can_delete").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Space permissions table
export const spacePermissions = pgTable(
  "space_permissions",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .references(() => spaces.id, { onDelete: "cascade" })
      .notNull(),
    groupId: text("group_id")
      .references(() => userGroups.id, { onDelete: "cascade" })
      .notNull(),
    canRead: boolean("can_read").default(true).notNull(),
    canWrite: boolean("can_write").default(false).notNull(),
    canDelete: boolean("can_delete").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    spaceGroupUnique: uniqueIndex("space_permissions_space_group_unique").on(
      table.spaceId,
      table.groupId
    ),
  })
);

// Page inheritance settings table
export const pageInheritance = pgTable("page_inheritance", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .references(() => pages.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  inheritFromParent: boolean("inherit_from_parent").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meetings table
export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    creatorId: text("creator_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    roomName: text("room_name").notNull().unique(),
    status: text("status").default("scheduled").notNull(), // scheduled, active, ended
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    scheduledAt: timestamp("scheduled_at"),
    googleCalendarEventId: text("google_calendar_event_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("meetings_status_idx").on(table.status),
    creatorIdIdx: index("meetings_creator_id_idx").on(table.creatorId),
  })
);

// Meeting participants table (join/leave tracking)
export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .references(() => meetings.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    guestIdentity: text("guest_identity"),
    displayName: text("display_name").notNull(),
    role: text("role").default("member").notNull(), // host, member, guest
    joinedAt: timestamp("joined_at").notNull(),
    leftAt: timestamp("left_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    meetingIdIdx: index("meeting_participants_meeting_id_idx").on(table.meetingId),
    userIdIdx: index("meeting_participants_user_id_idx").on(table.userId),
  })
);

// Meeting invites table (guest access)
export const meetingInvites = pgTable("meeting_invites", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  token: text("token").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  label: text("label"),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting guest requests table (approval queue + audit trail)
export const meetingGuestRequests = pgTable("meeting_guest_requests", {
  id: text("id").primaryKey(),
  inviteId: text("invite_id")
    .references(() => meetingInvites.id, { onDelete: "cascade" })
    .notNull(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  guestName: text("guest_name").notNull(),
  guestIdentity: text("guest_identity").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  approvedByUserId: text("approved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// Meeting recordings table
export const meetingRecordings = pgTable("meeting_recordings", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  egressId: text("egress_id").notNull().unique(),
  status: text("status").notNull(), // starting, recording, stopping, completed, failed
  initiatedBy: text("initiated_by").references(() => users.id, { onDelete: "set null" }),
  storagePath: text("storage_path"),
  fileSize: integer("file_size"),
  durationMs: integer("duration_ms"),
  contentType: text("content_type"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Google Calendar tokens table
export const googleCalendarTokens = pgTable("google_calendar_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scope: text("scope").notNull(),
  calendarId: text("calendar_id").default("primary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Meeting transcripts table
export const transcripts = pgTable("transcripts", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  speakerId: text("speaker_id").references(() => users.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting summaries table (AI-generated)
export const summaries = pgTable("summaries", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Realtime meeting transcript segments table
export const meetingTranscriptSegments = pgTable(
  "meeting_transcript_segments",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .references(() => meetings.id, { onDelete: "cascade" })
      .notNull(),
    participantIdentity: text("participant_identity").notNull(),
    speakerUserId: text("speaker_user_id").references(() => users.id, { onDelete: "set null" }),
    speakerLabel: text("speaker_label").notNull(),
    content: text("content").notNull(),
    isPartial: boolean("is_partial").default(true).notNull(),
    segmentKey: text("segment_key").notNull(),
    provider: text("provider").notNull(),
    confidence: integer("confidence"),
    startedAt: timestamp("started_at").notNull(),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    meetingIdIdx: index("meeting_transcript_segments_meeting_id_idx").on(table.meetingId),
  })
);

// Admin-defined AI employee profiles
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  voiceProfile: text("voice_profile"),
  interventionStyle: text("intervention_style").notNull(),
  defaultProvider: text("default_provider").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  autonomousEnabled: boolean("autonomous_enabled").default(false).notNull(),
  autonomousCooldownSec: integer("autonomous_cooldown_sec").default(120).notNull(),
  createdBy: text("created_by")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Meeting-scoped AI employee sessions
export const meetingAgentSessions = pgTable("meeting_agent_sessions", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  agentId: text("agent_id")
    .references(() => agents.id, { onDelete: "cascade" })
    .notNull(),
  state: text("state").notNull(),
  invokedByUserId: text("invoked_by_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  lastAutoEvalSegmentId: text("last_auto_eval_segment_id"),
  joinedAt: timestamp("joined_at"),
  leftAt: timestamp("left_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting-scoped AI employee events
export const meetingAgentEvents = pgTable("meeting_agent_events", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  agentId: text("agent_id")
    .references(() => agents.id, { onDelete: "cascade" })
    .notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  triggeredByUserId: text("triggered_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Files table
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  storagePath: text("storage_path").notNull(),
  uploaderId: text("uploader_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
    resourceTypeIdx: index("audit_logs_resource_type_idx").on(table.resourceType),
  })
);

// AI Chat conversations table
export const aiChatConversations = pgTable("ai_chat_conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: text("creator_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  visibility: text("visibility").default("team").notNull(), // 'team' | 'private'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Chat messages table
export const aiChatMessages = pgTable("ai_chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .references(() => aiChatConversations.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  citations:
    jsonb("citations").$type<Array<{ pageId: string; pageTitle: string; snippet?: string }>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Yjs document state table (CRDT persistence)
export const yjsDocuments = pgTable("yjs_documents", {
  pageId: text("page_id")
    .references(() => pages.id, { onDelete: "cascade" })
    .primaryKey(),
  state: text("state").notNull(), // base64-encoded Y.encodeStateAsUpdate
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Page embeddings table (pgvector for RAG)
export const pageEmbeddings = pgTable(
  "page_embeddings",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .references(() => pages.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").default(0).notNull(),
    plainText: text("plain_text").notNull(),
    embedding: vector("embedding").notNull(),
    modelId: text("model_id").default("gemini-embedding-2-preview").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pageChunkUnique: uniqueIndex("page_embeddings_page_chunk_idx").on(
      table.pageId,
      table.chunkIndex
    ),
  })
);

// AITuber characters
export const aituberCharacters = pgTable("aituber_characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  personality: text("personality").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  speakingStyle: text("speaking_style"),
  languageCode: text("language_code").default("ja-JP").notNull(),
  voiceName: text("voice_name"),
  avatarUrl: text("avatar_url"),
  avatarFileId: text("avatar_file_id").references(() => files.id, { onDelete: "set null" }),
  createdBy: text("created_by")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AITuber sessions
export const aituberSessions = pgTable("aituber_sessions", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .references(() => aituberCharacters.id, { onDelete: "cascade" })
    .notNull(),
  creatorId: text("creator_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  title: text("title").notNull(),
  status: text("status").default("created").notNull(), // created, live, ended
  roomName: text("room_name").notNull().unique(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AITuber messages
export const aituberMessages = pgTable("aituber_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .references(() => aituberSessions.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // viewer, assistant
  senderUserId: text("sender_user_id").references(() => users.id, { onDelete: "set null" }),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Knowledge suggestions (AI-proposed wiki updates)
export const knowledgeSuggestions = pgTable("knowledge_suggestions", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(), // file_upload, transcription, periodic_scan
  sourceId: text("source_id"),
  sourceSummary: text("source_summary"),
  targetType: text("target_type").notNull(), // new_page, update_page
  targetPageId: text("target_page_id").references(() => pages.id, { onDelete: "set null" }),
  targetSpaceId: text("target_space_id")
    .references(() => spaces.id, { onDelete: "cascade" })
    .notNull(),
  proposedTitle: text("proposed_title").notNull(),
  proposedBlocks: jsonb("proposed_blocks").notNull().$type<
    Array<{
      type: string;
      content: string | null;
      properties: Record<string, unknown> | null;
      sortOrder: number;
    }>
  >(),
  aiReasoning: text("ai_reasoning").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  resultPageId: text("result_page_id").references(() => pages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Site settings (KVS)
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
