import { relations, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  emailVerifiedAt: timestamp("email_verified_at"),
  tokenVersion: integer("token_version").default(1).notNull(),
  role: text("role").default("member").notNull(), // admin, member
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
  addedBy: text("added_by").references(() => users.id),
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
  })
);

// Wiki pages table
export const pages = pgTable("pages", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  spaceId: text("space_id")
    .references(() => spaces.id)
    .notNull(),
  parentId: text("parent_id"),
  authorId: text("author_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Blocks table (Notion-like block-based content)
export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  pageId: text("page_id")
    .references(() => pages.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(), // text, heading1, heading2, image, file, etc.
  content: text("content"), // JSON or plain text
  properties: jsonb("properties"), // Additional block properties
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: text("creator_id")
    .references(() => users.id)
    .notNull(),
  roomName: text("room_name").notNull().unique(),
  status: text("status").default("scheduled").notNull(), // scheduled, active, ended
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting recordings table
export const meetingRecordings = pgTable("meeting_recordings", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  egressId: text("egress_id").notNull().unique(),
  status: text("status").notNull(), // starting, recording, stopping, completed, failed
  initiatedBy: text("initiated_by").references(() => users.id),
  storagePath: text("storage_path"),
  fileSize: integer("file_size"),
  durationMs: integer("duration_ms"),
  contentType: text("content_type"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting transcripts table
export const transcripts = pgTable("transcripts", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  speakerId: text("speaker_id").references(() => users.id),
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
export const meetingTranscriptSegments = pgTable("meeting_transcript_segments", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  participantIdentity: text("participant_identity").notNull(),
  speakerUserId: text("speaker_user_id").references(() => users.id),
  speakerLabel: text("speaker_label").notNull(),
  content: text("content").notNull(),
  isPartial: boolean("is_partial").default(true).notNull(),
  segmentKey: text("segment_key").notNull(),
  provider: text("provider").notNull(),
  confidence: integer("confidence"),
  startedAt: timestamp("started_at").notNull(),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
    .references(() => users.id)
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
    .references(() => users.id)
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
  triggeredByUserId: text("triggered_by_user_id").references(() => users.id),
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
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Site settings (KVS)
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  pages: many(pages),
  meetings: many(meetings),
  files: many(files),
  authIdentities: many(authIdentities),
  authRefreshTokens: many(authRefreshTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  groupMemberships: many(userGroupMemberships),
  transcriptSegments: many(meetingTranscriptSegments),
  createdAgents: many(agents),
  invokedAgentSessions: many(meetingAgentSessions),
  triggeredAgentEvents: many(meetingAgentEvents),
}));

export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, {
    fields: [authIdentities.userId],
    references: [users.id],
  }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationTokens.userId],
    references: [users.id],
  }),
}));

export const authRefreshTokensRelations = relations(authRefreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [authRefreshTokens.userId],
    references: [users.id],
  }),
}));

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

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  ownerUser: one(users, {
    fields: [spaces.ownerUserId],
    references: [users.id],
  }),
  group: one(userGroups, {
    fields: [spaces.groupId],
    references: [userGroups.id],
  }),
  pages: many(pages),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  space: one(spaces, {
    fields: [pages.spaceId],
    references: [spaces.id],
  }),
  author: one(users, {
    fields: [pages.authorId],
    references: [users.id],
  }),
  parent: one(pages, {
    fields: [pages.parentId],
    references: [pages.id],
  }),
  blocks: many(blocks),
  permissions: many(pagePermissions),
  inheritance: one(pageInheritance),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  page: one(pages, {
    fields: [blocks.pageId],
    references: [pages.id],
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

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  creator: one(users, {
    fields: [meetings.creatorId],
    references: [users.id],
  }),
  transcripts: many(transcripts),
  summaries: many(summaries),
  transcriptSegments: many(meetingTranscriptSegments),
  agentSessions: many(meetingAgentSessions),
  agentEvents: many(meetingAgentEvents),
  recordings: many(meetingRecordings),
}));

export const meetingRecordingsRelations = relations(meetingRecordings, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingRecordings.meetingId],
    references: [meetings.id],
  }),
  initiator: one(users, {
    fields: [meetingRecordings.initiatedBy],
    references: [users.id],
  }),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  meeting: one(meetings, {
    fields: [transcripts.meetingId],
    references: [meetings.id],
  }),
  speaker: one(users, {
    fields: [transcripts.speakerId],
    references: [users.id],
  }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  meeting: one(meetings, {
    fields: [summaries.meetingId],
    references: [meetings.id],
  }),
}));

export const meetingTranscriptSegmentsRelations = relations(
  meetingTranscriptSegments,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingTranscriptSegments.meetingId],
      references: [meetings.id],
    }),
    speakerUser: one(users, {
      fields: [meetingTranscriptSegments.speakerUserId],
      references: [users.id],
    }),
  })
);

export const agentsRelations = relations(agents, ({ one, many }) => ({
  creator: one(users, {
    fields: [agents.createdBy],
    references: [users.id],
  }),
  meetingSessions: many(meetingAgentSessions),
  meetingEvents: many(meetingAgentEvents),
}));

export const meetingAgentSessionsRelations = relations(meetingAgentSessions, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingAgentSessions.meetingId],
    references: [meetings.id],
  }),
  agent: one(agents, {
    fields: [meetingAgentSessions.agentId],
    references: [agents.id],
  }),
  invokedByUser: one(users, {
    fields: [meetingAgentSessions.invokedByUserId],
    references: [users.id],
  }),
}));

export const meetingAgentEventsRelations = relations(meetingAgentEvents, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingAgentEvents.meetingId],
    references: [meetings.id],
  }),
  agent: one(agents, {
    fields: [meetingAgentEvents.agentId],
    references: [agents.id],
  }),
  triggeredByUser: one(users, {
    fields: [meetingAgentEvents.triggeredByUserId],
    references: [users.id],
  }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  uploader: one(users, {
    fields: [files.uploaderId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshToken = typeof authRefreshTokens.$inferInsert;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;
export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type NewUserGroupMembership = typeof userGroupMemberships.$inferInsert;
export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type PagePermission = typeof pagePermissions.$inferSelect;
export type NewPagePermission = typeof pagePermissions.$inferInsert;
export type PageInheritance = typeof pageInheritance.$inferSelect;
export type NewPageInheritance = typeof pageInheritance.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type Summary = typeof summaries.$inferSelect;
export type NewSummary = typeof summaries.$inferInsert;
export type MeetingTranscriptSegment = typeof meetingTranscriptSegments.$inferSelect;
export type NewMeetingTranscriptSegment = typeof meetingTranscriptSegments.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type MeetingAgentSession = typeof meetingAgentSessions.$inferSelect;
export type NewMeetingAgentSession = typeof meetingAgentSessions.$inferInsert;
export type MeetingAgentEvent = typeof meetingAgentEvents.$inferSelect;
export type NewMeetingAgentEvent = typeof meetingAgentEvents.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type NewSiteSetting = typeof siteSettings.$inferInsert;
export type MeetingRecording = typeof meetingRecordings.$inferSelect;
export type NewMeetingRecording = typeof meetingRecordings.$inferInsert;
