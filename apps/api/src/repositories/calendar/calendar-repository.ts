import { db } from "../../db/index.js";
import type { GoogleCalendarToken } from "../../db/schema.js";

export interface UpdateCalendarTokenInput {
  accessTokenEnc?: string;
  refreshTokenEnc?: string;
  expiresAt?: Date;
}

export async function getCalendarToken(userId: string): Promise<GoogleCalendarToken | null> {
  return (
    (await db
      .selectFrom("google_calendar_tokens")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst()) ?? null
  );
}

export async function upsertCalendarToken(
  userId: string,
  values: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: Date;
    scope: string;
    calendarId?: string;
  }
): Promise<void> {
  const now = new Date();
  const existing = await getCalendarToken(userId);

  if (existing) {
    await db
      .updateTable("google_calendar_tokens")
      .set({
        accessTokenEnc: values.accessTokenEnc,
        refreshTokenEnc: values.refreshTokenEnc,
        expiresAt: values.expiresAt,
        scope: values.scope,
        ...(values.calendarId !== undefined ? { calendarId: values.calendarId } : {}),
        updatedAt: now,
      })
      .where("userId", "=", userId)
      .execute();
  } else {
    await db
      .insertInto("google_calendar_tokens")
      .values({
        id: crypto.randomUUID(),
        userId: userId,
        accessTokenEnc: values.accessTokenEnc,
        refreshTokenEnc: values.refreshTokenEnc,
        expiresAt: values.expiresAt,
        scope: values.scope,
        calendarId: values.calendarId ?? "primary",
        updatedAt: now,
        createdAt: now,
      })
      .execute();
  }
}

export async function updateCalendarToken(
  userId: string,
  values: UpdateCalendarTokenInput
): Promise<void> {
  await db
    .updateTable("google_calendar_tokens")
    .set({ ...values, updatedAt: new Date() })
    .where("userId", "=", userId)
    .execute();
}

export async function deleteCalendarToken(userId: string): Promise<void> {
  await db.deleteFrom("google_calendar_tokens").where("userId", "=", userId).execute();
}

export async function hasCalendarToken(userId: string): Promise<boolean> {
  const row = await db
    .selectFrom("google_calendar_tokens")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();
  return Boolean(row);
}
