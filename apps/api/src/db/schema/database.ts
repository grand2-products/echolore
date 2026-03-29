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
  avatar_url: string | null;
  email_verified_at: Date | null;
  token_version: Generated<number>;
  role: Generated<string>;
  suspended_at: Date | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuthIdentitiesTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string | null;
  password_hash: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EmailVerificationTokensTable {
  id: string;
  user_id: string | null;
  email: string;
  token_hash: string;
  purpose: string;
  pending_name: string | null;
  pending_password_hash: string | null;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface AuthRefreshTokensTable {
  id: string;
  user_id: string;
  client_type: string;
  auth_mode: string;
  device_name: string | null;
  token_hash: string;
  expires_at: Date;
  rotated_from_id: string | null;
  revoked_at: Date | null;
  last_seen_at: Date | null;
  created_at: Generated<Date>;
}

export interface UserInvitationsTable {
  id: string;
  email: string;
  token_hash: string;
  role: Generated<string>;
  group_ids: string[];
  invited_by_user_id: string | null;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface UserGroupsTable {
  id: string;
  name: string;
  description: string | null;
  is_system: Generated<boolean>;
  permissions: string[];
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserGroupMembershipsTable {
  id: string;
  user_id: string;
  group_id: string;
  added_by: string | null;
  created_at: Generated<Date>;
}

export interface SpacesTable {
  id: string;
  name: string;
  type: string;
  owner_user_id: string | null;
  group_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PagesTable {
  id: string;
  title: string;
  space_id: string;
  parent_id: string | null;
  author_id: string;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BlocksTable {
  id: string;
  page_id: string;
  type: string;
  content: string | null;
  properties: Record<string, unknown> | null;
  sort_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PageRevisionsTable {
  id: string;
  page_id: string;
  revision_number: number;
  title: string;
  blocks: BlockJson[];
  author_id: string;
  created_at: Generated<Date>;
}

export interface PagePermissionsTable {
  id: string;
  page_id: string;
  group_id: string | null;
  can_read: Generated<boolean>;
  can_write: Generated<boolean>;
  can_delete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SpacePermissionsTable {
  id: string;
  space_id: string;
  group_id: string;
  can_read: Generated<boolean>;
  can_write: Generated<boolean>;
  can_delete: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PageInheritanceTable {
  id: string;
  page_id: string;
  inherit_from_parent: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface MeetingsTable {
  id: string;
  title: string;
  creator_id: string;
  room_name: string;
  status: Generated<string>;
  started_at: Date | null;
  ended_at: Date | null;
  scheduled_at: Date | null;
  google_calendar_event_id: string | null;
  created_at: Generated<Date>;
}

export interface MeetingParticipantsTable {
  id: string;
  meeting_id: string;
  user_id: string | null;
  guest_identity: string | null;
  display_name: string;
  role: Generated<string>;
  joined_at: Date;
  left_at: Date | null;
  created_at: Generated<Date>;
}

export interface MeetingInvitesTable {
  id: string;
  meeting_id: string;
  token: string;
  created_by_user_id: string;
  label: string | null;
  max_uses: number | null;
  use_count: Generated<number>;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface MeetingGuestRequestsTable {
  id: string;
  invite_id: string;
  meeting_id: string;
  guest_name: string;
  guest_identity: string;
  status: Generated<string>;
  approved_by_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
  resolved_at: Date | null;
}

export interface MeetingRecordingsTable {
  id: string;
  meeting_id: string;
  egress_id: string;
  status: string;
  initiated_by: string | null;
  storage_path: string | null;
  file_size: number | null;
  duration_ms: number | null;
  content_type: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  error_message: string | null;
  created_at: Generated<Date>;
}

export interface GoogleCalendarTokensTable {
  id: string;
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: Date;
  scope: string;
  calendar_id: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TranscriptsTable {
  id: string;
  meeting_id: string;
  speaker_id: string | null;
  content: string;
  timestamp: Date;
  created_at: Generated<Date>;
}

export interface SummariesTable {
  id: string;
  meeting_id: string;
  content: string;
  created_at: Generated<Date>;
}

export interface MeetingTranscriptSegmentsTable {
  id: string;
  meeting_id: string;
  participant_identity: string;
  speaker_user_id: string | null;
  speaker_label: string;
  content: string;
  is_partial: Generated<boolean>;
  segment_key: string;
  provider: string;
  confidence: number | null;
  started_at: Date;
  finalized_at: Date | null;
  created_at: Generated<Date>;
}

export interface AgentsTable {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  voice_profile: string | null;
  intervention_style: string;
  default_provider: string;
  is_active: Generated<boolean>;
  autonomous_enabled: Generated<boolean>;
  autonomous_cooldown_sec: Generated<number>;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MeetingAgentSessionsTable {
  id: string;
  meeting_id: string;
  agent_id: string;
  state: string;
  invoked_by_user_id: string;
  last_auto_eval_segment_id: string | null;
  joined_at: Date | null;
  left_at: Date | null;
  created_at: Generated<Date>;
}

export interface MeetingAgentEventsTable {
  id: string;
  meeting_id: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  triggered_by_user_id: string | null;
  created_at: Generated<Date>;
}

export interface FilesTable {
  id: string;
  filename: string;
  content_type: string | null;
  size: number | null;
  storage_path: string;
  uploader_id: string;
  created_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

export interface AiChatConversationsTable {
  id: string;
  title: string;
  creator_id: string;
  visibility: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AiChatMessagesTable {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations: CitationJson[] | null;
  created_at: Generated<Date>;
}

export interface YjsDocumentsTable {
  page_id: string;
  state: string;
  updated_at: Generated<Date>;
}

export interface PageEmbeddingsTable {
  id: string;
  page_id: string;
  chunk_index: Generated<number>;
  plain_text: string;
  embedding: string; // pgvector — serialized as '[0.1,0.2,...]'
  model_id: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AituberCharactersTable {
  id: string;
  name: string;
  personality: string;
  system_prompt: string;
  speaking_style: string | null;
  language_code: Generated<string>;
  voice_name: string | null;
  avatar_url: string | null;
  avatar_file_id: string | null;
  created_by: string;
  is_public: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AituberSessionsTable {
  id: string;
  character_id: string;
  creator_id: string;
  title: string;
  status: Generated<string>;
  room_name: string;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Generated<Date>;
}

export interface AituberMessagesTable {
  id: string;
  session_id: string;
  role: string;
  sender_user_id: string | null;
  sender_name: string;
  content: string;
  processed_at: Date | null;
  created_at: Generated<Date>;
}

export interface KnowledgeSuggestionsTable {
  id: string;
  source_type: string;
  source_id: string | null;
  source_summary: string | null;
  target_type: string;
  target_page_id: string | null;
  target_space_id: string;
  proposed_title: string;
  proposed_blocks: BlockJson[];
  ai_reasoning: string;
  status: Generated<string>;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  result_page_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SiteSettingsTable {
  key: string;
  value: string;
  updated_at: Generated<Date>;
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
