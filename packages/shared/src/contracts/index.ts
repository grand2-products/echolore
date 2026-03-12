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
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface BlockDto {
  id: string;
  pageId: string;
  type: string;
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

export interface FileMetadataDto {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  gcsPath: string;
  uploaderId: string;
  createdAt: ISODateString;
}

export class ErrorResponse {
  constructor(
    public error: string,
    public code?: string,
    public message?: string,
  ) {}
}

export class SuccessResponse {
  public readonly success = true;
}

export class ListUsersResponse {
  constructor(public users: UserDto[]) {}
}

export class GetUserResponse {
  constructor(public user: UserDto) {}
}

export interface CreateUserRequest {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export interface UpdateUserRequest {
  name?: string;
  avatarUrl?: string;
}

export class ListSpacesResponse {
  constructor(public spaces: SpaceDto[]) {}
}

export class ListPagesResponse {
  constructor(public pages: PageDto[]) {}
}

export class GetPageResponse {
  constructor(
    public page: PageDto,
    public blocks: BlockDto[],
  ) {}
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

export class ListAuthSessionsResponse {
  constructor(public sessions: AuthSessionDto[]) {}
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

export class CreateBlockResponse {
  constructor(public block: BlockDto) {}
}

export class ListMeetingsResponse {
  constructor(public meetings: MeetingDto[]) {}
}

export class GetMeetingResponse {
  constructor(
    public meeting: MeetingDto,
    public transcripts: TranscriptDto[],
    public summaries: SummaryDto[],
  ) {}
}

export interface CreateMeetingRequest {
  title: string;
  scheduledAt?: string;
}

export interface UpdateMeetingRequest {
  title?: string;
  status?: MeetingStatus;
}

export class CreateMeetingResponse {
  constructor(public meeting: MeetingDto) {}
}

export interface CreateTranscriptRequest {
  speakerId?: string;
  content: string;
  timestamp: ISODateString;
}

export class CreateTranscriptResponse {
  constructor(public transcript: TranscriptDto) {}
}

export interface CreateSummaryRequest {
  content: string;
}

export class CreateSummaryResponse {
  constructor(public summary: SummaryDto) {}
}

export class ListFilesResponse {
  constructor(public files: FileMetadataDto[]) {}
}

export class GetFileResponse {
  constructor(public file: FileMetadataDto) {}
}

export class UploadFileResponse {
  constructor(public file: FileMetadataDto) {}
}

export class GetFileDownloadUrlResponse {
  constructor(public url: string) {}
}

export interface LivekitTokenRequest {
  roomName: string;
  participantName: string;
  participantIdentity: string;
}

export class LivekitTokenResponse {
  constructor(public token: string) {}
}

export interface LivekitCreateRoomRequest {
  name: string;
  emptyTimeout?: number;
  maxParticipants?: number;
}
