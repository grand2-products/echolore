import { db } from "../../db/index.js";

export async function getCalendarToken(userId: string) {
  return (
    (await db
      .selectFrom("google_calendar_tokens")
      .selectAll()
      .where("user_id", "=", userId)
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
        access_token_enc: values.accessTokenEnc,
        refresh_token_enc: values.refreshTokenEnc,
        expires_at: values.expiresAt,
        scope: values.scope,
        ...(values.calendarId !== undefined ? { calendar_id: values.calendarId } : {}),
        updated_at: now,
      })
      .where("user_id", "=", userId)
      .execute();
  } else {
    await db
      .insertInto("google_calendar_tokens")
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        access_token_enc: values.accessTokenEnc,
        refresh_token_enc: values.refreshTokenEnc,
        expires_at: values.expiresAt,
        scope: values.scope,
        calendar_id: values.calendarId ?? "primary",
        updated_at: now,
        created_at: now,
      })
      .execute();
  }
}

export async function updateCalendarToken(userId: string, values: Record<string, unknown>) {
  await db
    .updateTable("google_calendar_tokens")
    .set({ ...values, updated_at: new Date() })
    .where("user_id", "=", userId)
    .execute();
}

export async function deleteCalendarToken(userId: string) {
  await db.deleteFrom("google_calendar_tokens").where("user_id", "=", userId).execute();
}

export async function hasCalendarToken(userId: string) {
  const row = await db
    .selectFrom("google_calendar_tokens")
    .select("id")
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return Boolean(row);
}
