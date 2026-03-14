export const queryKeys = {
  authMe: ["auth", "me"] as const,
  users: ["users"] as const,
  meetings: ["meetings"] as const,
  meeting: (id: string) => ["meetings", id] as const,
  wikiSpaces: ["wiki", "spaces"] as const,
  wikiPages: ["wiki", "pages"] as const,
  wikiPage: (id: string) => ["wiki", "pages", id] as const,
  wikiChatConversations: ["wiki-chat", "conversations"] as const,
  wikiChatConversation: (id: string) => ["wiki-chat", "conversations", id] as const,
};
