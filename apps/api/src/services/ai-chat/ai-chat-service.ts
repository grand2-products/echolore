import { UserRole } from "@echolore/shared/contracts";
import type { SessionUser } from "../../lib/auth.js";
import { getConversationById } from "../../repositories/ai-chat/ai-chat-repository.js";
import { sendMessageAndGetResponse } from "./ai-chat-ai-service.js";

// Re-export repository CRUD for route layer access
export {
  createConversation,
  deleteConversation,
  getConversationStats,
  listConversations,
  listMessagesByConversationId,
  updateConversation,
} from "../../repositories/ai-chat/ai-chat-repository.js";
export { sendMessageAndGetResponse };

export async function canAccessConversation(
  user: SessionUser,
  conversationId: string,
  action: "read" | "write" | "delete"
): Promise<{ allowed: boolean; conversation: Awaited<ReturnType<typeof getConversationById>> }> {
  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return { allowed: false, conversation: null };
  }

  // Creator can always do anything
  if (conversation.creator_id === user.id) {
    return { allowed: true, conversation };
  }

  // Admin access
  if (user.role === UserRole.Admin) {
    if (conversation.visibility === "team") {
      return { allowed: true, conversation };
    }
    // Admin can read/delete private conversations but not write
    if (action === "read" || action === "delete") {
      return { allowed: true, conversation };
    }
    return { allowed: false, conversation };
  }

  // Team visibility — any authenticated user can read and write (send messages)
  if (conversation.visibility === "team" && (action === "read" || action === "write")) {
    return { allowed: true, conversation };
  }

  return { allowed: false, conversation };
}
