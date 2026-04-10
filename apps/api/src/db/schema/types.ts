import type { Insertable, Selectable, Updateable } from "kysely";
import type { Database } from "./database.js";

// Re-export database and JSONB types
export type { BlockJson, CitationJson, Database, ToolStepJson } from "./database.js";

// ─── Users ───────────────────────────────────────────────────────
export type User = Selectable<Database["users"]>;
export type NewUser = Insertable<Database["users"]>;
export type UpdateUser = Updateable<Database["users"]>;

// ─── Auth Identities ─────────────────────────────────────────────
export type AuthIdentity = Selectable<Database["auth_identities"]>;
export type NewAuthIdentity = Insertable<Database["auth_identities"]>;

// ─── Auth Refresh Tokens ─────────────────────────────────────────
export type AuthRefreshToken = Selectable<Database["auth_refresh_tokens"]>;
export type NewAuthRefreshToken = Insertable<Database["auth_refresh_tokens"]>;

// ─── Email Verification Tokens ───────────────────────────────────
export type EmailVerificationToken = Selectable<Database["email_verification_tokens"]>;
export type NewEmailVerificationToken = Insertable<Database["email_verification_tokens"]>;

// ─── User Groups ─────────────────────────────────────────────────
export type UserGroup = Selectable<Database["user_groups"]>;
export type NewUserGroup = Insertable<Database["user_groups"]>;

// ─── User Group Memberships ──────────────────────────────────────
export type UserGroupMembership = Selectable<Database["user_group_memberships"]>;
export type NewUserGroupMembership = Insertable<Database["user_group_memberships"]>;

// ─── Spaces ──────────────────────────────────────────────────────
export type Space = Selectable<Database["spaces"]>;
export type NewSpace = Insertable<Database["spaces"]>;

// ─── Pages ───────────────────────────────────────────────────────
export type Page = Selectable<Database["pages"]>;
export type NewPage = Insertable<Database["pages"]>;

// ─── Blocks ──────────────────────────────────────────────────────
export type Block = Selectable<Database["blocks"]>;
export type NewBlock = Insertable<Database["blocks"]>;

// ─── Page Revisions ──────────────────────────────────────────────
export type PageRevision = Selectable<Database["page_revisions"]>;
export type NewPageRevision = Insertable<Database["page_revisions"]>;

// ─── Page Permissions ────────────────────────────────────────────
export type PagePermission = Selectable<Database["page_permissions"]>;
export type NewPagePermission = Insertable<Database["page_permissions"]>;

// ─── Page Inheritance ────────────────────────────────────────────
export type PageInheritance = Selectable<Database["page_inheritance"]>;
export type NewPageInheritance = Insertable<Database["page_inheritance"]>;

// ─── Space Permissions ───────────────────────────────────────────
export type SpacePermission = Selectable<Database["space_permissions"]>;
export type NewSpacePermission = Insertable<Database["space_permissions"]>;

// ─── Meetings ────────────────────────────────────────────────────
export type Meeting = Selectable<Database["meetings"]>;
export type NewMeeting = Insertable<Database["meetings"]>;

// ─── Transcripts ─────────────────────────────────────────────────
export type Transcript = Selectable<Database["transcripts"]>;
export type NewTranscript = Insertable<Database["transcripts"]>;

// ─── Summaries ───────────────────────────────────────────────────
export type Summary = Selectable<Database["summaries"]>;
export type NewSummary = Insertable<Database["summaries"]>;

// ─── Meeting Transcript Segments ─────────────────────────────────
export type MeetingTranscriptSegment = Selectable<Database["meeting_transcript_segments"]>;
export type NewMeetingTranscriptSegment = Insertable<Database["meeting_transcript_segments"]>;

// ─── Agents ──────────────────────────────────────────────────────
export type Agent = Selectable<Database["agents"]>;
export type NewAgent = Insertable<Database["agents"]>;

// ─── Meeting Agent Sessions ──────────────────────────────────────
export type MeetingAgentSession = Selectable<Database["meeting_agent_sessions"]>;
export type NewMeetingAgentSession = Insertable<Database["meeting_agent_sessions"]>;

// ─── Meeting Agent Events ────────────────────────────────────────
export type MeetingAgentEvent = Selectable<Database["meeting_agent_events"]>;
export type NewMeetingAgentEvent = Insertable<Database["meeting_agent_events"]>;

// ─── Files ───────────────────────────────────────────────────────
export type File = Selectable<Database["files"]>;
export type NewFile = Insertable<Database["files"]>;

