import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSiteSettingMock, upsertSiteSettingMock } = vi.hoisted(() => ({
  getSiteSettingMock: vi.fn(),
  upsertSiteSettingMock: vi.fn(),
}));

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  getSiteSetting: getSiteSettingMock,
  upsertSiteSetting: upsertSiteSettingMock,
}));

import { updateTtsSettings } from "./tts-settings-service.js";

describe("tts-settings-service", () => {
  beforeEach(() => {
    getSiteSettingMock.mockReset();
    upsertSiteSettingMock.mockReset();
    getSiteSettingMock.mockResolvedValue(null);
    upsertSiteSettingMock.mockImplementation(async (key: string, value: string) => ({
      key,
      value,
      updatedAt: new Date(),
    }));
  });

  it("persists empty values when clearing nullable Gemini settings", async () => {
    await updateTtsSettings({
      geminiApiKey: null,
      geminiModel: null,
      geminiVoiceName: null,
    });

    expect(upsertSiteSettingMock).toHaveBeenCalledWith("ttsGeminiApiKey", "");
    expect(upsertSiteSettingMock).toHaveBeenCalledWith("ttsGeminiModel", "");
    expect(upsertSiteSettingMock).toHaveBeenCalledWith("ttsGeminiVoiceName", "");
  });
});
