import type { AituberCitation } from "@echolore/shared/contracts";
import { escapeXmlTags } from "../../ai/sanitize-prompt-input.js";
import type { SessionUser } from "../../lib/auth.js";
import { searchDriveForUser } from "../drive/drive-vector-search-service.js";
import { searchVisibleChunks } from "../wiki/vector-search-service.js";

/**
 * RAG context shared between the AITuber agent's system prompt and the
 * citation list surfaced to viewers on `ai-complete`.
 */
export interface RagContext {
  /** Compact context string injected into the system prompt. */
  text: string;
  /** Sources referenced by the context; surfaced to viewers via ai-complete. */
  citations: AituberCitation[];
}

/**
 * Search Wiki + Drive in parallel and build a compact RAG context string,
 * scoped to the viewer's permissions. Returns empty when the viewer cannot be
 * resolved (no admin-scoped fallback) or when both searches return nothing.
 *
 * ## 権限モデル
 * 視聴者が認証済みであっても、その視聴者が read 権限を持たない Wiki ページや
 * Drive ファイルの内容が AI の応答経由で漏出してはならない。そのため、
 *   - Wiki: `searchVisibleChunks(viewer, ...)` — viewer の SessionUser でフィルタ
 *     (vector / ilike_fallback いずれの経路も viewer-scoped)
 *   - Drive: `searchDriveForUser(viewer.email, ...)` — viewer のメールでフィルタ
 * を使う。Wiki Chat 経路と同じ権限境界。
 *
 * Errors on either side are swallowed and logged as
 * `aituber-ai.search.wiki-error` / `aituber-ai.search.drive-error` so a single
 * provider outage doesn't take the loop offline.
 */
export async function buildRagContext(
  sessionId: string,
  query: string,
  viewer: SessionUser | null
): Promise<RagContext> {
  if (!viewer) {
    console.log(
      JSON.stringify({
        event: "aituber-ai.search.skipped",
        sessionId,
        reason: "viewer_unresolved",
      })
    );
    return { text: "", citations: [] };
  }

  const searchStart = Date.now();
  try {
    const [wikiOutcome, driveResults] = await Promise.all([
      searchVisibleChunks(viewer, query, 3).catch((err) => {
        console.warn(
          JSON.stringify({
            event: "aituber-ai.search.wiki-error",
            sessionId,
            viewerUserId: viewer.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        return { results: [], searchMode: "ilike_fallback" as const };
      }),
      searchDriveForUser(viewer.email, query, 2).catch((err) => {
        console.warn(
          JSON.stringify({
            event: "aituber-ai.search.drive-error",
            sessionId,
            viewerUserId: viewer.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
        return [] as Awaited<ReturnType<typeof searchDriveForUser>>;
      }),
    ]);

    const wikiResults = wikiOutcome.results;
    const parts: string[] = [];
    const citations: AituberCitation[] = [];
    for (const r of wikiResults) {
      parts.push(
        `[Wiki: ${escapeXmlTags(r.pageTitle)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
      citations.push({
        source: "wiki",
        pageId: r.pageId,
        pageTitle: r.pageTitle,
        similarity: r.similarity,
      });
    }
    for (const r of driveResults) {
      parts.push(
        `[Drive: ${escapeXmlTags(r.fileName)}] ${escapeXmlTags(r.chunkText.slice(0, 300))}`
      );
      citations.push({
        source: "drive",
        fileId: r.fileId,
        fileName: r.fileName,
        webViewLink: r.webViewLink ?? null,
      });
    }

    console.log(
      JSON.stringify({
        event: "aituber-ai.search",
        sessionId,
        viewerUserId: viewer.id,
        wikiResultCount: wikiResults.length,
        driveResultCount: driveResults.length,
        topWikiSimilarity: wikiResults[0]?.similarity ?? null,
        searchMode: wikiOutcome.searchMode,
        durationMs: Date.now() - searchStart,
      })
    );

    return { text: parts.length > 0 ? parts.join("\n") : "", citations };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "aituber-ai.search.error",
        sessionId,
        viewerUserId: viewer.id,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - searchStart,
      })
    );
    return { text: "", citations: [] };
  }
}
