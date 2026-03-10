import { pgTable, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").default("member").notNull(), // admin, member
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  groupId: text("group_id").references(() => userGroups.id, { onDelete: "cascade" }).notNull(),
  addedBy: text("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Wiki pages table
export const pages = pgTable("pages", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  parentId: text("parent_id"),
  authorId: text("author_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Blocks table (Notion-like block-based content)
export const blocks = pgTable("blocks", {
  id: text("id").primaryKey(),
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull(),
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
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull(),
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
  pageId: text("page_id").references(() => pages.id, { onDelete: "cascade" }).notNull().unique(),
  inheritFromParent: boolean("inherit_from_parent").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meetings table
export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: text("creator_id").references(() => users.id).notNull(),
  roomName: text("room_name").notNull().unique(),
  status: text("status").default("scheduled").notNull(), // scheduled, active, ended
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting transcripts table
export const transcripts = pgTable("transcripts", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull(),
  speakerId: text("speaker_id").references(() => users.id),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Meeting summaries table (AI-generated)
export const summaries = pgTable("summaries", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").references(() => meetings.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Files table
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  gcsPath: text("gcs_path").notNull(),
  uploaderId: text("uploader_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  pages: many(pages),
  meetings: many(meetings),
  files: many(files),
  groupMemberships: many(userGroupMemberships),
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

export const pagesRelations = relations(pages, ({ one, many }) => ({
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

export const filesRelations = relations(files, ({ one }) => ({
  uploader: one(users, {
    fields: [files.uploaderId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMembership = typeof userGroupMemberships.$inferSelect;
export type NewUserGroupMembership = typeof userGroupMemberships.$inferInsert;
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
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
