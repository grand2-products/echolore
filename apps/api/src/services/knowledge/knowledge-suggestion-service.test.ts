import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  initLlmWithSettingsMock,
  createSuggestionMock,
  getSuggestionByIdMock,
  updateSuggestionMock,
  createPageWithAccessDefaultsMock,
  createPageRevisionMock,
  indexPageMock,
  buildKnowledgeSuggestionPromptMock,
  listActivePageTitlesMock,
  listBlockContentSnippetsMock,
  insertBlocksMock,
  updatePageTitleAndReplaceBlocksMock,
} = vi.hoisted(() => {
  return {
    initLlmWithSettingsMock: vi.fn(),
    createSuggestionMock: vi.fn(),
    getSuggestionByIdMock: vi.fn(),
    updateSuggestionMock: vi.fn(),
    createPageWithAccessDefaultsMock: vi.fn(),
    createPageRevisionMock: vi.fn(),
    indexPageMock: vi.fn(),
    buildKnowledgeSuggestionPromptMock: vi.fn(),
    listActivePageTitlesMock: vi.fn(),
    listBlockContentSnippetsMock: vi.fn(),
    insertBlocksMock: vi.fn(),
    updatePageTitleAndReplaceBlocksMock: vi.fn(),
  };
});

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, default: { ...actual, randomUUID: vi.fn(() => "page_new") } };
});

vi.mock("../../ai/llm/index.js", () => ({
  initLlmWithSettings: initLlmWithSettingsMock,
}));

vi.mock("../../ai/agent/knowledge-suggestion-prompt.js", () => ({
  buildKnowledgeSuggestionPrompt: buildKnowledgeSuggestionPromptMock,
}));

vi.mock("../../repositories/knowledge/knowledge-suggestion-repository.js", () => ({
  createSuggestion: createSuggestionMock,
  getSuggestionById: getSuggestionByIdMock,
  updateSuggestion: updateSuggestionMock,
}));

vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  listActivePageTitles: listActivePageTitlesMock,
  listBlockContentSnippets: listBlockContentSnippetsMock,
  insertBlocks: insertBlocksMock,
  updatePageTitleAndReplaceBlocks: updatePageTitleAndReplaceBlocksMock,
}));

vi.mock("../wiki/wiki-service.js", () => ({
  createPageWithAccessDefaults: createPageWithAccessDefaultsMock,
  createPageRevision: createPageRevisionMock,
}));

vi.mock("../wiki/embedding-service.js", () => ({
  indexPage: indexPageMock,
}));

import {
  approveSuggestion,
  generateSuggestions,
  rejectSuggestion,
} from "./knowledge-suggestion-service.js";

