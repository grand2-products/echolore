import { db } from "../../db/index.js";

export async function createRecording(input: {
  id: string;
  meetingId: string;
  egressId: string;
  status: string;
  initiatedBy: string;
  contentType: string;
}) {
  const row = await db
    .insertInto("meeting_recordings")
    .values({
      id: input.id,
      meetingId: input.meetingId,
      egressId: input.egressId,
      status: input.status,
      initiatedBy: input.initiatedBy,
      contentType: input.contentType,
    })
    .returningAll()
    .executeTakeFirst();
  return row;
}

export async function updateRecordingByEgressId(egressId: string, data: Record<string, unknown>) {
  await db.updateTable("meeting_recordings").set(data).where("egressId", "=", egressId).execute();
}

export async function listRecordingsByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_recordings")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function findActiveRecording(meetingId: string) {
  return (
    (await db
      .selectFrom("meeting_recordings")
      .selectAll()
      .where("meetingId", "=", meetingId)
      .where("status", "in", ["starting", "recording"])
      .executeTakeFirst()) ?? null
  );
}

export async function getRecordingByEgressId(egressId: string) {
  return (
    (await db
      .selectFrom("meeting_recordings")
      .selectAll()
      .where("egressId", "=", egressId)
      .executeTakeFirst()) ?? null
  );
}
