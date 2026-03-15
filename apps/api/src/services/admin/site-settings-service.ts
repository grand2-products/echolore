import { getSiteSetting, upsertSiteSetting } from "../../repositories/admin/admin-repository.js";

export async function getSiteSettings() {
  const [
    title,
    tagline,
    meetingSimulcast,
    meetingDynacast,
    meetingAdaptiveStream,
    coworkingSimulcast,
    coworkingDynacast,
    coworkingAdaptiveStream,
    coworkingMode,
    coworkingMcuWidth,
    coworkingMcuHeight,
    coworkingMcuFps,
    coworkingFocusIdentity,
    siteIconPath,
    googleClientId,
    googleClientSecret,
  ] = await Promise.all([
    getSiteSetting("siteTitle"),
    getSiteSetting("siteTagline"),
    getSiteSetting("livekitMeetingSimulcast"),
    getSiteSetting("livekitMeetingDynacast"),
    getSiteSetting("livekitMeetingAdaptiveStream"),
    getSiteSetting("livekitCoworkingSimulcast"),
    getSiteSetting("livekitCoworkingDynacast"),
    getSiteSetting("livekitCoworkingAdaptiveStream"),
    getSiteSetting("livekitCoworkingMode"),
    getSiteSetting("livekitCoworkingMcuWidth"),
    getSiteSetting("livekitCoworkingMcuHeight"),
    getSiteSetting("livekitCoworkingMcuFps"),
    getSiteSetting("livekitCoworkingFocusIdentity"),
    getSiteSetting("siteIconStoragePath"),
    getSiteSetting("authGoogleClientId"),
    getSiteSetting("authGoogleClientSecret"),
  ]);
  return {
    siteTitle: title?.value ?? null,
    siteTagline: tagline?.value ?? null,
    livekitMeetingSimulcast: meetingSimulcast?.value !== "false",
    livekitMeetingDynacast: meetingDynacast?.value !== "false",
    livekitMeetingAdaptiveStream: meetingAdaptiveStream?.value !== "false",
    livekitCoworkingSimulcast: coworkingSimulcast?.value !== "false",
    livekitCoworkingDynacast: coworkingDynacast?.value !== "false",
    livekitCoworkingAdaptiveStream: coworkingAdaptiveStream?.value !== "false",
    livekitCoworkingMode: (coworkingMode?.value as "sfu" | "mcu") ?? "sfu",
    livekitCoworkingMcuWidth: coworkingMcuWidth?.value ? Number(coworkingMcuWidth.value) : 1280,
    livekitCoworkingMcuHeight: coworkingMcuHeight?.value ? Number(coworkingMcuHeight.value) : 720,
    livekitCoworkingMcuFps: coworkingMcuFps?.value ? Number(coworkingMcuFps.value) : 15,
    livekitCoworkingFocusIdentity: coworkingFocusIdentity?.value ?? null,
    hasSiteIcon: Boolean(siteIconPath?.value),
    googleOAuthEnabled: Boolean(googleClientId?.value && googleClientSecret?.value),
  };
}

export async function updateSiteSettings(input: {
  siteTitle?: string;
  siteTagline?: string;
  livekitMeetingSimulcast?: boolean;
  livekitMeetingDynacast?: boolean;
  livekitMeetingAdaptiveStream?: boolean;
  livekitCoworkingSimulcast?: boolean;
  livekitCoworkingDynacast?: boolean;
  livekitCoworkingAdaptiveStream?: boolean;
  livekitCoworkingMode?: "sfu" | "mcu";
  livekitCoworkingMcuWidth?: number;
  livekitCoworkingMcuHeight?: number;
  livekitCoworkingMcuFps?: number;
  livekitCoworkingFocusIdentity?: string | null;
}) {
  const results: Record<string, string | boolean | number> = {};
  if (input.siteTitle !== undefined) {
    await upsertSiteSetting("siteTitle", input.siteTitle);
    results.siteTitle = input.siteTitle;
  }
  if (input.siteTagline !== undefined) {
    await upsertSiteSetting("siteTagline", input.siteTagline);
    results.siteTagline = input.siteTagline;
  }
  const boolKeys = [
    "livekitMeetingSimulcast",
    "livekitMeetingDynacast",
    "livekitMeetingAdaptiveStream",
    "livekitCoworkingSimulcast",
    "livekitCoworkingDynacast",
    "livekitCoworkingAdaptiveStream",
  ] as const;
  for (const key of boolKeys) {
    const val = input[key];
    if (val !== undefined) {
      await upsertSiteSetting(key, String(val));
      results[key] = val;
    }
  }
  if (input.livekitCoworkingMode !== undefined) {
    await upsertSiteSetting("livekitCoworkingMode", input.livekitCoworkingMode);
    results.livekitCoworkingMode = input.livekitCoworkingMode;
  }
  const numKeys = [
    "livekitCoworkingMcuWidth",
    "livekitCoworkingMcuHeight",
    "livekitCoworkingMcuFps",
  ] as const;
  for (const key of numKeys) {
    const val = input[key];
    if (val !== undefined) {
      await upsertSiteSetting(key, String(val));
      results[key] = val;
    }
  }
  if (input.livekitCoworkingFocusIdentity !== undefined) {
    const value = input.livekitCoworkingFocusIdentity ?? "";
    await upsertSiteSetting("livekitCoworkingFocusIdentity", value);
    results.livekitCoworkingFocusIdentity = value;
  }
  return results;
}
