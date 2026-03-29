import type { Generated } from "kysely";

// JSONB block type used in page_revisions and knowledge_suggestions
export interface BlockJson {
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
}

// Citation type used in ai_chat_messages
export interface CitationJson {
  pageId: string;
  pageTitle: string;
  snippet?: string;
}

// ─── Table interfaces ────────────────────────────────────────────

export interface UsersTable {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  tokenVersion: Generated<number>;
  role: Generated<string>;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AuthIdentitiesTable {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string | null;
  passwordHash: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface EmailVerificationTokensTable {
  id: string;
  userId: string | null;
  email: string;
  tokenHash: string;
  purpose: string;
  pendingName: string | null;
  pendingPasswordHash: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface AuthRefreshTokensTable {
  id: string;
  userId: string;
  clientType: string;
  authMode: string;
  deviceName: string | null;
  tokenHash: string;
  expiresAt: Date;
  rotatedFromId: string | null;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Generated<Date>;
}

export interface UserInvitationsTable {
  id: string;
  email: string;
  tokenHash: string;
  role: Generated<string>;
  groupIds: string[];
  invitedByUserId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface UserGroupsTable {
  id: string;
  name: string;
  description: string | null;
  isSystem: Generated<boolean>;
  permissions: string[];
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface UserGroupMembershipsTable {
  id: string;
  userId: string;
  groupId: string;
  addedBy: string | null;
  createdAt: Generated<Date>;
}

export interface SpacesTable {
  id: string;
  name: string;
  type: string;
  ownerUserId: string | null;
  groupId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PagesTable {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  deletedAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface BlocksTable {
  id: string;
  pageId: string;
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PageRevisionsTable {
  id: string;
  pageId: string;
  revisionNumber: number;
  title: string;
  blocks: BlockJson[];
  authorId: string;
  createdAt: Generated<Date>;
}

export interface PagePermissionsTable {
  id: string;
  pageId: string;
  groupId: string | null;
  canRead: Generated<boolean>;
  canWrite: Generated<boolean>;
  canDelete: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SpacePermissionsTable {
  id: string;
  spaceId: string;
  groupId: string;
  canRead: Generated<boolean>;
  canWrite: Generated<boolean>;
  canDelete: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface PageInheritanceTable {
  id: string;
  pageId: string;
  inheritFromParent: Generated<boolean>;
  createdAt: Generated<Date>;
}

export interface MeetingsTable {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: Generated<string>;
  startedAt: Date | null;
  endedAt: Date | null;
  scheduledAt: Date | null;
  googleCalendarEventId: string | null;
  createdAt: Generated<Date>;
}

export interface MeetingParticipantsTable {
  id: string;
  meetingId: string;
  userId: string | null;
  guestIdentity: string | null;
  displayName: string;
  role: Generated<string>;
  joinedAt: Date;
  leftAt: Date | null;
  createdAt: Generated<Date>;
}

export interface MeetingInvitesTable {
  id: string;
  meetingId: string;
  token: string;
  createdByUserId: string;
  label: string | null;
  maxUses: number | null;
  useCount: Generated<number>;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface MeetingGuestRequestsTable {
  id: string;
  inviteId: string;
  meetingId: string;
  guestName: string;
  guestIdentity: string;
  status: Generated<string>;
  approvedByUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
  resolvedAt: Date | null;
}

export interface MeetingRecordingsTable {
  id: string;
  meetingId: string;
  egressId: string;
  status: string;
  initiatedBy: string | null;
  storagePath: string | null;
  fileSize: number | null;
  durationMs: number | null;
  contentType: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  errorMessage: string | null;
  createdAt: Generated<Date>;
}

export interface GoogleCalendarTokensTable {
  id: string;
  userId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
  scope: string;
  calendarId: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface TranscriptsTable {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: Date;
  createdAt: Generated<Date>;
}

export interface SummariesTable {
  id: string;
  meetingId: string;
  content: string;
  createdAt: Generated<Date>;
}

export interface MeetingTranscriptSegmentsTable {
  id: string;
  meetingId: string;
  participantIdentity: string;
  speakerUserId: string | null;
  speakerLabel: string;
  content: string;
  isPartial: Generated<boolean>;
  segmentKey: string;
  provider: string;
  confidence: number | null;
  startedAt: Date;
  finalizedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface AgentsTable {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  voiceProfile: string | null;
  interventionStyle: string;
  defaultProvider: string;
  isActive: Generated<boolean>;
  autonomousEnabled: Generated<boolean>;
  autonomousCooldownSec: Generated<number>;
  createdBy: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MeetingAgentSessionsTable {
  id: string;
  meetingId: string;
  agentId: string;
  state: string;
  invokedByUserId: string;
  lastAutoEvalSegmentId: string | null;
  joinedAt: Date | null;
  leftAt: Date | null;
  createdAt: Generated<Date>;
}

export interface MeetingAgentEventsTable {
  id: string;
  meetingId: string;
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  triggeredByUserId: string | null;
  createdAt: Generated<Date>;
}

export interface FilesTable {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  storagePath: string;
  uploaderId: string;
  createdAt: Generated<Date>;
}

export interface AuditLogsTable {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Generated<Date>;
}

export interface AiChatConversationsTable {
  id: string;
  title: string;
  creatorId: string;
  visibility: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AiChatMessagesTable {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: CitationJson[] | null;
  createdAt: Generated<Date>;
}

export interface YjsDocumentsTable {
  pageId: string;
  state: string;
  updatedAt: Generated<Date>;
}

export interface PageEmbeddingsTable {
  id: string;
  pageId: string;
  chunkIndex: Generated<number>;
  plainText: string;
  embedding: string; // pgvector — serialized as '[0.1,0.2,...]'
  modelId: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AituberCharactersTable {
  id: string;
  name: string;
  personality: string;
  systemPrompt: string;
  speakingStyle: string | null;
  languageCode: Generated<string>;
  voiceName: string | null;
  avatarUrl: string | null;
  avatarFileId: string | null;
  createdBy: string;
  isPublic: Generated<boolean>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AituberSessionsTable {
  id: string;
  characterId: string;
  creatorId: string;
  title: string;
  status: Generated<string>;
  roomName: string;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface AituberMessagesTable {
  id: string;
  sessionId: string;
  role: string;
  senderUserId: string | null;
  senderName: string;
  content: string;
  processedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface KnowledgeSuggestionsTable {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceSummary: string | null;
  targetType: string;
  targetPageId: string | null;
  targetSpaceId: string;
  proposedTitle: string;
  proposedBlocks: BlockJson[];
  aiReasoning: string;
  status: Generated<string>;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  resultPageId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SiteSettingsTable {
  key: string;
  value: string;
  updatedAt: Generated<Date>;
}

// ─── Database interface ──────────────────────────────────────────

export interface Database {
  users: UsersTable;
  auth_identities: AuthIdentitiesTable;
  email_verification_tokens: EmailVerificationTokensTable;
  auth_refresh_tokens: AuthRefreshTokensTable;
  user_invitations: UserInvitationsTable;
  user_groups: UserGroupsTable;
  user_group_memberships: UserGroupMembershipsTable;
  spaces: SpacesTable;
  pages: PagesTable;
  blocks: BlocksTable;
  page_revisions: PageRevisionsTable;
  page_permissions: PagePermissionsTable;
  space_permissions: SpacePermissionsTable;
  page_inheritance: PageInheritanceTable;
  meetings: MeetingsTable;
  meeting_participants: MeetingParticipantsTable;
  meeting_invites: MeetingInvitesTable;
  meeting_guest_requests: MeetingGuestRequestsTable;
  meeting_recordings: MeetingRecordingsTable;
  google_calendar_tokens: GoogleCalendarTokensTable;
  transcripts: TranscriptsTable;
  summaries: SummariesTable;
  meeting_transcript_segments: MeetingTranscriptSegmentsTable;
  agents: AgentsTable;
  meeting_agent_sessions: MeetingAgentSessionsTable;
  meeting_agent_events: MeetingAgentEventsTable;
  files: FilesTable;
  audit_logs: AuditLogsTable;
  ai_chat_conversations: AiChatConversationsTable;
  ai_chat_messages: AiChatMessagesTable;
  yjs_documents: YjsDocumentsTable;
  page_embeddings: PageEmbeddingsTable;
  aituber_characters: AituberCharactersTable;
  aituber_sessions: AituberSessionsTable;
  aituber_messages: AituberMessagesTable;
  knowledge_suggestions: KnowledgeSuggestionsTable;
  site_settings: SiteSettingsTable;
}
