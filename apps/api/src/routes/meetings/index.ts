import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.js";
import { meetingAgentRoutes } from "./meeting-agents.js";
import { meetingCrudRoutes } from "./meeting-crud.js";
import { meetingPipelineRoutes } from "./meeting-pipeline.js";
import { meetingRecordingRoutes } from "./meeting-recordings.js";
import { meetingSummaryRoutes } from "./meeting-summaries.js";
import { meetingTranscriptRoutes } from "./meeting-transcripts.js";

export const meetingsRoutes = new Hono<AppEnv>();

meetingsRoutes.route("/", meetingCrudRoutes);
meetingsRoutes.route("/", meetingTranscriptRoutes);
meetingsRoutes.route("/", meetingSummaryRoutes);
meetingsRoutes.route("/", meetingPipelineRoutes);
meetingsRoutes.route("/", meetingAgentRoutes);
meetingsRoutes.route("/", meetingRecordingRoutes);
