import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationByIdMock } = vi.hoisted(() => {
  return {
    getConversationByIdMock: vi.fn(),
  };
});

vi.mock("../../repositories/ai-chat/ai-chat-repository.js", () => ({
  getConversationById: getConversationByIdMock,
}));

vi.mock("./ai-chat-ai-service.js", () => ({
  sendMessageAndGetResponse: vi.fn(),
}));

describe("ai-chat-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getConversationByIdMock.mockReset();
  });

  describe("canAccessConversation", () => {
    const adminUser = {
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin" as const,
    };
    const memberUser = {
      id: "member-1",
      email: "member@test.com",
      name: "Member",
      role: "member" as const,
    };
    const otherUser = {
      id: "other-1",
      email: "other@test.com",
      name: "Other",
      role: "member" as const,
    };

    it("returns not allowed when conversation does not exist", async () => {
      getConversationByIdMock.mockResolvedValue(null);

      const { canAccessConversation } = await import("./ai-chat-service.js");
      const result = await canAccessConversation(adminUser, "nonexistent", "read");

      expect(result.allowed).toBe(false);
      expect(result.conversation).toBeNull();
    });

    it("allows the creator to read their own conversation", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");
      const result = await canAccessConversation(memberUser, "conv-1", "read");

      expect(result.allowed).toBe(true);
      expect(result.conversation).toEqual(conversation);
    });

    it("allows the creator to write to their own conversation", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");
      const result = await canAccessConversation(memberUser, "conv-1", "write");

      expect(result.allowed).toBe(true);
    });

    it("allows the creator to delete their own conversation", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");
      const result = await canAccessConversation(memberUser, "conv-1", "delete");

      expect(result.allowed).toBe(true);
    });

    it("allows admin to read and delete any conversation", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");

      const readResult = await canAccessConversation(adminUser, "conv-1", "read");
      expect(readResult.allowed).toBe(true);

      getConversationByIdMock.mockResolvedValue(conversation);
      const deleteResult = await canAccessConversation(adminUser, "conv-1", "delete");
      expect(deleteResult.allowed).toBe(true);
    });

    it("denies admin write access to other users' conversations", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");
      const result = await canAccessConversation(adminUser, "conv-1", "write");

      expect(result.allowed).toBe(false);
    });

    it("denies any access to other users' conversations for non-creator members", async () => {
      const conversation = { id: "conv-1", creatorId: "member-1" };
      getConversationByIdMock.mockResolvedValue(conversation);

      const { canAccessConversation } = await import("./ai-chat-service.js");

      const readResult = await canAccessConversation(otherUser, "conv-1", "read");
      expect(readResult.allowed).toBe(false);

      getConversationByIdMock.mockResolvedValue(conversation);
      const writeResult = await canAccessConversation(otherUser, "conv-1", "write");
      expect(writeResult.allowed).toBe(false);

      getConversationByIdMock.mockResolvedValue(conversation);
      const deleteResult = await canAccessConversation(otherUser, "conv-1", "delete");
      expect(deleteResult.allowed).toBe(false);
    });
  });
});
