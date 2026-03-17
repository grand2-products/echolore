import { beforeEach, describe, expect, it, vi } from "vitest";

const { repoMock } = vi.hoisted(() => ({
  repoMock: {
    createCharacter: vi.fn(),
    getCharacterById: vi.fn(),
    listCharacters: vi.fn(),
    updateCharacter: vi.fn(),
    deleteCharacter: vi.fn(),
    createSession: vi.fn(),
    getSessionById: vi.fn(),
    listSessions: vi.fn(),
    updateSession: vi.fn(),
    updateSessionWithStatus: vi.fn(),
    createMessage: vi.fn(),
    listUnprocessedMessages: vi.fn(),
    markMessageProcessed: vi.fn(),
    listMessagesBySession: vi.fn(),
    listRecentMessages: vi.fn(),
  },
}));

vi.mock("../../repositories/aituber/aituber-repository.js", () => repoMock);

import {
  createCharacter,
  createSession,
  deleteCharacter,
  getCharacter,
  getSession,
  listCharacters,
  listMessageHistory,
  listMessages,
  listSessions,
  listUnprocessedMessages,
  markMessageProcessed,
  saveAssistantMessage,
  sendViewerMessage,
  startSession,
  stopSession,
  updateCharacter,
} from "./aituber-service.js";

