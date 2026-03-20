import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { googleCalendarTokens } from "../../db/schema.js";

export async function getCalendarToken(userId: string) {
  const [row] = await db
    .select()
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);
  return row ?? null;
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
      .update(googleCalendarTokens)
      .set({ ...values, updatedAt: now })
      .where(eq(googleCalendarTokens.userId, userId));
  } else {
    await db.insert(googleCalendarTokens).values({
      id: crypto.randomUUID(),
      userId,
      ...values,
      calendarId: values.calendarId ?? "primary",
      updatedAt: now,
      createdAt: now,
    });
  }
}

export async function updateCalendarToken(userId: string, values: Record<string, unknown>) {
  await db
    .update(googleCalendarTokens)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(googleCalendarTokens.userId, userId));
}

export async function deleteCalendarToken(userId: string) {
  await db.delete(googleCalendarTokens).where(eq(googleCalendarTokens.userId, userId));
}

export async function hasCalendarToken(userId: string) {
  const [row] = await db
    .select({ id: googleCalendarTokens.id })
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.userId, userId))
    .limit(1);
  return Boolean(row);
}
