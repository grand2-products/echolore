import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { meetingRecordings } from "../../db/schema.js";

export async function createRecording(input: {
  id: string;
  meetingId: string;
  egressId: string;
  status: string;
  initiatedBy: string;
  contentType: string;
}) {
  const [recording] = await db.insert(meetingRecordings).values(input).returning();
  return recording;
}

export async function updateRecordingByEgressId(egressId: string, data: Record<string, unknown>) {
  await db.update(meetingRecordings).set(data).where(eq(meetingRecordings.egressId, egressId));
}

export async function listRecordingsByMeeting(meetingId: string) {
  return db.query.meetingRecordings.findMany({
    where: eq(meetingRecordings.meetingId, meetingId),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });
}

export async function findActiveRecording(meetingId: string) {
  return (
    (await db.query.meetingRecordings.findFirst({
      where: (r, { and, inArray }) =>
        and(eq(r.meetingId, meetingId), inArray(r.status, ["starting", "recording"])),
    })) ?? null
  );
}

export async function getRecordingByEgressId(egressId: string) {
  return (
    (await db.query.meetingRecordings.findFirst({
      where: eq(meetingRecordings.egressId, egressId),
      with: { meeting: true },
    })) ?? null
  );
}
