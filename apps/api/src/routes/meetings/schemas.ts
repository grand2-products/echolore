import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().optional(),
  attendeeEmails: z.array(z.string().email()).max(50).optional(),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["scheduled", "active", "ended"]).optional(),
});

export const createTranscriptSchema = z.object({
  speakerId: z.string().optional(),
  content: z.string().min(1),
  timestamp: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid ISO timestamp",
  }),
});

export const createSummarySchema = z.object({
  content: z.string().min(1),
});

export const runPipelineSchema = z.object({
  title: z.string().min(1).optional(),
});

export const realtimeTranscriptSchema = z.object({
  participantIdentity: z.string().min(1),
  speakerUserId: z.string().nullable().optional(),
  speakerLabel: z.string().min(1),
  content: z.string().min(1),
  isPartial: z.boolean(),
  segmentKey: z.string().min(1),
  provider: z.enum(["google", "vertex", "zhipu"]),
  confidence: z.number().nullable().optional(),
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid ISO timestamp",
  }),
  finalizedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
});

export const agentRespondSchema = z.object({
  prompt: z.string().min(1),
  languageCode: z.string().min(2).optional(),
});