const makeCharacter = (overrides = {}) => ({
  id: "char-1",
  name: "TestChar",
  personality: "Friendly",
  systemPrompt: "You are a test character.",
  speakingStyle: null,
  languageCode: "ja-JP",
  voiceName: null,
  avatarUrl: null,
  isPublic: false,
  createdBy: "user-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

const makeSession = (overrides = {}) => ({
  id: "session-1",
  characterId: "char-1",
  creatorId: "user-1",
  title: "Test Session",
  status: "created",
  roomName: "aituber-abc123",
  startedAt: null,
  endedAt: null,
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

const makeMessage = (overrides = {}) => ({
  id: "msg-1",
  sessionId: "session-1",
  role: "viewer",
  senderUserId: "user-1",
  senderName: "Taro",
  content: "Hello!",
  processedAt: null,
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

describe("aituber-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const fn of Object.values(repoMock)) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  });

  // --- Character CRUD ---

  describe("createCharacter", () => {
    it("creates a character with defaults and returns it", async () => {
      const character = makeCharacter();
      repoMock.createCharacter.mockResolvedValue(character);

      const result = await createCharacter({
        name: "TestChar",
        personality: "Friendly",
        systemPrompt: "You are a test character.",
        createdBy: "user-1",
      });

      expect(repoMock.createCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "TestChar",
          personality: "Friendly",
          systemPrompt: "You are a test character.",
          speakingStyle: null,
          languageCode: "ja-JP",
          voiceName: null,
          avatarUrl: null,
          isPublic: false,
          createdBy: "user-1",
        })
      );
      expect(result).toEqual(character);
    });

    it("passes optional fields when provided", async () => {
      const character = makeCharacter({
        speakingStyle: "polite",
        languageCode: "en-US",
        voiceName: "voice-1",
        avatarUrl: "https://example.com/avatar.png",
        isPublic: true,
      });
      repoMock.createCharacter.mockResolvedValue(character);

      await createCharacter({
        name: "TestChar",
        personality: "Friendly",
        systemPrompt: "You are a test character.",
        speakingStyle: "polite",
        languageCode: "en-US",
        voiceName: "voice-1",
        avatarUrl: "https://example.com/avatar.png",
        isPublic: true,
        createdBy: "user-1",
      });

      expect(repoMock.createCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          speakingStyle: "polite",
          languageCode: "en-US",
          voiceName: "voice-1",
          avatarUrl: "https://example.com/avatar.png",
          isPublic: true,
        })
      );
    });

    it("throws when repo returns null", async () => {
      repoMock.createCharacter.mockResolvedValue(null);

      await expect(
        createCharacter({
          name: "TestChar",
          personality: "Friendly",
          systemPrompt: "prompt",
          createdBy: "user-1",
        })
      ).rejects.toThrow("Failed to create character");
    });
  });

  describe("getCharacter", () => {
    it("returns the character from the repository", async () => {
      const character = makeCharacter();
      repoMock.getCharacterById.mockResolvedValue(character);

      const result = await getCharacter("char-1");

      expect(repoMock.getCharacterById).toHaveBeenCalledWith("char-1");
      expect(result).toEqual(character);
    });

    it("returns null when character does not exist", async () => {
      repoMock.getCharacterById.mockResolvedValue(null);

      const result = await getCharacter("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listCharacters", () => {
    it("lists characters without filter", async () => {
      const characters = [makeCharacter()];
      repoMock.listCharacters.mockResolvedValue(characters);

      const result = await listCharacters();

      expect(repoMock.listCharacters).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(characters);
    });

    it("lists characters filtered by createdBy", async () => {
      repoMock.listCharacters.mockResolvedValue([]);

      await listCharacters({ createdBy: "user-1" });

      expect(repoMock.listCharacters).toHaveBeenCalledWith({ createdBy: "user-1" });
    });
  });

  describe("updateCharacter", () => {
    it("updates the character and passes updatedAt", async () => {
      const updated = makeCharacter({ name: "NewName" });
      repoMock.updateCharacter.mockResolvedValue(updated);

      const result = await updateCharacter("char-1", { name: "NewName" });

      expect(repoMock.updateCharacter).toHaveBeenCalledWith(
        "char-1",
        expect.objectContaining({
          name: "NewName",
          updatedAt: expect.any(Date),
        })
      );
      expect(result).toEqual(updated);
    });
  });

  describe("deleteCharacter", () => {
    it("calls repo deleteCharacter", async () => {
      repoMock.deleteCharacter.mockResolvedValue(undefined);

      await deleteCharacter("char-1");

      expect(repoMock.deleteCharacter).toHaveBeenCalledWith("char-1");
    });
  });

  // --- Session CRUD ---

  describe("createSession", () => {
    it("creates a session with a generated room name", async () => {
      const session = makeSession();
      repoMock.createSession.mockResolvedValue(session);

      const result = await createSession({
        characterId: "char-1",
        creatorId: "user-1",
        title: "Test Session",
      });

      expect(repoMock.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          characterId: "char-1",
          creatorId: "user-1",
          title: "Test Session",
          status: "created",
          roomName: expect.stringMatching(/^aituber-/),
        })
      );
      expect(result).toEqual(session);
    });

    it("throws when repo returns null", async () => {
      repoMock.createSession.mockResolvedValue(null);

      await expect(
        createSession({
          characterId: "char-1",
          creatorId: "user-1",
          title: "Test Session",
        })
      ).rejects.toThrow("Failed to create session");
    });
  });

  describe("getSession", () => {
    it("returns the session from the repository", async () => {
      const session = makeSession();
      repoMock.getSessionById.mockResolvedValue(session);

      const result = await getSession("session-1");

      expect(repoMock.getSessionById).toHaveBeenCalledWith("session-1");
      expect(result).toEqual(session);
    });

    it("returns null when session does not exist", async () => {
      repoMock.getSessionById.mockResolvedValue(null);

      const result = await getSession("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listSessions", () => {
    it("lists sessions without filter", async () => {
      repoMock.listSessions.mockResolvedValue([]);

      await listSessions();

      expect(repoMock.listSessions).toHaveBeenCalledWith(undefined);
    });

    it("lists sessions filtered by status and creatorId", async () => {
      repoMock.listSessions.mockResolvedValue([]);

      await listSessions({ status: "live", creatorId: "user-1" });

      expect(repoMock.listSessions).toHaveBeenCalledWith({
        status: "live",
        creatorId: "user-1",
      });
    });
  });

  describe("startSession", () => {
    it("atomically transitions session from created to live", async () => {
      const updated = makeSession({ status: "live", startedAt: new Date() });
      repoMock.updateSessionWithStatus.mockResolvedValue(updated);

      const result = await startSession("session-1");

      expect(repoMock.updateSessionWithStatus).toHaveBeenCalledWith(
        "session-1",
        "created",
        expect.objectContaining({
          status: "live",
          startedAt: expect.any(Date),
        })
      );
      expect(result).toEqual(updated);
    });

    it("throws when session not found or not in created state", async () => {
      repoMock.updateSessionWithStatus.mockResolvedValue(null);

      await expect(startSession("nonexistent")).rejects.toThrow(
        "Session not found or not in created state"
      );
    });
  });

  describe("stopSession", () => {
    it("atomically transitions session from live to ended", async () => {
      const updated = makeSession({ status: "ended", endedAt: new Date() });
      repoMock.updateSessionWithStatus.mockResolvedValue(updated);

      const result = await stopSession("session-1");

      expect(repoMock.updateSessionWithStatus).toHaveBeenCalledWith(
        "session-1",
        "live",
        expect.objectContaining({
          status: "ended",
          endedAt: expect.any(Date),
        })
      );
      expect(result).toEqual(updated);
    });

    it("throws when session not found or not live", async () => {
      repoMock.updateSessionWithStatus.mockResolvedValue(null);

      await expect(stopSession("nonexistent")).rejects.toThrow("Session not found or not live");
    });
  });

  // --- Message Management ---

  describe("sendViewerMessage", () => {
    it("creates a viewer message", async () => {
      const message = makeMessage();
      repoMock.createMessage.mockResolvedValue(message);

      const result = await sendViewerMessage({
        sessionId: "session-1",
        senderUserId: "user-1",
        senderName: "Taro",
        content: "Hello!",
      });

      expect(repoMock.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          role: "viewer",
          senderUserId: "user-1",
          senderName: "Taro",
          content: "Hello!",
        })
      );
      expect(result).toEqual(message);
    });

    it("sets senderUserId to null when not provided", async () => {
      const message = makeMessage({ senderUserId: null });
      repoMock.createMessage.mockResolvedValue(message);

      await sendViewerMessage({
        sessionId: "session-1",
        senderName: "Guest",
        content: "Hi!",
      });

      expect(repoMock.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          senderUserId: null,
        })
      );
    });

    it("throws when repo returns null", async () => {
      repoMock.createMessage.mockResolvedValue(null);

      await expect(
        sendViewerMessage({
          sessionId: "session-1",
          senderName: "Taro",
          content: "Hello!",
        })
      ).rejects.toThrow("Failed to send message");
    });
  });

  describe("saveAssistantMessage", () => {
    it("creates an assistant message with processedAt set", async () => {
      const message = makeMessage({ role: "assistant", senderName: "AI" });
      repoMock.createMessage.mockResolvedValue(message);

      const result = await saveAssistantMessage({
        sessionId: "session-1",
        content: "Response text",
        characterName: "AI",
      });

      expect(repoMock.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          role: "assistant",
          senderUserId: null,
          senderName: "AI",
          content: "Response text",
          processedAt: expect.any(Date),
        })
      );
      expect(result).toEqual(message);
    });

    it("throws when repo returns null", async () => {
      repoMock.createMessage.mockResolvedValue(null);

      await expect(
        saveAssistantMessage({
          sessionId: "session-1",
          content: "Response",
          characterName: "AI",
        })
      ).rejects.toThrow("Failed to save assistant message");
    });
  });

  describe("listUnprocessedMessages", () => {
    it("delegates to repo", async () => {
      const messages = [makeMessage()];
      repoMock.listUnprocessedMessages.mockResolvedValue(messages);

      const result = await listUnprocessedMessages("session-1");

      expect(repoMock.listUnprocessedMessages).toHaveBeenCalledWith("session-1");
      expect(result).toEqual(messages);
    });
  });

  describe("markMessageProcessed", () => {
    it("delegates to repo", async () => {
      const updated = makeMessage({ processedAt: new Date() });
      repoMock.markMessageProcessed.mockResolvedValue(updated);

      const result = await markMessageProcessed("msg-1");

      expect(repoMock.markMessageProcessed).toHaveBeenCalledWith("msg-1");
      expect(result).toEqual(updated);
    });
  });

  describe("listMessageHistory", () => {
    it("delegates to repo with limit", async () => {
      repoMock.listRecentMessages.mockResolvedValue([]);

      await listMessageHistory("session-1", 10);

      expect(repoMock.listRecentMessages).toHaveBeenCalledWith("session-1", 10);
    });
  });

  describe("listMessages", () => {
    it("delegates to repo", async () => {
      repoMock.listMessagesBySession.mockResolvedValue([]);

      await listMessages("session-1", 25);

      expect(repoMock.listMessagesBySession).toHaveBeenCalledWith("session-1", 25);
    });
  });
});
