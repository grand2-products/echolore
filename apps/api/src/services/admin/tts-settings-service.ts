import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export type TtsProvider = "google-cloud" | "gemini";

export interface TtsSettings {
  provider: TtsProvider;
  geminiApiKey: string | null;
  geminiModel: string | null;
  geminiVoiceName: string | null;
}

const cache = createTypedSettingsService(
  {
    provider: field("ttsProvider", FieldCodecs.withDefault<TtsProvider>("google-cloud")),
    geminiApiKey: field("ttsGeminiApiKey", FieldCodecs.nullableClearable),
    geminiModel: field("ttsGeminiModel", FieldCodecs.nullableClearable),
    geminiVoiceName: field("ttsGeminiVoiceName", FieldCodecs.nullableClearable),
  },
  { encryptedKeys: ["ttsGeminiApiKey"] }
);

export const getTtsSettings = cache.get;
export const updateTtsSettings = cache.update;
