import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import { createSummary, getMeetingById } from "../../repositories/meeting/meeting-repository.js";
import { toSummaryDto } from "./dto.js";
import { createSummarySchema } from "./schemas.js";

export const meetingSummaryRoutes = new Hono<AppEnv>();

// POST /api/meetings/:id/summaries - Add AI summary
meetingSummaryRoutes.post(
  "/:id/summaries",
  zValidator("json", createSummarySchema),
  withErrorHandler("MEETING_SUMMARY_CREATE_FAILED", "Failed to add summary"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const summaryId = crypto.randomUUID();

    const newSummary = await createSummary({
      id: summaryId,
      meetingId: id,
      content: data.content,
      createdAt: new Date(),
    });

    if (!newSummary) {
      return jsonError(c, 500, "MEETING_SUMMARY_CREATE_FAILED", "Failed to add summary");
    }

    return c.json({ summary: toSummaryDto(newSummary) }, 201);
  }
);
