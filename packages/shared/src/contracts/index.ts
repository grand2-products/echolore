export type ISODateString = string;
export type AuthMode = "password" | "sso";

export const UserRole = {
  Admin: "admin",
  Member: "member",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const GroupPermission = {
  WikiRead: "wiki.read",
  WikiWrite: "wiki.write",
  WikiDelete: "wiki.delete",
  MeetingCreate: "meeting.create",
  MeetingJoin: "meeting.join",
  FileUpload: "file.upload",
  FileDownload: "file.download",
  KnowledgeApprove: "knowledge.approve",
} as const;
export type GroupPermission = (typeof GroupPermission)[keyof typeof GroupPermission];
export const ALL_GROUP_PERMISSIONS = Object.values(GroupPermission);

export type SpaceType = "general" | "team" | "personal";

export type MeetingStatus = "scheduled" | "active" | "ended";

export type BlockType =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "numberedList"
  | "image"
  | "file"
  | "code"
  | "codeBlock"
  | "quote"
  | "divider";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SpaceDto {
  id: string;
  name: string;
  type: SpaceType;
  ownerUserId: string | null;
  groupId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PageDto {
  id: string;
  title: string;
  spaceId: string;
  parentId: string | null;
  authorId: string;
  deletedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  authorName?: string;
  spaceName?: string;
}

export interface PageRevisionDto {
  id: string;
  pageId: string;
  revisionNumber: number;
  title: string;
  blocks: Array<{
    type: BlockType;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
  }>;
  authorId: string;
  createdAt: ISODateString;
}

export interface BlockDto {
  id: string;
  pageId: string;
  type: BlockType;
  content: string | null;
  properties: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface MeetingDto {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: MeetingStatus;
  startedAt: ISODateString | null;
  endedAt: ISODateString | null;
  scheduledAt: ISODateString | null;
  googleCalendarEventId: string | null;
  createdAt: ISODateString;
}

export interface TranscriptDto {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: ISODateString;
  createdAt: ISODateString;
}

export interface SummaryDto {
  id: string;
  meetingId: string;
  content: string;
  createdAt: ISODateString;
}

export type RecordingStatus = "starting" | "recording" | "stopping" | "completed" | "failed";

export interface RecordingDto {
  id: string;
  meetingId: string;
  egressId: string;
  status: RecordingStatus;
  storagePath: string | null;
  durationMs: number | null;
  startedAt: ISODateString | null;
  endedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface FileMetadataDto {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  gcsPath: string;
  uploaderId: string;
  createdAt: ISODateString;
}

export interface ErrorResponse {
  error: string;
  code?: string;
  message?: string;
}

export interface SuccessResponse {
  success: true;
}

export interface ListUsersResponse {
  users: UserDto[];
  total?: number;
}

export interface GetUserResponse {
  user: UserDto;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface UpdateUserRequest {
  name?: string;
  avatarUrl?: string;
}

export interface ListSpacesResponse {
  spaces: SpaceDto[];
}

export interface ListPagesResponse {
  pages: PageDto[];
}

export interface GetPageResponse {
  page: PageDto;
  blocks: BlockDto[];
}

export interface CreatePageRequest {
  title: string;
  parentId?: string;
  spaceId?: string;
}

export interface SessionUserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
}

export interface AuthMeResponseDto {
  user: SessionUserDto | null;
  authMode: AuthMode | null;
}

export interface PasswordLoginRequest {
  email: string;
  password: string;
}

export interface PasswordAuthResponse {
  user: SessionUserDto;
  authMode: "password";
}

export interface BrowserGoogleAuthResponse {
  user: SessionUserDto;
  authMode: "sso";
}

export interface AuthSessionDto {
  id: string;
  clientType: "web" | "mobile";
  authMode: "password" | "sso";
  deviceName: string | null;
  createdAt: ISODateString;
  lastSeenAt: ISODateString | null;
  expiresAt: ISODateString;
  current: boolean;
}

export interface TokenAuthRequest {
  email: string;
  password: string;
  deviceName?: string;
}

export interface GoogleTokenExchangeRequest {
  idToken: string;
  deviceName?: string;
}

export interface TokenRefreshRequest {
  refreshToken?: string;
  deviceName?: string;
}

export interface TokenAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: ISODateString;
  user: SessionUserDto;
  authMode: "password" | "sso";
}

export interface TokenRefreshResponse {
  accessToken: string;
  /** Omitted during grace period — client should keep its existing refresh token. */
  refreshToken?: string;
  expiresAt: ISODateString;
  user: SessionUserDto;
  authMode: "password" | "sso";
}

export interface ListAuthSessionsResponse {
  sessions: AuthSessionDto[];
}

export interface PasswordRegistrationRequest {
  email: string;
  name: string;
  password: string;
}

export interface PasswordRegistrationResponse {
  success: true;
  immediate: boolean;
  user?: SessionUserDto;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  user: SessionUserDto;
  authMode: "password";
}

export interface UpdatePageRequest {
  title?: string;
  parentId?: string | null;
}

export interface CreateBlockRequest {
  pageId: string;
  type: string;
  content?: string;
  properties?: Record<string, unknown>;
  sortOrder: number;
}

export interface UpdateBlockRequest {
  type?: string;
  content?: string | null;
  properties?: Record<string, unknown> | null;
  sortOrder?: number;
}

export interface CreateBlockResponse {
  block: BlockDto;
}

export interface ListMeetingsResponse {
  meetings: MeetingDto[];
  total?: number;
}

export interface GetMeetingResponse {
  meeting: MeetingDto;
  transcripts: TranscriptDto[];
  summaries: SummaryDto[];
}

export interface CreateMeetingRequest {
  title: string;
  scheduledAt?: string;
  attendeeEmails?: string[];
}

export interface UpdateMeetingRequest {
  title?: string;
  status?: MeetingStatus;
}

export interface CreateMeetingResponse {
  meeting: MeetingDto;
}

export interface CreateTranscriptRequest {
  speakerId?: string;
  content: string;
  timestamp: ISODateString;
}

export interface CreateTranscriptResponse {
  transcript: TranscriptDto;
}

export interface CreateSummaryRequest {
  content: string;
}

export interface CreateSummaryResponse {
  summary: SummaryDto;
}

export interface ListFilesResponse {
  files: FileMetadataDto[];
  total?: number;
}

export interface GetFileResponse {
  file: FileMetadataDto;
}

export interface UploadFileResponse {
  file: FileMetadataDto;
}

export interface GetFileDownloadUrlResponse {
  url: string;
}

// AI Chat
export type AiChatVisibility = "team" | "private";
export type AiChatMessageRole = "user" | "assistant";

export interface AiChatCitationDto {
  pageId: string;
  pageTitle: string;
  snippet?: string;
}

export interface AiChatConversationDto {
  id: string;
  title: string;
  creatorId: string;
  creatorName?: string | null;
  visibility: AiChatVisibility;
  messageCount?: number;
  lastMessagePreview?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AiChatMessageDto {
  id: string;
  conversationId: string;
  role: AiChatMessageRole;
  content: string;
  citations: AiChatCitationDto[] | null;
  createdAt: ISODateString;
}

export interface CreateAiChatConversationRequest {
  title?: string;
  visibility?: AiChatVisibility;
}

export interface UpdateAiChatConversationRequest {
  title?: string;
  visibility?: AiChatVisibility;
}

export interface SendAiChatMessageRequest {
  content: string;
}

export interface SpacePermissionDto {
  id: string;
  spaceId: string;
  groupId: string;
  groupName?: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export interface LivekitTokenRequest {
  roomName: string;
  participantName: string;
  participantIdentity: string;
}

export interface LivekitTokenResponse {
  token: string;
}

export interface LivekitCreateRoomRequest {
  name: string;
  emptyTimeout?: number;
  maxParticipants?: number;
}

// Meeting Guest Access
export type GuestRequestStatus = "pending" | "approved" | "rejected";

export interface MeetingInviteDto {
  id: string;
  meetingId: string;
  token: string;
  createdByUserId: string;
  label: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: ISODateString;
  revokedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface MeetingGuestRequestDto {
  id: string;
  inviteId: string;
  meetingId: string;
  guestName: string;
  guestIdentity: string;
  status: GuestRequestStatus;
  approvedByUserId: string | null;
  createdAt: ISODateString;
  resolvedAt: ISODateString | null;
}

export interface CreateMeetingInviteRequest {
  label?: string;
  maxUses?: number;
  expiresInSeconds: number;
}

export interface JoinMeetingGuestRequest {
  guestName: string;
}

export interface ValidateInviteResponse {
  meeting: { id: string; title: string; status: MeetingStatus };
  invite: { id: string; label: string | null; expiresAt: ISODateString };
}

export interface GuestJoinRequestResponse {
  requestId: string;
  guestIdentity: string;
}

export interface GuestRequestStatusResponse {
  status: GuestRequestStatus;
  token?: string;
  roomName?: string;
}

export interface GuestRequestDataChannelMessage {
  type: "guest-request-new" | "guest-request-resolved";
  requestId: string;
  guestName?: string;
  status?: "approved" | "rejected";
  resolvedBy?: string;
}

export interface RealtimeTranscriptSegmentDto {
  id: string;
  meetingId: string;
  participantIdentity: string;
  speakerUserId: string | null;
  speakerLabel: string;
  content: string;
  isPartial: boolean;
  segmentKey: string;
  provider: string;
  confidence: number | null;
  startedAt: ISODateString;
  finalizedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface AdminUserGroupRefDto {
  id: string;
  name: string;
}

export interface AdminGroupDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  memberCount: number;
}

export interface AdminGroupDetailDto extends Omit<AdminGroupDto, "memberCount"> {
  members: string[];
}

export interface AdminUserRecordDto {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: UserRole;
  suspendedAt: ISODateString | null;
  deletedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  groups: AdminUserGroupRefDto[];
}

// --- User Invitations ---

export interface UserInvitationDto {
  id: string;
  email: string;
  role: UserRole;
  groupIds: string[];
  invitedByUserId: string | null;
  invitedByEmail?: string | null;
  expiresAt: ISODateString;
  usedAt: ISODateString | null;
  revokedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface CreateUserInvitationRequest {
  email: string;
  role?: UserRole;
  groupIds?: string[];
  expiresInDays?: number;
}

export interface CreateUserInvitationResponse {
  invitation: UserInvitationDto;
  inviteUrl: string;
  emailSent: boolean;
}

export interface ListUserInvitationsResponse {
  invitations: UserInvitationDto[];
}

export interface ValidateUserInviteResponse {
  valid: boolean;
  email?: string;
  expiresAt?: ISODateString;
}

export interface AcceptUserInviteRequest {
  name: string;
  password: string;
}

export interface AcceptUserInviteResponse {
  success: true;
  user: SessionUserDto;
}

export interface AdminSpacePermissionRecordDto {
  id: string;
  spaceId: string;
  groupId: string;
  groupName?: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AdminSpacePermissionsResponseDto {
  spaceId: string;
  permissions: AdminSpacePermissionRecordDto[];
}

export interface CreateAdminGroupRequest {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateAdminGroupRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

// --- AITuber ---

export type AituberSessionStatus = "created" | "live" | "ended";
export type AituberMessageRole = "viewer" | "assistant";
export type AituberAvatarState = "idle" | "thinking" | "talking";

export interface VisemeEntry {
  time: number;
  viseme: string;
}

export const MAX_VRM_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface AituberCharacterDto {
  id: string;
  name: string;
  personality: string;
  systemPrompt: string;
  speakingStyle: string | null;
  languageCode: string;
  voiceName: string | null;
  avatarUrl: string | null;
  createdBy: string;
  isPublic: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface AituberSessionDto {
  id: string;
  characterId: string;
  creatorId: string;
  title: string;
  status: AituberSessionStatus;
  roomName: string;
  startedAt: ISODateString | null;
  endedAt: ISODateString | null;
  createdAt: ISODateString;
  characterName?: string;
  characterAvatarUrl?: string | null;
}

export interface AituberMessageDto {
  id: string;
  sessionId: string;
  role: AituberMessageRole;
  senderUserId: string | null;
  senderName: string;
  content: string;
  processedAt: ISODateString | null;
  createdAt: ISODateString;
}

// AITuber Requests
export interface CreateAituberCharacterRequest {
  name: string;
  personality: string;
  systemPrompt: string;
  speakingStyle?: string;
  languageCode?: string;
  voiceName?: string;
  avatarUrl?: string;
  avatarFileId?: string;
  isPublic?: boolean;
}

export interface UpdateAituberCharacterRequest {
  name?: string;
  personality?: string;
  systemPrompt?: string;
  speakingStyle?: string | null;
  languageCode?: string;
  voiceName?: string | null;
  avatarUrl?: string | null;
  avatarFileId?: string | null;
  isPublic?: boolean;
}

export interface UploadAituberAvatarResponse {
  character: AituberCharacterDto;
}

export interface CreateAituberSessionRequest {
  characterId: string;
  title: string;
}

export interface SendAituberMessageRequest {
  content: string;
}

// AITuber Responses
export interface ListAituberCharactersResponse {
  characters: AituberCharacterDto[];
}

export interface GetAituberCharacterResponse {
  character: AituberCharacterDto;
}

export interface CreateAituberCharacterResponse {
  character: AituberCharacterDto;
}

export interface ListAituberSessionsResponse {
  sessions: AituberSessionDto[];
}

export interface GetAituberSessionResponse {
  session: AituberSessionDto;
}

export interface CreateAituberSessionResponse {
  session: AituberSessionDto;
}

export interface ListAituberMessagesResponse {
  messages: AituberMessageDto[];
}

export interface SendAituberMessageResponse {
  message: AituberMessageDto;
}

export interface AituberTokenResponse {
  token: string;
}

// AITuber Data Channel Events
export type AituberDataEvent =
  | { type: "viewer-message"; messageId: string; senderName: string; content: string }
  | { type: "ai-token"; token: string }
  | { type: "ai-complete"; messageId: string; fullContent: string }
  | { type: "avatar-state"; state: AituberAvatarState }
  | { type: "image-share"; url: string; caption?: string }
  | { type: "viewer-count"; count: number }
  | {
      type: "tts-audio";
      audio: string;
      mimeType: string;
      visemes?: VisemeEntry[];
    }
  | { type: "emotion"; emotion: string; intensity: number }
  | { type: "action"; action: string };

// --- Knowledge Suggestions ---

export type KnowledgeSuggestionSourceType = "file_upload" | "transcription" | "periodic_scan";
export type KnowledgeSuggestionTargetType = "new_page" | "update_page";
export type KnowledgeSuggestionStatus = "pending" | "approved" | "rejected";

export interface KnowledgeSuggestionDto {
  id: string;
  sourceType: KnowledgeSuggestionSourceType;
  sourceId: string | null;
  sourceSummary: string | null;
  targetType: KnowledgeSuggestionTargetType;
  targetPageId: string | null;
  targetSpaceId: string;
  proposedTitle: string;
  proposedBlocks: Array<{
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
  }>;
  aiReasoning: string;
  status: KnowledgeSuggestionStatus;
  reviewedByUserId: string | null;
  reviewedAt: ISODateString | null;
  rejectionReason: string | null;
  resultPageId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ListKnowledgeSuggestionsResponse {
  suggestions: KnowledgeSuggestionDto[];
  total?: number;
}

export interface GetKnowledgeSuggestionResponse {
  suggestion: KnowledgeSuggestionDto;
}

// --- System Update ---

export type UpdatePhase = "idle" | "self-updating" | "updating-services" | "complete" | "failed";

export type UpdateStepStatus = "pending" | "running" | "done" | "failed";

export interface SystemStatusResponse {
  currentVersion: string;
  updaterAvailable: boolean;
  updateInProgress: boolean;
}

export interface CheckUpdateResponse {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
}

export interface StartUpdateRequest {
  targetVersion?: string;
}

export interface StartUpdateResponse {
  success: boolean;
  message: string;
  targetVersion: string;
}

export interface UpdateStepDto {
  name: string;
  status: UpdateStepStatus;
  message?: string;
}

export interface UpdateProgressResponse {
  phase: UpdatePhase;
  targetVersion: string;
  previousVersion: string;
  startedAt: string | null;
  steps: UpdateStepDto[];
  currentStep: number;
  error?: string;
}
