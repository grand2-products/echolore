-- Rename visibility value 'team' -> 'public' for ai_chat_conversations
UPDATE "ai_chat_conversations" SET "visibility" = 'public' WHERE "visibility" = 'team';
ALTER TABLE "ai_chat_conversations" ALTER COLUMN "visibility" SET DEFAULT 'public';
