import crypto from "node:crypto";
import type { KnowledgeSuggestionSourceType } from "@echolore/shared/contracts";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { buildKnowledgeSuggestionPrompt } from "../../ai/agent/knowledge-suggestion-prompt.js";
import { initLlmWithSettings } from "../../ai/llm/index.js";
import {
  createSuggestion,
  getSuggestionById,
  updateSuggestion,
} from "../../repositories/knowledge/knowledge-suggestion-repository.js";

// Re-export for route layer access
export {
  getSuggestionById,
  listSuggestions,
} from "../../repositories/knowledge/knowledge-suggestion-repository.js";

import {
  insertBlocks,
  listActivePageTitles,
  listBlockContentSnippets,
  updatePageTitleAndReplaceBlocks,
} from "../../repositories/wiki/wiki-repository.js";
import { indexPage } from "../wiki/embedding-service.js";
import { createPageRevision, createPageWithAccessDefaults } from "../wiki/wiki-service.js";

interface SuggestionInput {
  sourceType: KnowledgeSuggestionSourceType;
  sourceId?: string;
  sourceSummary?: string;
  sourceContent: string;
  targetSpaceId: string;
}

interface LlmSuggestion {
  targetType: "new_page" | "update_page";
  targetPageId: string | null;
  proposedTitle: string;
  blocks: Array<{
    type: string;
    content: string | null;
    properties: Record<string, unknown> | null;
    sortOrder: number;
  }>;
  reasoning: string;
}

export async function generateSuggestions(input: SuggestionInput): Promise<void> {
  const result = await initLlmWithSettings({ temperature: 0.3 });

  if (!result) {
    console.warn("[knowledge-suggestion] LLM not configured, skipping");
    return;
  }

  // Gather existing pages for context
  const existingPages = await listActivePageTitles(30);

  const existingPagesWithSnippet = await Promise.all(
    existingPages.map(async (p) => {
      const pageBlocks = await listBlockContentSnippets(p.id, 3);
      const snippet = pageBlocks
        .map((b) => b.content ?? "")
        .filter(Boolean)
        .join(" ")
        .slice(0, 200);
      return { id: p.id, title: p.title, snippet };
    })
  );

  const prompt = buildKnowledgeSuggestionPrompt({
    sourceDescription: input.sourceSummary ?? input.sourceType,
    sourceContent: input.sourceContent,
    existingPages: existingPagesWithSnippet,
  });

  try {
    const model = result.model;
    const response = await model.invoke([new HumanMessage(prompt)]);
    const text =
      typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();

    const llmSuggestions = parseSuggestions(text);

    for (const suggestion of llmSuggestions) {
      const now = new Date();
      await createSuggestion({
        id: crypto.randomUUID(),
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        source_summary: input.sourceSummary ?? null,
        target_type: suggestion.targetType,
        target_page_id: suggestion.targetPageId ?? null,
        target_space_id: input.targetSpaceId,
        proposed_title: suggestion.proposedTitle,
        proposed_blocks: suggestion.blocks,
        ai_reasoning: suggestion.reasoning,
        status: "pending",
        reviewed_by_user_id: null,
        reviewed_at: null,
        rejection_reason: null,
        result_page_id: null,
        created_at: now,
        updated_at: now,
      });
    }

    if (llmSuggestions.length > 0) {
      console.log(
        `[knowledge-suggestion] Generated ${llmSuggestions.length} suggestions from ${input.sourceType}`
      );
    }
  } catch (err) {
    console.error("[knowledge-suggestion] Generation failed:", err);
  }
}

const LlmSuggestionSchema = z.object({
  targetType: z.enum(["new_page", "update_page"]),
  targetPageId: z.string().nullable().optional().default(null),
  proposedTitle: z.string(),
  blocks: z.array(
    z.object({
      type: z.string(),
      content: z.string().nullable().optional().default(null),
      properties: z.record(z.string(), z.unknown()).nullable().optional().default(null),
      sortOrder: z.number(),
    })
  ),
  reasoning: z.string(),
});

function parseSuggestions(text: string): LlmSuggestion[] {
  // Extract JSON from potential markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? (jsonMatch[1] ?? "").trim() : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn("[knowledge-suggestion] Failed to parse LLM response as JSON");
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: LlmSuggestion[] = [];
  for (const item of parsed) {
    const result = LlmSuggestionSchema.safeParse(item);
    if (result.success) {
      results.push(result.data);
    }
  }
  return results;
}

export async function approveSuggestion(
  suggestionId: string,
  reviewerUserId: string
): Promise<{ pageId: string }> {
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) throw new Error("Suggestion not found");
  if (suggestion.status !== "pending") throw new Error("Suggestion is not pending");

  const now = new Date();
  let pageId: string;

  if (suggestion.target_type === "new_page") {
    pageId = crypto.randomUUID();
    const page = await createPageWithAccessDefaults({
      id: pageId,
      title: suggestion.proposed_title,
      spaceId: suggestion.target_space_id,
      parentId: null,
      authorId: reviewerUserId,
      createdAt: now,
      updatedAt: now,
    });

    // Insert proposed blocks
    if (suggestion.proposed_blocks.length > 0) {
      await insertBlocks(
        suggestion.proposed_blocks.map(
          (block: {
            type: string;
            content: string | null;
            properties: Record<string, unknown> | null;
            sortOrder: number;
          }) => ({
            id: crypto.randomUUID(),
            pageId: page.id,
            type: block.type,
            content: block.content,
            properties: block.properties,
            sortOrder: block.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
        )
      );
    }
  } else {
    // update_page: save current revision, then replace content in a transaction
    if (!suggestion.target_page_id) throw new Error("Target page ID required for update");
    pageId = suggestion.target_page_id;

    // Snapshot current state before modifying
    await createPageRevision(pageId, reviewerUserId);

    // Apply changes atomically
    await updatePageTitleAndReplaceBlocks({
      pageId,
      title: suggestion.proposed_title,
      blocks: suggestion.proposed_blocks.map(
        (block: {
          type: string;
          content: string | null;
          properties: Record<string, unknown> | null;
          sortOrder: number;
        }) => ({
          id: crypto.randomUUID(),
          type: block.type,
          content: block.content,
          properties: block.properties,
          sortOrder: block.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
      ),
      now,
    });
  }

  // Update suggestion status
  await updateSuggestion(suggestionId, {
    status: "approved",
    reviewed_by_user_id: reviewerUserId,
    reviewed_at: now,
    result_page_id: pageId,
    updated_at: now,
  });

  // Re-index embeddings (fire-and-forget)
  indexPage(pageId).catch((err) =>
    console.error("[knowledge-suggestion] Failed to index page:", err)
  );

  return { pageId };
}

export async function rejectSuggestion(
  suggestionId: string,
  reviewerUserId: string,
  reason: string
): Promise<void> {
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) throw new Error("Suggestion not found");
  if (suggestion.status !== "pending") throw new Error("Suggestion is not pending");

  const now = new Date();
  await updateSuggestion(suggestionId, {
    status: "rejected",
    reviewed_by_user_id: reviewerUserId,
    reviewed_at: now,
    rejection_reason: reason,
    updated_at: now,
  });
}
