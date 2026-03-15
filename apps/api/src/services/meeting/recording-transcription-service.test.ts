import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTranscriptMock,
  getLlmSettingsMock,
  createChatModelMock,
  isTextGenerationEnabledMock,
  resolveTextProviderMock,
  loadFileMock,
} = vi.hoisted(() => ({
  createTranscriptMock: vi.fn(),
  getLlmSettingsMock: vi.fn(),
  createChatModelMock: vi.fn(),
  isTextGenerationEnabledMock: vi.fn(),
  resolveTextProviderMock: vi.fn(),
  loadFileMock: vi.fn(),
}));

vi.mock("../../repositories/meeting/meeting-repository.js", () => ({
  createTranscript: createTranscriptMock,
}));

vi.mock("../admin/admin-service.js", () => ({
  getLlmSettings: getLlmSettingsMock,
}));

vi.mock("../../ai/llm/index.js", () => ({
  createChatModel: createChatModelMock,
  isTextGenerationEnabled: isTextGenerationEnabledMock,
  resolveTextProvider: resolveTextProviderMock,
}));

vi.mock("../../lib/file-storage.js", () => ({
  loadFile: loadFileMock,
}));

// Stub @langchain/core/messages so we can inspect HumanMessage calls
vi.mock("@langchain/core/messages", () => {
  class MockHumanMessage {
    content: unknown;
    constructor(args: unknown) {
      if (typeof args === "object" && args !== null && "content" in args) {
        Object.assign(this, args);
      } else {
        this.content = args;
      }
    }
  }
  return { HumanMessage: MockHumanMessage };
});

const defaultLlmSettings = {
  provider: "gemini",
  geminiApiKey: "test-key",
  geminiTextModel: "gemini-pro",
  vertexProject: null,
  vertexLocation: null,
  vertexModel: null,
  zhipuApiKey: null,
  zhipuTextModel: null,
};

describe("recording-transcription-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    createTranscriptMock.mockReset();
    getLlmSettingsMock.mockReset();
    createChatModelMock.mockReset();
    isTextGenerationEnabledMock.mockReset();
    resolveTextProviderMock.mockReset();
    loadFileMock.mockReset();

    getLlmSettingsMock.mockResolvedValue(defaultLlmSettings);
    resolveTextProviderMock.mockReturnValue("gemini");
  });

  describe("transcribeRecording", () => {
    it("sends base64 audio to LLM and stores parsed transcript segments", async () => {
      isTextGenerationEnabledMock.mockReturnValue(true);
      loadFileMock.mockResolvedValue(Buffer.from("fake-audio-data"));

      const invokeMock = vi.fn().mockResolvedValue({
        content: [
          "[00:05] Speaker 1: Hello everyone",
          "[00:12] Speaker 2: Good morning",
          "[01:30] Speaker 1: Let us begin",
        ].join("\n"),
      });
      createChatModelMock.mockReturnValue({ invoke: invokeMock });
      createTranscriptMock.mockResolvedValue(undefined);

      vi.spyOn(crypto, "randomUUID")
        .mockReturnValueOnce("uuid-1" as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce("uuid-2" as `${string}-${string}-${string}-${string}-${string}`)
        .mockReturnValueOnce("uuid-3" as `${string}-${string}-${string}-${string}-${string}`);

      const { transcribeRecording } = await import("./recording-transcription-service.js");
      const result = await transcribeRecording("meeting_1", "recordings/room-a/12345");

      expect(loadFileMock).toHaveBeenCalledWith("recordings/room-a/12345");
      expect(invokeMock).toHaveBeenCalledTimes(1);

      // Verify the HumanMessage content includes base64 audio
      const messageArg = invokeMock.mock.calls[0]?.[0][0];
      const mediaBlock = messageArg.content.find(
        (block: { type: string }) => block.type === "media"
      );
      expect(mediaBlock).toBeDefined();
      expect(mediaBlock.mimeType).toBe("video/mp4");
      expect(mediaBlock.data).toBe(Buffer.from("fake-audio-data").toString("base64"));

      expect(createTranscriptMock).toHaveBeenCalledTimes(3);
      expect(createTranscriptMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          meetingId: "meeting_1",
          speakerId: null,
          content: "[Speaker 1] Hello everyone",
        })
      );
      expect(createTranscriptMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          meetingId: "meeting_1",
          speakerId: null,
          content: "[Speaker 2] Good morning",
        })
      );
      expect(createTranscriptMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          meetingId: "meeting_1",
          speakerId: null,
          content: "[Speaker 1] Let us begin",
        })
      );
      expect(result).toEqual({ segmentCount: 3 });
    });

    it("handles fallback lines without the expected format", async () => {
      isTextGenerationEnabledMock.mockReturnValue(true);
      loadFileMock.mockResolvedValue(Buffer.from("audio"));

      const invokeMock = vi.fn().mockResolvedValue({
        content: "Just some plain text without timestamps",
      });
      createChatModelMock.mockReturnValue({ invoke: invokeMock });
      createTranscriptMock.mockResolvedValue(undefined);

      vi.spyOn(crypto, "randomUUID").mockReturnValue(
        "uuid-fallback" as `${string}-${string}-${string}-${string}-${string}`
      );

      const { transcribeRecording } = await import("./recording-transcription-service.js");
      const result = await transcribeRecording("meeting_1", "path/to/file");

      expect(createTranscriptMock).toHaveBeenCalledTimes(1);
      expect(createTranscriptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "[Speaker 1] Just some plain text without timestamps",
        })
      );
      expect(result).toEqual({ segmentCount: 1 });
    });

    it("returns segmentCount 0 for empty LLM response", async () => {
      isTextGenerationEnabledMock.mockReturnValue(true);
      loadFileMock.mockResolvedValue(Buffer.from("audio"));

      const invokeMock = vi.fn().mockResolvedValue({ content: "" });
      createChatModelMock.mockReturnValue({ invoke: invokeMock });

      const { transcribeRecording } = await import("./recording-transcription-service.js");
      const result = await transcribeRecording("meeting_1", "path/to/file");

      expect(createTranscriptMock).not.toHaveBeenCalled();
      expect(result).toEqual({ segmentCount: 0 });
    });

    it("returns segmentCount 0 when LLM is not configured", async () => {
      isTextGenerationEnabledMock.mockReturnValue(false);

      const { transcribeRecording } = await import("./recording-transcription-service.js");
      const result = await transcribeRecording("meeting_1", "path/to/file");

      expect(loadFileMock).not.toHaveBeenCalled();
      expect(createTranscriptMock).not.toHaveBeenCalled();
      expect(result).toEqual({ segmentCount: 0 });
    });

    it("returns segmentCount 0 when LLM invocation throws", async () => {
      isTextGenerationEnabledMock.mockReturnValue(true);
      loadFileMock.mockResolvedValue(Buffer.from("audio"));

      const invokeMock = vi.fn().mockRejectedValue(new Error("API failure"));
      createChatModelMock.mockReturnValue({ invoke: invokeMock });

      const { transcribeRecording } = await import("./recording-transcription-service.js");
      const result = await transcribeRecording("meeting_1", "path/to/file");

      expect(createTranscriptMock).not.toHaveBeenCalled();
      expect(result).toEqual({ segmentCount: 0 });
    });
  });
});
