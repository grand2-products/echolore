import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/index.js";
import { meetings, transcripts, summaries } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

export const meetingsRoutes = new Hono();

// Validation schemas
const createMeetingSchema = z.object({
  title: z.string().min(1),
  creatorId: z.string(),
  scheduledAt: z.string().optional(),
});

const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["scheduled", "active", "ended"]).optional(),
});

// GET /api/meetings - List all meetings
meetingsRoutes.get("/", async (c) => {
  try {
    const allMeetings = await db
      .select()
      .from(meetings)
      .orderBy(desc(meetings.createdAt));
    
    return c.json({ meetings: allMeetings });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return c.json({ error: "Failed to fetch meetings" }, 500);
  }
});

// GET /api/meetings/:id - Get meeting details
meetingsRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  
  try {
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, id));
    
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }
    
    const meetingTranscripts = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.meetingId, id))
      .orderBy(transcripts.timestamp);
    
    const meetingSummaries = await db
      .select()
      .from(summaries)
      .where(eq(summaries.meetingId, id))
      .orderBy(desc(summaries.createdAt));
    
    return c.json({
      meeting,
      transcripts: meetingTranscripts,
      summaries: meetingSummaries,
    });
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return c.json({ error: "Failed to fetch meeting" }, 500);
  }
});

// POST /api/meetings - Create new meeting
meetingsRoutes.post("/", zValidator("json", createMeetingSchema), async (c) => {
  const data = c.req.valid("json");
  
  try {
    const id = crypto.randomUUID();
    const roomName = `room-${id}`;
    const now = new Date();
    
    const [newMeeting] = await db
      .insert(meetings)
      .values({
        id,
        title: data.title,
        creatorId: data.creatorId,
        roomName,
        status: "scheduled",
        createdAt: now,
      })
      .returning();
    
    return c.json({ meeting: newMeeting }, 201);
  } catch (error) {
    console.error("Error creating meeting:", error);
    return c.json({ error: "Failed to create meeting" }, 500);
  }
});

// PUT /api/meetings/:id - Update meeting
meetingsRoutes.put("/:id", zValidator("json", updateMeetingSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  
  try {
    const updateData: Record<string, unknown> = {};
    
    if (data.title) updateData.title = data.title;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "active") {
        updateData.startedAt = new Date();
      } else if (data.status === "ended") {
        updateData.endedAt = new Date();
      }
    }
    
    const [updatedMeeting] = await db
      .update(meetings)
      .set(updateData)
      .where(eq(meetings.id, id))
      .returning();
    
    if (!updatedMeeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }
    
    return c.json({ meeting: updatedMeeting });
  } catch (error) {
    console.error("Error updating meeting:", error);
    return c.json({ error: "Failed to update meeting" }, 500);
  }
});

// DELETE /api/meetings/:id - Delete meeting
meetingsRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  
  try {
    const [deletedMeeting] = await db
      .delete(meetings)
      .where(eq(meetings.id, id))
      .returning();
    
    if (!deletedMeeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return c.json({ error: "Failed to delete meeting" }, 500);
  }
});

// POST /api/meetings/:id/transcripts - Add transcript
meetingsRoutes.post("/:id/transcripts", async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const transcriptId = crypto.randomUUID();
    
    const [newTranscript] = await db
      .insert(transcripts)
      .values({
        id: transcriptId,
        meetingId: id,
        speakerId: body.speakerId || null,
        content: body.content,
        timestamp: new Date(body.timestamp),
        createdAt: new Date(),
      })
      .returning();
    
    return c.json({ transcript: newTranscript }, 201);
  } catch (error) {
    console.error("Error adding transcript:", error);
    return c.json({ error: "Failed to add transcript" }, 500);
  }
});

// POST /api/meetings/:id/summaries - Add AI summary
meetingsRoutes.post("/:id/summaries", async (c) => {
  const { id } = c.req.param();
  
  try {
    const body = await c.req.json();
    const summaryId = crypto.randomUUID();
    
    const [newSummary] = await db
      .insert(summaries)
      .values({
        id: summaryId,
        meetingId: id,
        content: body.content,
        createdAt: new Date(),
      })
      .returning();
    
    return c.json({ summary: newSummary }, 201);
  } catch (error) {
    console.error("Error adding summary:", error);
    return c.json({ error: "Failed to add summary" }, 500);
  }
});
