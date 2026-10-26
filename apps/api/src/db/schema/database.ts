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
  // Drive-specific fields (present when source === "drive")
  driveFileId?: string;
  driveFileName?: string;
  driveLink?: string;
  // GitHub-specific fields (present when source === "github")
  githubFileId?: string;
  githubFileName?: string;
  githubRepoOwner?: string;
  githubRepoName?: string;
  githubRepoBranch?: string;
  githubFilePath?: string;
  githubLink?: string;
  source?: "wiki" | "drive" | "github";
}

// Tool step type used in ai_chat_messages
export interface ToolStepJson {
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string;
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
  emoji: string | null;
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
  sortOrder: Generated<number>;
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
  llmConfigSetId: string | null;
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
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface AiChatMessagesTable {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citations: CitationJson[] | null;
  toolSteps: ToolStepJson[] | null;
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
  /** JSON-serialised collision capsule profile for motion correction. */
  motionProfile: string | null;
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

export interface GithubReposTable {
  id: string;
  owner: string;
  name: string;
  pathPrefix: string;
  installationId: number;
  branch: string;
  accessScope: Generated<string>;
  fileExtensions: Generated<string[]>;
  lastSyncAt: Date | null;
  syncStatus: Generated<string>;
  syncError: string | null;
  fileCount: Generated<number>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface GithubFilesTable {
  id: string;
  repoId: string;
  path: string;
  name: string;
  sha: string;
  plainText: string | null;
  size: number | null;
  lastModifiedAt: Date | null;
  lastIndexedAt: Date | null;
  indexStatus: Generated<string>;
  indexError: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface GithubEmbeddingsTable {
  id: string;
  fileId: string;
  chunkIndex: Generated<number>;
  plainText: string;
  embedding: string;
  modelId: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface GithubRepoPermissionsTable {
  id: string;
  repoId: string;
  groupId: string;
  createdAt: Generated<Date>;
}

export interface GithubSyncLogsTable {
  id: string;
  repoId: string;
  trigger: string;
  status: string;
  filesProcessed: Generated<number>;
  filesAdded: Generated<number>;
  filesUpdated: Generated<number>;
  filesRemoved: Generated<number>;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface DriveFilesTable {
  id: string;
  name: string;
  mimeType: string;
  driveId: string | null;
  parentFolderId: string | null;
  webViewLink: string | null;
  modifiedAt: Date | null;
  contentHash: string | null;
  lastIndexedAt: Date | null;
  indexStatus: Generated<string>; // 'pending' | 'indexed' | 'error' | 'skipped'
  indexError: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface DriveEmbeddingsTable {
  id: string;
  fileId: string;
  chunkIndex: Generated<number>;
  plainText: string;
  embedding: string; // pgvector — serialized as '[0.1,0.2,...]'
  modelId: Generated<string>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface DriveFilePermissionsTable {
  id: string;
  fileId: string;
  permissionType: string; // 'user' | 'group' | 'domain' | 'anyone'
  email: string | null;
  domain: string | null;
  role: string; // 'reader' | 'writer' | 'owner' etc.
  createdAt: Generated<Date>;
}

export interface LlmConfigSetsTable {
  id: string;
  name: string;
  provider: string;
  geminiApiKey: string | null;
  geminiTextModel: string | null;
  vertexProject: string | null;
  vertexLocation: string | null;
  vertexModel: string | null;
  zhipuApiKey: string | null;
  zhipuTextModel: string | null;
  zhipuUseCodingPlan: Generated<boolean>;
  openaiCompatBaseUrl: string | null;
  openaiCompatApiKey: string | null;
  openaiCompatModel: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SiteSettingsTable {
  key: string;
  value: string;
  updatedAt: Generated<Date>;
}

// ─── Marketing operations ────────────────────────────────────────

export interface MarketingAssetsTable {
  id: string;
  type: string;
  name: string;
  externalId: string | null;
  purpose: string | null;
  ownerEntity: string | null;
  billingEntity: string | null;
  primaryOwnerUserId: string | null;
  secondaryOwnerUserId: string | null;
  agencyName: string | null;
  agencyRelationship: string | null;
  relatedAssetIds: Generated<string[]>;
  measurementIds: Generated<string[]>;
  consoleUrl: string | null;
  publicUrl: string | null;
  secretReference: string | null;
  emergencyContact: string | null;
  wikiPageId: string | null;
  notes: string | null;
  status: Generated<string>;
  verificationIntervalDays: Generated<number>;
  lastVerifiedAt: Date | null;
  lastVerifiedByUserId: string | null;
  createdByUserId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MarketingAssetAccessTable {
  id: string;
  assetId: string;
  principal: string;
  principalType: string;
  role: string;
  scope: string | null;
  approvedByUserId: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Generated<Date>;
}

export interface MarketingConnectorsTable {
  id: string;
  name: string;
  type: string;
  assetId: string | null;
  config: Generated<Record<string, unknown>>;
  /** AES-256-GCM encrypted JSON object of secret fields. */
  secretsEnc: string | null;
  enabled: Generated<boolean>;
  syncIntervalHours: Generated<number>;
  lookbackDays: Generated<number>;
  timezone: Generated<string>;
  currency: string | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  runLockUntil: Date | null;
  createdByUserId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MarketingQualityJson {
  rowCount: number;
  duplicateKeys: number;
  negativeValues: number;
  invalidRows: number;
  emptyDates: string[];
  warnings: string[];
}

export interface MarketingSyncRunsTable {
  id: string;
  connectorId: string;
  trigger: string;
  status: string;
  rangeFrom: string;
  rangeTo: string;
  rowsFetched: Generated<number>;
  rowsWritten: Generated<number>;
  quality: MarketingQualityJson | null;
  errorMessage: string | null;
  triggeredByUserId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface MarketingMetricsDailyTable {
  connectorId: string;
  /** YYYY-MM-DD in the connector's timezone */
  date: string;
  source: string;
  accountId: Generated<string>;
  campaignId: Generated<string>;
  campaignName: string | null;
  segment: Generated<string>;
  metric: string;
  value: number;
  currency: string | null;
  fetchedAt: Generated<Date>;
}

export interface MarketingMetricCoverageTable {
  connectorId: string;
  date: string;
  runId: string | null;
  fetchedAt: Generated<Date>;
}

export interface MarketingDashboardsTable {
  id: string;
  name: string;
  description: string | null;
  wikiPageId: string | null;
  defaultRange: Generated<string>;
  widgets: Generated<unknown[]>;
  version: Generated<number>;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MarketingDashboardRevisionsTable {
  id: string;
  dashboardId: string;
  version: number;
  definition: Record<string, unknown>;
  changeNote: string;
  authorUserId: string | null;
  createdAt: Generated<Date>;
}

export interface MarketingChangeRequestsTable {
  id: string;
  type: string;
  title: string;
  purpose: string | null;
  assetId: string | null;
  severity: string | null;
  beforeState: string | null;
  afterState: string | null;
  impact: string | null;
  rollbackPlan: string | null;
  scheduledAt: Date | null;
  status: Generated<string>;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  implementedByUserId: string | null;
  implementedAt: Date | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  verificationNote: string | null;
  evidenceUrls: Generated<string[]>;
  wikiPageId: string | null;
  postReviewDueAt: Date | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MarketingChangeEventsTable {
  id: string;
  changeId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  comment: string | null;
  createdAt: Generated<Date>;
}

export interface MarketingKnowledgePagesTable {
  id: string;
  pageId: string;
  layer: string;
  docType: Generated<string>;
  purpose: string | null;
  scope: string | null;
  ownerUserId: string | null;
  deputyUserId: string | null;
  status: Generated<string>;
  reviewIntervalDays: Generated<number>;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  replacedByPageId: string | null;
  relatedAssetIds: Generated<string[]>;
  notes: string | null;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface MarketingReconciliationsTable {
  id: string;
  connectorId: string;
  metric: string;
  periodFrom: string;
  periodTo: string;
  systemValue: number;
  sourceValue: number;
  tolerancePct: Generated<number>;
  explanation: string | null;
  status: Generated<string>;
  createdByUserId: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  createdAt: Generated<Date>;
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
  drive_files: DriveFilesTable;
  drive_embeddings: DriveEmbeddingsTable;
  drive_file_permissions: DriveFilePermissionsTable;
  github_repos: GithubReposTable;
  github_files: GithubFilesTable;
  github_embeddings: GithubEmbeddingsTable;
  github_repo_permissions: GithubRepoPermissionsTable;
  github_sync_logs: GithubSyncLogsTable;
  llm_config_sets: LlmConfigSetsTable;
  site_settings: SiteSettingsTable;
  marketing_assets: MarketingAssetsTable;
  marketing_asset_access: MarketingAssetAccessTable;
  marketing_connectors: MarketingConnectorsTable;
  marketing_sync_runs: MarketingSyncRunsTable;
  marketing_metrics_daily: MarketingMetricsDailyTable;
  marketing_metric_coverage: MarketingMetricCoverageTable;
  marketing_dashboards: MarketingDashboardsTable;
  marketing_dashboard_revisions: MarketingDashboardRevisionsTable;
  marketing_change_requests: MarketingChangeRequestsTable;
  marketing_change_events: MarketingChangeEventsTable;
  marketing_knowledge_pages: MarketingKnowledgePagesTable;
  marketing_reconciliations: MarketingReconciliationsTable;
}
