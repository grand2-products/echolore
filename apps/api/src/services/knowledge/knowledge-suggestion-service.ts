import type { KnowledgeSuggestionSourceType } from "@echolore/shared/contracts";
import { HumanMessage } from "@langchain/core/messages";
import { desc, eq, isNull } from "drizzle-orm";
import { buildKnowledgeSuggestionPrompt } from "../../ai/agent/knowledge-suggestion-prompt.js";
import type { LlmOverrides } from "../../ai/llm/index.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { db } from "../../db/index.js";
import { blocks, pages } from "../../db/schema.js";
import {
  createSuggestion,
  getSuggestionById,
  updateSuggestion,
} from "../../repositories/knowledge/knowledge-suggestion-repository.js";
import { getLlmSettings } from "../admin/admin-service.js";
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
  const dbSettings = await getLlmSettings();
  const overrides: LlmOverrides = {
    geminiApiKey: dbSettings.geminiApiKey,
    geminiTextModel: dbSettings.geminiTextModel,
    vertexProject: dbSettings.vertexProject,
    vertexLocation: dbSettings.vertexLocation,
    vertexModel: dbSettings.vertexModel,
    zhipuApiKey: dbSettings.zhipuApiKey,
    zhipuTextModel: dbSettings.zhipuTextModel,
    zhipuUseCodingPlan: dbSettings.zhipuUseCodingPlan,
  };
  const provider = resolveTextProvider(dbSettings.provider);

  if (!isTextGenerationEnabled(provider, overrides)) {
    console.warn("[knowledge-suggestion] LLM not configured, skipping");
    return;
  }

  // Gather existing pages for context
  const existingPages = await db
    .select({
      id: pages.id,
      title: pages.title,
    })
    .from(pages)
    .where(isNull(pages.deletedAt))
    .orderBy(desc(pages.updatedAt))
    .limit(30);

  const existingPagesWithSnippet = await Promise.all(
    existingPages.map(async (p) => {
      const pageBlocks = await db
        .select({ content: blocks.content })
        .from(blocks)
        .where(eq(blocks.pageId, p.id))
        .orderBy(blocks.sortOrder)
        .limit(3);
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
    const model = createChatModel({ provider, temperature: 0.3, overrides });
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
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceSummary: input.sourceSummary ?? null,
        targetType: suggestion.targetType,
        targetPageId: suggestion.targetPageId ?? null,
        targetSpaceId: input.targetSpaceId,
        proposedTitle: suggestion.proposedTitle,
        proposedBlocks: suggestion.blocks,
        aiReasoning: suggestion.reasoning,
        status: "pending",
        reviewedByUserId: null,
        reviewedAt: null,
        rejectionReason: null,
        resultPageId: null,
        createdAt: now,
        updatedAt: now,
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

function parseSuggestions(text: string): LlmSuggestion[] {
  // Extract JSON from potential markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? (jsonMatch[1] ?? "").trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s: unknown): s is LlmSuggestion =>
        typeof s === "object" &&
        s !== null &&
        "targetType" in s &&
        "proposedTitle" in s &&
        "blocks" in s &&
        "reasoning" in s
    );
  } catch {
    console.warn("[knowledge-suggestion] Failed to parse LLM response as JSON");
    return [];
  }
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

  if (suggestion.targetType === "new_page") {
    pageId = crypto.randomUUID();
    const page = await createPageWithAccessDefaults({
      id: pageId,
      title: suggestion.proposedTitle,
      spaceId: suggestion.targetSpaceId,
      parentId: null,
      authorId: reviewerUserId,
      createdAt: now,
      updatedAt: now,
    });

    // Insert proposed blocks
    if (suggestion.proposedBlocks.length > 0) {
      await db.insert(blocks).values(
        suggestion.proposedBlocks.map((block) => ({
          id: crypto.randomUUID(),
          pageId: page.id,
          type: block.type,
          content: block.content,
          properties: block.properties,
          sortOrder: block.sortOrder,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }
  } else {
    // update_page: save current revision, then replace content in a transaction
    if (!suggestion.targetPageId) throw new Error("Target page ID required for update");
    pageId = suggestion.targetPageId;

    // Snapshot current state before modifying
    await createPageRevision(pageId, reviewerUserId);

    // Apply changes atomically
    await db.transaction(async (tx) => {
      await tx
        .update(pages)
        .set({ title: suggestion.proposedTitle, updatedAt: now })
        .where(eq(pages.id, pageId));

      await tx.delete(blocks).where(eq(blocks.pageId, pageId));

      if (suggestion.proposedBlocks.length > 0) {
        await tx.insert(blocks).values(
          suggestion.proposedBlocks.map((block) => ({
            id: crypto.randomUUID(),
            pageId,
            type: block.type,
            content: block.content,
            properties: block.properties,
            sortOrder: block.sortOrder,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }
    });
  }

  // Update suggestion status
  await updateSuggestion(suggestionId, {
    status: "approved",
    reviewedByUserId: reviewerUserId,
    reviewedAt: now,
    resultPageId: pageId,
    updatedAt: now,
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
    reviewedByUserId: reviewerUserId,
    reviewedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  });
}
