import { Hono } from "hono";
import {
  GEMINI_TTS_VOICES,
  GeminiTextToSpeechGateway,
} from "../../ai/gateway/gemini/gemini-text-to-speech-gateway.js";
import { jsonError } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import type { TtsSettings } from "../../services/admin/tts-settings-service.js";
import { getTtsSettings, updateTtsSettings } from "../../services/admin/tts-settings-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateTtsSettingsSchema } from "./schemas.js";

const settingsRoutes = createAdminSettingsRoutes<TtsSettings>({
  path: "tts-settings",
  secretFields: ["geminiApiKey"],
  getSettings: getTtsSettings,
  updateSettings: updateTtsSettings,
  validationSchema: updateTtsSettingsSchema,
  errorPrefix: "ADMIN_TTS_SETTINGS",
  label: "TTS settings",
});

export const adminTtsSettingsRoutes = new Hono<AppEnv>();
adminTtsSettingsRoutes.route("/", settingsRoutes);

adminTtsSettingsRoutes.post("/tts-settings/test", async (c) => {
  try {
    const settings = await getTtsSettings();

    if (settings.provider === "gemini") {
      if (!settings.geminiApiKey) {
        return c.json({ ok: false, error: "Gemini API key is not configured." }, 400);
      }
      const gateway = new GeminiTextToSpeechGateway({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel || undefined,
        voiceName: settings.geminiVoiceName || undefined,
      });
      const result = await gateway.synthesize({
        text: "Hello, this is a test.",
        languageCode: "en-US",
      });
      return c.json({
        ok: true,
        provider: "gemini",
        voiceName: settings.geminiVoiceName || "Kore",
        audioSizeBytes: result.audio.length,
      });
    }

    const { GoogleTextToSpeechGateway } = await import(
      "../../ai/gateway/google/google-text-to-speech-gateway.js"
    );
    const gateway = new GoogleTextToSpeechGateway();
    const result = await gateway.synthesize({
      text: "Hello, this is a test.",
      languageCode: "en-US",
    });
    return c.json({
      ok: true,
      provider: "google-cloud",
      audioSizeBytes: result.audio.length,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return jsonError(c, 502, "TTS_TEST_FAILED", "TTS connection test failed", detail);
  }
});

adminTtsSettingsRoutes.get("/tts-settings/gemini-voices", async (c) => {
  return c.json({ voices: GEMINI_TTS_VOICES });
});
