ALTER TABLE "agents" DROP CONSTRAINT "agents_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_chat_conversations" DROP CONSTRAINT "ai_chat_conversations_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "aituber_characters" DROP CONSTRAINT "aituber_characters_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "aituber_messages" DROP CONSTRAINT "aituber_messages_sender_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "aituber_sessions" DROP CONSTRAINT "aituber_sessions_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_uploader_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" DROP CONSTRAINT "knowledge_suggestions_target_page_id_pages_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" DROP CONSTRAINT "knowledge_suggestions_target_space_id_spaces_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" DROP CONSTRAINT "knowledge_suggestions_reviewed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" DROP CONSTRAINT "knowledge_suggestions_result_page_id_pages_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_agent_events" DROP CONSTRAINT "meeting_agent_events_triggered_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_agent_sessions" DROP CONSTRAINT "meeting_agent_sessions_invoked_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_guest_requests" DROP CONSTRAINT "meeting_guest_requests_approved_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_invites" DROP CONSTRAINT "meeting_invites_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_recordings" DROP CONSTRAINT "meeting_recordings_initiated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_transcript_segments" DROP CONSTRAINT "meeting_transcript_segments_speaker_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "page_revisions" DROP CONSTRAINT "page_revisions_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_space_id_spaces_id_fk";
--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transcripts" DROP CONSTRAINT "transcripts_speaker_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_group_memberships" DROP CONSTRAINT "user_group_memberships_added_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_conversations" ADD CONSTRAINT "ai_chat_conversations_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aituber_characters" ADD CONSTRAINT "aituber_characters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aituber_messages" ADD CONSTRAINT "aituber_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aituber_sessions" ADD CONSTRAINT "aituber_sessions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_target_space_id_spaces_id_fk" FOREIGN KEY ("target_space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_result_page_id_pages_id_fk" FOREIGN KEY ("result_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_agent_events" ADD CONSTRAINT "meeting_agent_events_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_agent_sessions" ADD CONSTRAINT "meeting_agent_sessions_invoked_by_user_id_users_id_fk" FOREIGN KEY ("invoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_guest_requests" ADD CONSTRAINT "meeting_guest_requests_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_invites" ADD CONSTRAINT "meeting_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD CONSTRAINT "meeting_recordings_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_transcript_segments" ADD CONSTRAINT "meeting_transcript_segments_speaker_user_id_users_id_fk" FOREIGN KEY ("speaker_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_speaker_id_users_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;