// ─── Audit Logs ──────────────────────────────────────────────────
export type AuditLog = Selectable<Database["audit_logs"]>;
export type NewAuditLog = Insertable<Database["audit_logs"]>;

// ─── LLM Config Sets ────────────────────────────────────────────
export type LlmConfigSet = Selectable<Database["llm_config_sets"]>;
export type NewLlmConfigSet = Insertable<Database["llm_config_sets"]>;

// ─── Site Settings ───────────────────────────────────────────────
export type SiteSetting = Selectable<Database["site_settings"]>;
export type NewSiteSetting = Insertable<Database["site_settings"]>;

// ─── Meeting Recordings ──────────────────────────────────────────
export type MeetingRecording = Selectable<Database["meeting_recordings"]>;
export type NewMeetingRecording = Insertable<Database["meeting_recordings"]>;

// ─── AI Chat ─────────────────────────────────────────────────────
export type AiChatConversation = Selectable<Database["ai_chat_conversations"]>;
export type NewAiChatConversation = Insertable<Database["ai_chat_conversations"]>;
export type AiChatMessage = Selectable<Database["ai_chat_messages"]>;
export type NewAiChatMessage = Insertable<Database["ai_chat_messages"]>;

// ─── Google Calendar Tokens ──────────────────────────────────────
export type GoogleCalendarToken = Selectable<Database["google_calendar_tokens"]>;
export type NewGoogleCalendarToken = Insertable<Database["google_calendar_tokens"]>;

// ─── Yjs Documents ───────────────────────────────────────────────
export type YjsDocument = Selectable<Database["yjs_documents"]>;
export type NewYjsDocument = Insertable<Database["yjs_documents"]>;

// ─── Page Embeddings ─────────────────────────────────────────────
export type PageEmbedding = Selectable<Database["page_embeddings"]>;
export type NewPageEmbedding = Insertable<Database["page_embeddings"]>;

// ─── Meeting Participants ────────────────────────────────────────
export type MeetingParticipant = Selectable<Database["meeting_participants"]>;
export type NewMeetingParticipant = Insertable<Database["meeting_participants"]>;

// ─── Meeting Invites ─────────────────────────────────────────────
export type MeetingInvite = Selectable<Database["meeting_invites"]>;
export type NewMeetingInvite = Insertable<Database["meeting_invites"]>;

// ─── Meeting Guest Requests ──────────────────────────────────────
export type MeetingGuestRequest = Selectable<Database["meeting_guest_requests"]>;
export type NewMeetingGuestRequest = Insertable<Database["meeting_guest_requests"]>;

// ─── AITuber ─────────────────────────────────────────────────────
export type AituberCharacter = Selectable<Database["aituber_characters"]>;
export type NewAituberCharacter = Insertable<Database["aituber_characters"]>;
export type AituberSession = Selectable<Database["aituber_sessions"]>;
export type NewAituberSession = Insertable<Database["aituber_sessions"]>;
export type AituberMessage = Selectable<Database["aituber_messages"]>;
export type NewAituberMessage = Insertable<Database["aituber_messages"]>;

// ─── Knowledge Suggestions ───────────────────────────────────────
export type KnowledgeSuggestion = Selectable<Database["knowledge_suggestions"]>;
export type NewKnowledgeSuggestion = Insertable<Database["knowledge_suggestions"]>;

// ─── Drive ──────────────────────────────────────────────────────
export type DriveFile = Selectable<Database["drive_files"]>;
export type NewDriveFile = Insertable<Database["drive_files"]>;
export type DriveEmbedding = Selectable<Database["drive_embeddings"]>;
export type NewDriveEmbedding = Insertable<Database["drive_embeddings"]>;
export type DriveFilePermission = Selectable<Database["drive_file_permissions"]>;
export type NewDriveFilePermission = Insertable<Database["drive_file_permissions"]>;

// ─── GitHub ─────────────────────────────────────────────────────
export type GithubRepo = Selectable<Database["github_repos"]>;
export type NewGithubRepo = Insertable<Database["github_repos"]>;
export type GithubFile = Selectable<Database["github_files"]>;
export type NewGithubFile = Insertable<Database["github_files"]>;
export type GithubEmbedding = Selectable<Database["github_embeddings"]>;
export type NewGithubEmbedding = Insertable<Database["github_embeddings"]>;
export type GithubRepoPermission = Selectable<Database["github_repo_permissions"]>;
export type NewGithubRepoPermission = Insertable<Database["github_repo_permissions"]>;
export type GithubSyncLog = Selectable<Database["github_sync_logs"]>;
export type NewGithubSyncLog = Insertable<Database["github_sync_logs"]>;
