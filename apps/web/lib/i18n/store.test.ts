import { beforeEach, describe, expect, it } from "vitest";

import { defaultLocale } from "./messages";
import { normalizeLocale, useI18nStore } from "./store";
import { translate } from "./translate";

describe("i18n locale normalization", () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: defaultLocale });
  });

  it("maps browser locales to supported locales", () => {
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeLocale("ko-KR")).toBe("ko");
  });

  it("falls back to the default locale for unknown or empty values", () => {
    expect(normalizeLocale("fr-FR")).toBe(defaultLocale);
    expect(normalizeLocale("")).toBe(defaultLocale);
    expect(normalizeLocale(null)).toBe(defaultLocale);
    expect(normalizeLocale(undefined)).toBe(defaultLocale);
  });
});

describe("i18n translations", () => {
  it("falls back to the default locale dictionary when a locale is unsupported", () => {
    expect(translate("en", "common.nav.settings")).toBe("Settings");
    expect(translate("ja", "common.nav.settings")).toBe("設定");
  });

  it("falls back to the key when a message is missing", () => {
    expect(translate("en", "missing.translation.key")).toBe("missing.translation.key");
  });
});
