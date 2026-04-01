-- Remove visibility column from ai_chat_conversations
-- All conversations are now private to the creator (no public/team sharing)
ALTER TABLE "ai_chat_conversations" DROP COLUMN "visibility";
