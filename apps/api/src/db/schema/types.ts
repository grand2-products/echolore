import type {
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
  siteSettings,
  spacePermissions,
  spaces,
  summaries,
  transcripts,
  userGroupMemberships,
  userGroups,
  users,
  yjsDocuments,
} from "./tables.js";

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
export type PageRevision = typeof pageRevisions.$inferSelect;
export type NewPageRevision = typeof pageRevisions.$inferInsert;
export type PagePermission = typeof pagePermissions.$inferSelect;
export type NewPagePermission = typeof pagePermissions.$inferInsert;
export type PageInheritance = typeof pageInheritance.$inferSelect;
export type NewPageInheritance = typeof pageInheritance.$inferInsert;
export type SpacePermission = typeof spacePermissions.$inferSelect;
export type NewSpacePermission = typeof spacePermissions.$inferInsert;
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
export type AiChatConversation = typeof aiChatConversations.$inferSelect;
export type NewAiChatConversation = typeof aiChatConversations.$inferInsert;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type NewAiChatMessage = typeof aiChatMessages.$inferInsert;
export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;
export type NewGoogleCalendarToken = typeof googleCalendarTokens.$inferInsert;
export type YjsDocument = typeof yjsDocuments.$inferSelect;
export type NewYjsDocument = typeof yjsDocuments.$inferInsert;
export type PageEmbedding = typeof pageEmbeddings.$inferSelect;
export type NewPageEmbedding = typeof pageEmbeddings.$inferInsert;
export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert;
export type MeetingInvite = typeof meetingInvites.$inferSelect;
export type NewMeetingInvite = typeof meetingInvites.$inferInsert;
export type MeetingGuestRequest = typeof meetingGuestRequests.$inferSelect;
export type NewMeetingGuestRequest = typeof meetingGuestRequests.$inferInsert;
export type AituberCharacter = typeof aituberCharacters.$inferSelect;
export type NewAituberCharacter = typeof aituberCharacters.$inferInsert;
export type AituberSession = typeof aituberSessions.$inferSelect;
export type NewAituberSession = typeof aituberSessions.$inferInsert;
export type AituberMessage = typeof aituberMessages.$inferSelect;
export type NewAituberMessage = typeof aituberMessages.$inferInsert;
export type KnowledgeSuggestion = typeof knowledgeSuggestions.$inferSelect;
export type NewKnowledgeSuggestion = typeof knowledgeSuggestions.$inferInsert;
