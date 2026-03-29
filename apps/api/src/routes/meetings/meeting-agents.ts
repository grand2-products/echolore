import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import { generateMeetingAgentResponse } from "../../services/meeting/meeting-agent-runtime-service.js";
import {
  invokeMeetingAgent,
  leaveMeetingAgent,
  listActiveAgentSessions,
  listMeetingAgentTimeline,
} from "../../services/meeting/meeting-realtime-service.js";
import { getMeetingById } from "../../services/meeting/meeting-service.js";
import { agentRespondSchema } from "./schemas.js";

export const meetingAgentRoutes = new Hono<AppEnv>();

// GET /api/meetings/:id/agent-events
meetingAgentRoutes.get(
  "/:id/agent-events",
  withErrorHandler("MEETING_AGENT_EVENTS_FETCH_FAILED", "Failed to fetch meeting agent events"),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    return c.json({ events: await listMeetingAgentTimeline(id) });
  }
);

// GET /api/meetings/:id/agents/active
meetingAgentRoutes.get(
  "/:id/agents/active",
  withErrorHandler(
    "MEETING_AGENT_SESSIONS_FETCH_FAILED",
    "Failed to fetch active meeting agent sessions"
  ),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    return c.json({ sessions: await listActiveAgentSessions(id) });
  }
);

// POST /api/meetings/:id/agents/:agentId/invoke
meetingAgentRoutes.post(
  "/:id/agents/:agentId/invoke",
  withErrorHandler("MEETING_AGENT_INVOKE_FAILED", "Failed to invoke meeting agent"),
  async (c) => {
    const { id, agentId } = c.req.param();
    const user = c.get("user");

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const result = await invokeMeetingAgent({
      meetingId: id,
      agentId,
      invokedByUserId: user.id,
    });

    if (!result) {
      return jsonError(
        c,
        404,
        "MEETING_AGENT_NOT_FOUND_OR_INACTIVE",
        "Agent not found or inactive"
      );
    }
    return c.json(result, result.reused ? 200 : 201);
  }
);

// POST /api/meetings/:id/agents/:agentId/leave
meetingAgentRoutes.post(
  "/:id/agents/:agentId/leave",
  withErrorHandler("MEETING_AGENT_LEAVE_FAILED", "Failed to end meeting agent session"),
  async (c) => {
    const { id, agentId } = c.req.param();
    const user = c.get("user");

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const session = await leaveMeetingAgent({
      meetingId: id,
      agentId,
      triggeredByUserId: user.id,
    });

    if (!session) {
      return jsonError(c, 404, "MEETING_AGENT_SESSION_NOT_FOUND", "Active agent session not found");
    }
    return c.json({ session });
  }
);

// POST /api/meetings/:id/agents/:agentId/respond
meetingAgentRoutes.post(
  "/:id/agents/:agentId/respond",
  zValidator("json", agentRespondSchema),
  withErrorHandler("MEETING_AGENT_RESPONSE_FAILED", "Failed to generate meeting agent response"),
  async (c) => {
    const { id, agentId } = c.req.param();
    const user = c.get("user");
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const response = await generateMeetingAgentResponse({
      meetingId: id,
      agentId,
      prompt: data.prompt,
      triggeredByUserId: user.id,
      languageCode: data.languageCode,
    });

    if (!response) {
      return jsonError(c, 404, "MEETING_AGENT_SESSION_NOT_FOUND", "Active agent session not found");
    }

    return c.json(response);
  }
);
