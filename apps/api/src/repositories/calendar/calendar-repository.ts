import { db } from "../../db/index.js";

export async function getCalendarToken(userId: string) {
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
) {
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

export async function updateCalendarToken(userId: string, values: Record<string, unknown>) {
  await db
    .updateTable("google_calendar_tokens")
    .set({ ...values, updatedAt: new Date() })
    .where("userId", "=", userId)
    .execute();
}

export async function deleteCalendarToken(userId: string) {
  await db.deleteFrom("google_calendar_tokens").where("userId", "=", userId).execute();
}

export async function hasCalendarToken(userId: string) {
  const row = await db
    .selectFrom("google_calendar_tokens")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();
  return Boolean(row);
}
