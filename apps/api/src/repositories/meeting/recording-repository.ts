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
      meeting_id: input.meetingId,
      egress_id: input.egressId,
      status: input.status,
      initiated_by: input.initiatedBy,
      content_type: input.contentType,
    })
    .returningAll()
    .executeTakeFirst();
  return row;
}

export async function updateRecordingByEgressId(egressId: string, data: Record<string, unknown>) {
  await db.updateTable("meeting_recordings").set(data).where("egress_id", "=", egressId).execute();
}

export async function listRecordingsByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_recordings")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .orderBy("created_at", "desc")
    .execute();
}

export async function findActiveRecording(meetingId: string) {
  return (
    (await db
      .selectFrom("meeting_recordings")
      .selectAll()
      .where("meeting_id", "=", meetingId)
      .where("status", "in", ["starting", "recording"])
      .executeTakeFirst()) ?? null
  );
}

export async function getRecordingByEgressId(egressId: string) {
  return (
    (await db
      .selectFrom("meeting_recordings")
      .selectAll()
      .where("egress_id", "=", egressId)
      .executeTakeFirst()) ?? null
  );
}