describe("knowledge-suggestion-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    initLlmWithSettingsMock.mockReset();
    createSuggestionMock.mockReset();
    getSuggestionByIdMock.mockReset();
    updateSuggestionMock.mockReset();
    createPageWithAccessDefaultsMock.mockReset();
    createPageRevisionMock.mockReset();
    indexPageMock.mockReset();
    buildKnowledgeSuggestionPromptMock.mockReset();
    listActivePageTitlesMock.mockReset();
    listBlockContentSnippetsMock.mockReset();
    insertBlocksMock.mockReset();
    updatePageTitleAndReplaceBlocksMock.mockReset();
  });

  describe("generateSuggestions", () => {
    const defaultInput = {
      sourceType: "transcription" as const,
      sourceId: "meeting_1",
      sourceSummary: "Team standup notes",
      sourceContent: "Discussion about project roadmap and timelines.",
      targetSpaceId: "space_1",
    };

    it("skips when LLM is not configured", async () => {
      initLlmWithSettingsMock.mockResolvedValue(null);

      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).not.toHaveBeenCalled();
    });

    it("generates suggestions from valid LLM JSON response", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");

      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      const llmResponse = JSON.stringify([
        {
          targetType: "new_page",
          targetPageId: null,
          proposedTitle: "Roadmap Summary",
          blocks: [
            {
              type: "paragraph",
              content: "Project timeline discussion",
              properties: null,
              sortOrder: 0,
            },
          ],
          reasoning: "New page needed for roadmap overview",
        },
      ]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: llmResponse }) },
        provider: "gemini",
        overrides: {},
      });
      createSuggestionMock.mockResolvedValue({ id: "suggestion_1" });

      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).toHaveBeenCalledTimes(1);
      expect(createSuggestionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          source_type: "transcription",
          source_id: "meeting_1",
          target_type: "new_page",
          proposed_title: "Roadmap Summary",
          status: "pending",
        })
      );
    });

    it("parses JSON wrapped in markdown code blocks", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");
      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      const llmResponse =
        "```json\n" +
        JSON.stringify([
          {
            targetType: "new_page",
            targetPageId: null,
            proposedTitle: "Test Page",
            blocks: [{ type: "paragraph", content: "Hello", properties: null, sortOrder: 0 }],
            reasoning: "Test",
          },
        ]) +
        "\n```";

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: llmResponse }) },
        provider: "gemini",
        overrides: {},
      });
      createSuggestionMock.mockResolvedValue({ id: "suggestion_1" });

      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).toHaveBeenCalledTimes(1);
    });

    it("skips invalid items that fail Zod validation", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");
      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      const llmResponse = JSON.stringify([
        {
          // Missing required fields - should fail Zod validation
          targetType: "invalid_type",
          proposedTitle: "Bad",
          blocks: [],
          reasoning: "Bad item",
        },
        {
          targetType: "new_page",
          proposedTitle: "Good Page",
          blocks: [{ type: "paragraph", content: "Valid", properties: null, sortOrder: 0 }],
          reasoning: "Valid item",
        },
      ]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: llmResponse }) },
        provider: "gemini",
        overrides: {},
      });
      createSuggestionMock.mockResolvedValue({ id: "suggestion_1" });

      await generateSuggestions(defaultInput);

      // Only the valid item should be created
      expect(createSuggestionMock).toHaveBeenCalledTimes(1);
      expect(createSuggestionMock).toHaveBeenCalledWith(
        expect.objectContaining({ proposed_title: "Good Page" })
      );
    });

    it("handles non-JSON LLM responses gracefully", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");
      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: "This is not JSON at all" }) },
        provider: "gemini",
        overrides: {},
      });

      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).not.toHaveBeenCalled();
    });

    it("handles LLM invocation errors gracefully", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");
      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockRejectedValue(new Error("LLM API error")) },
        provider: "gemini",
        overrides: {},
      });

      // Should not throw
      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).not.toHaveBeenCalled();
    });

    it("handles non-array JSON responses", async () => {
      buildKnowledgeSuggestionPromptMock.mockReturnValue("test prompt");
      listActivePageTitlesMock.mockResolvedValue([]);
      listBlockContentSnippetsMock.mockResolvedValue([]);

      initLlmWithSettingsMock.mockResolvedValue({
        model: { invoke: vi.fn().mockResolvedValue({ content: '{"not": "an array"}' }) },
        provider: "gemini",
        overrides: {},
      });

      await generateSuggestions(defaultInput);

      expect(createSuggestionMock).not.toHaveBeenCalled();
    });
  });

  describe("approveSuggestion", () => {
    it("creates a new page for new_page suggestions", async () => {
      const suggestion = {
        id: "sug_1",
        source_type: "transcription",
        status: "pending",
        target_type: "new_page",
        target_page_id: null,
        target_space_id: "space_1",
        proposed_title: "New Page Title",
        proposed_blocks: [
          { type: "paragraph", content: "Block content", properties: null, sortOrder: 0 },
        ],
        ai_reasoning: "test",
      };

      getSuggestionByIdMock.mockResolvedValue(suggestion);
      createPageWithAccessDefaultsMock.mockResolvedValue({ id: "page_new" });
      insertBlocksMock.mockResolvedValue(undefined);
      updateSuggestionMock.mockResolvedValue({});
      indexPageMock.mockResolvedValue(undefined);

      vi.spyOn(crypto, "randomUUID").mockReturnValue(
        "page_new" as `${string}-${string}-${string}-${string}-${string}`
      );

      const result = await approveSuggestion("sug_1", "reviewer_1");

      expect(result).toEqual({ pageId: "page_new" });
      expect(createPageWithAccessDefaultsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "page_new",
          title: "New Page Title",
          spaceId: "space_1",
          authorId: "reviewer_1",
        })
      );
      expect(updateSuggestionMock).toHaveBeenCalledWith(
        "sug_1",
        expect.objectContaining({
          status: "approved",
          reviewed_by_user_id: "reviewer_1",
          result_page_id: "page_new",
        })
      );
    });

    it("updates existing page for update_page suggestions", async () => {
      const suggestion = {
        id: "sug_2",
        status: "pending",
        target_type: "update_page",
        target_page_id: "existing_page",
        target_space_id: "space_1",
        proposed_title: "Updated Title",
        proposed_blocks: [
          { type: "paragraph", content: "Updated content", properties: null, sortOrder: 0 },
        ],
      };

      getSuggestionByIdMock.mockResolvedValue(suggestion);
      createPageRevisionMock.mockResolvedValue(undefined);
      updatePageTitleAndReplaceBlocksMock.mockResolvedValue(undefined);
      updateSuggestionMock.mockResolvedValue({});
      indexPageMock.mockResolvedValue(undefined);

      const result = await approveSuggestion("sug_2", "reviewer_1");

      expect(result).toEqual({ pageId: "existing_page" });
      expect(createPageRevisionMock).toHaveBeenCalledWith("existing_page", "reviewer_1");
      expect(updatePageTitleAndReplaceBlocksMock).toHaveBeenCalledTimes(1);
    });

    it("throws when suggestion is not found", async () => {
      getSuggestionByIdMock.mockResolvedValue(null);

      await expect(approveSuggestion("nonexistent", "reviewer_1")).rejects.toThrow(
        "Suggestion not found"
      );
    });

    it("throws when suggestion is not pending", async () => {
      getSuggestionByIdMock.mockResolvedValue({
        id: "sug_1",
        status: "approved",
      });

      await expect(approveSuggestion("sug_1", "reviewer_1")).rejects.toThrow(
        "Suggestion is not pending"
      );
    });

    it("throws when update_page has no targetPageId", async () => {
      getSuggestionByIdMock.mockResolvedValue({
        id: "sug_1",
        status: "pending",
        target_type: "update_page",
        target_page_id: null,
        proposed_blocks: [],
      });

      await expect(approveSuggestion("sug_1", "reviewer_1")).rejects.toThrow(
        "Target page ID required for update"
      );
    });
  });

  describe("rejectSuggestion", () => {
    it("rejects a pending suggestion with a reason", async () => {
      getSuggestionByIdMock.mockResolvedValue({
        id: "sug_1",
        status: "pending",
      });
      updateSuggestionMock.mockResolvedValue({});

      await rejectSuggestion("sug_1", "reviewer_1", "Not relevant");

      expect(updateSuggestionMock).toHaveBeenCalledWith(
        "sug_1",
        expect.objectContaining({
          status: "rejected",
          reviewed_by_user_id: "reviewer_1",
          rejection_reason: "Not relevant",
        })
      );
    });

    it("throws when suggestion is not found", async () => {
      getSuggestionByIdMock.mockResolvedValue(null);

      await expect(rejectSuggestion("nonexistent", "reviewer_1", "reason")).rejects.toThrow(
        "Suggestion not found"
      );
    });

    it("throws when suggestion is not pending", async () => {
      getSuggestionByIdMock.mockResolvedValue({
        id: "sug_1",
        status: "rejected",
      });

      await expect(rejectSuggestion("sug_1", "reviewer_1", "reason")).rejects.toThrow(
        "Suggestion is not pending"
      );
    });
  });
});
