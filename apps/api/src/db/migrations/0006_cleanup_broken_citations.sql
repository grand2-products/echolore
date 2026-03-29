-- Remove citations entries that have no pageId (broken data from Kysely migration period)
UPDATE ai_chat_messages
SET citations = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(citations) elem
  WHERE elem->>'pageId' IS NOT NULL AND elem->>'pageId' != ''
)
WHERE citations IS NOT NULL;

-- Null out empty arrays left after filtering
UPDATE ai_chat_messages
SET citations = NULL
WHERE citations IS NOT NULL AND jsonb_array_length(citations) = 0;
