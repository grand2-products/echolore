import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { generateMeetingSummary } from "../../ai/meeting-summary.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import {
  createMeetingSummaryWikiArtifacts,
  getExistingRoomAiPipelineResult,
  getMeetingById,
  getMeetingTranscripts,
} from "../../services/meeting/meeting-service.js";
import { toSummaryDto } from "./dto.js";
import { runPipelineSchema } from "./schemas.js";

export const meetingPipelineRoutes = new Hono<AppEnv>();

// POST /api/meetings/:id/pipeline/run - Transcribe->Summarize->Wiki (MVP)
meetingPipelineRoutes.post(
  "/:id/pipeline/run",
  zValidator("json", runPipelineSchema),
  withErrorHandler("MEETING_PIPELINE_RUN_FAILED", "Failed to run room AI pipeline"),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    let meetingTranscripts = await getMeetingTranscripts(id);

    // If no transcripts exist, try to transcribe from a completed recording
    if (meetingTranscripts.length === 0) {
      try {
        const { maybeTranscribeCompletedRecording } = await import(
          "../../services/meeting/recording-transcription-service.js"
        );
        await maybeTranscribeCompletedRecording(id);
        meetingTranscripts = await getMeetingTranscripts(id);
      } catch {
        // transcription failed, continue with empty check below
      }
    }

    if (meetingTranscripts.length === 0) {
      return jsonError(
        c,
        409,
        "MEETING_PIPELINE_TRANSCRIPTS_MISSING",
        "No transcripts found for this meeting"
      );
    }

    const existingPipelineResult = await getExistingRoomAiPipelineResult(id);
    if (existingPipelineResult) {
      await auditAction(c, "roomai.pipeline.reused", "meeting", meeting.id, {
        transcriptCount: meetingTranscripts.length,
        summaryId: existingPipelineResult.summary.id,
        wikiPageId: existingPipelineResult.wikiPage.id,
      });

      return c.json({
        meetingId: meeting.id,
        summary: toSummaryDto(existingPipelineResult.summary),
        wikiPage: existingPipelineResult.wikiPage,
        reused: true,
      });
    }

    const summaryContent = await generateMeetingSummary(
      body.title ?? meeting.title,
      meetingTranscripts
    );

    const { summary: createdSummary, wikiPage } = await createMeetingSummaryWikiArtifacts(
      meeting,
      summaryContent
    );

    await auditAction(c, "roomai.pipeline.run", "meeting", meeting.id, {
      transcriptCount: meetingTranscripts.length,
      summaryId: createdSummary.id,
      wikiPageId: wikiPage.id,
      reused: false,
    });

    return c.json({
      meetingId: meeting.id,
      summary: toSummaryDto(createdSummary),
      wikiPage,
      reused: false,
    });
  }
);
