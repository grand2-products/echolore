import { google } from "googleapis";
import { decrypt, encrypt } from "../../lib/crypto.js";
import {
  deleteCalendarToken,
  getCalendarToken,
  hasCalendarToken,
  updateCalendarToken,
  upsertCalendarToken,
} from "../../repositories/calendar/calendar-repository.js";
import { getAuthSettings } from "../admin/auth-settings-service.js";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

async function getOAuth2Client() {
  const settings = await getAuthSettings();
  return new google.auth.OAuth2(
    settings.googleClientId || undefined,
    settings.googleClientSecret || undefined,
    `${process.env.APP_BASE_URL || "http://localhost:3001"}/api/calendar/callback`
  );
}

export async function getAuthUrl(userId: string): Promise<string> {
  const client = await getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: userId,
    prompt: "consent",
    include_granted_scopes: false,
  });
}

export async function handleCallback(code: string, userId: string): Promise<void> {
  const client = await getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to obtain tokens from Google");
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  await upsertCalendarToken(userId, {
    accessTokenEnc: encrypt(tokens.access_token),
    refreshTokenEnc: encrypt(tokens.refresh_token),
    expiresAt,
    scope: tokens.scope || SCOPES.join(" "),
  });
}

export async function getAuthedClient(userId: string) {
  const row = await getCalendarToken(userId);

  if (!row) {
    throw new Error("Google Calendar not connected");
  }

  const client = await getOAuth2Client();
  client.setCredentials({
    access_token: decrypt(row.accessTokenEnc),
    refresh_token: decrypt(row.refreshTokenEnc),
    expiry_date: row.expiresAt.getTime(),
  });

  // Auto-refresh handler
  client.on("tokens", async (tokens) => {
    const updateValues: Parameters<typeof updateCalendarToken>[1] = {};
    if (tokens.access_token) {
      updateValues.accessTokenEnc = encrypt(tokens.access_token);
    }
    if (tokens.refresh_token) {
      updateValues.refreshTokenEnc = encrypt(tokens.refresh_token);
    }
    if (tokens.expiry_date) {
      updateValues.expiresAt = new Date(tokens.expiry_date);
    }
    await updateCalendarToken(userId, updateValues);
  });

  return { client, calendarId: row.calendarId };
}

export async function disconnect(userId: string): Promise<void> {
  const row = await getCalendarToken(userId);

  if (row) {
    try {
      const client = await getOAuth2Client();
      await client.revokeToken(decrypt(row.accessTokenEnc));
    } catch {
      // Best-effort revoke
    }
    await deleteCalendarToken(userId);
  }
}

export async function isConnected(userId: string): Promise<boolean> {
  return hasCalendarToken(userId);
}
