ALTER TABLE "ai_chat_messages" DROP CONSTRAINT "ai_chat_msgs_conversation_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_conversation_id_ai_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_type_idx" ON "audit_logs" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meeting_transcript_segments_meeting_id_idx" ON "meeting_transcript_segments" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_creator_id_idx" ON "meetings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "pages_space_id_idx" ON "pages" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "pages_parent_id_idx" ON "pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "spaces_type_idx" ON "spaces" USING btree ("type");