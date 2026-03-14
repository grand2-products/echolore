import { UserRole } from "@corp-internal/shared/contracts";
import type { SessionUser } from "../../lib/auth.js";
import { getConversationById } from "../../repositories/wiki-chat/wiki-chat-repository.js";
import { sendMessageAndGetResponse } from "./wiki-chat-ai-service.js";

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
  if (conversation.creatorId === user.id) {
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
