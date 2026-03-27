import { relations } from "drizzle-orm";
import {
  agents,
  aiChatConversations,
  aiChatMessages,
  aituberCharacters,
  aituberMessages,
  aituberSessions,
  auditLogs,
  authIdentities,
  authRefreshTokens,
  blocks,
  emailVerificationTokens,
  files,
  googleCalendarTokens,
  knowledgeSuggestions,
  meetingAgentEvents,
  meetingAgentSessions,
  meetingGuestRequests,
  meetingInvites,
  meetingParticipants,
  meetingRecordings,
  meetings,
  meetingTranscriptSegments,
  pageEmbeddings,
  pageInheritance,
  pagePermissions,
  pageRevisions,
  pages,
  spacePermissions,
  spaces,
  summaries,
  transcripts,
  userGroupMemberships,
  userGroups,
  userInvitations,
  users,
  yjsDocuments,
} from "./tables.js";

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
  aiChatConversations: many(aiChatConversations),
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
  spacePermissions: many(spacePermissions),
}));

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  invitedByUser: one(users, {
    fields: [userInvitations.invitedByUserId],
    references: [users.id],
  }),
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
  spacePermissions: many(spacePermissions),
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
  revisions: many(pageRevisions),
  permissions: many(pagePermissions),
  inheritance: one(pageInheritance),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  page: one(pages, {
    fields: [blocks.pageId],
    references: [pages.id],
  }),
}));

export const pageRevisionsRelations = relations(pageRevisions, ({ one }) => ({
  page: one(pages, {
    fields: [pageRevisions.pageId],
    references: [pages.id],
  }),
  author: one(users, {
    fields: [pageRevisions.authorId],
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

export const spacePermissionsRelations = relations(spacePermissions, ({ one }) => ({
  space: one(spaces, {
    fields: [spacePermissions.spaceId],
    references: [spaces.id],
  }),
  group: one(userGroups, {
    fields: [spacePermissions.groupId],
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
  invites: many(meetingInvites),
  guestRequests: many(meetingGuestRequests),
  participants: many(meetingParticipants),
}));

export const meetingParticipantsRelations = relations(meetingParticipants, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingParticipants.meetingId],
    references: [meetings.id],
  }),
  user: one(users, {
    fields: [meetingParticipants.userId],
    references: [users.id],
  }),
}));

export const meetingInvitesRelations = relations(meetingInvites, ({ one, many }) => ({
  meeting: one(meetings, {
    fields: [meetingInvites.meetingId],
    references: [meetings.id],
  }),
  createdByUser: one(users, {
    fields: [meetingInvites.createdByUserId],
    references: [users.id],
  }),
  guestRequests: many(meetingGuestRequests),
}));

export const meetingGuestRequestsRelations = relations(meetingGuestRequests, ({ one }) => ({
  invite: one(meetingInvites, {
    fields: [meetingGuestRequests.inviteId],
    references: [meetingInvites.id],
  }),
  meeting: one(meetings, {
    fields: [meetingGuestRequests.meetingId],
    references: [meetings.id],
  }),
  approvedByUser: one(users, {
    fields: [meetingGuestRequests.approvedByUserId],
    references: [users.id],
  }),
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

export const googleCalendarTokensRelations = relations(googleCalendarTokens, ({ one }) => ({
  user: one(users, {
    fields: [googleCalendarTokens.userId],
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

export const aiChatConversationsRelations = relations(aiChatConversations, ({ one, many }) => ({
  creator: one(users, {
    fields: [aiChatConversations.creatorId],
    references: [users.id],
  }),
  messages: many(aiChatMessages),
}));

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  conversation: one(aiChatConversations, {
    fields: [aiChatMessages.conversationId],
    references: [aiChatConversations.id],
  }),
}));

export const pageEmbeddingsRelations = relations(pageEmbeddings, ({ one }) => ({
  page: one(pages, {
    fields: [pageEmbeddings.pageId],
    references: [pages.id],
  }),
}));

export const yjsDocumentsRelations = relations(yjsDocuments, ({ one }) => ({
  page: one(pages, {
    fields: [yjsDocuments.pageId],
    references: [pages.id],
  }),
}));

export const aituberCharactersRelations = relations(aituberCharacters, ({ one, many }) => ({
  creator: one(users, {
    fields: [aituberCharacters.createdBy],
    references: [users.id],
  }),
  sessions: many(aituberSessions),
}));

export const aituberSessionsRelations = relations(aituberSessions, ({ one, many }) => ({
  character: one(aituberCharacters, {
    fields: [aituberSessions.characterId],
    references: [aituberCharacters.id],
  }),
  creator: one(users, {
    fields: [aituberSessions.creatorId],
    references: [users.id],
  }),
  messages: many(aituberMessages),
}));

export const aituberMessagesRelations = relations(aituberMessages, ({ one }) => ({
  session: one(aituberSessions, {
    fields: [aituberMessages.sessionId],
    references: [aituberSessions.id],
  }),
  senderUser: one(users, {
    fields: [aituberMessages.senderUserId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const knowledgeSuggestionsRelations = relations(knowledgeSuggestions, ({ one }) => ({
  targetPage: one(pages, {
    fields: [knowledgeSuggestions.targetPageId],
    references: [pages.id],
  }),
  targetSpace: one(spaces, {
    fields: [knowledgeSuggestions.targetSpaceId],
    references: [spaces.id],
  }),
  reviewedByUser: one(users, {
    fields: [knowledgeSuggestions.reviewedByUserId],
    references: [users.id],
  }),
  resultPage: one(pages, {
    fields: [knowledgeSuggestions.resultPageId],
    references: [pages.id],
  }),
}));
