import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({
  defaultLocale: "ja",
  useLocale: () => "ja",
}));

import { ApiError } from "./api";
import { getApiErrorMessage } from "./api-error-message";

describe("getApiErrorMessage", () => {
  it("maps localized messages for ApiError instances", () => {
    const error = new ApiError("Forbidden", {
      status: 403,
      code: "FORBIDDEN",
      detail: "Denied by policy",
    });

    expect(getApiErrorMessage(error, "en", "fallback")).toBe(
      "You are not allowed to perform this action."
    );
  });

  it("accepts plain ApiError-shaped objects without relying on instanceof", () => {
    const error = {
      name: "ApiError",
      message: "Forbidden",
      code: "FORBIDDEN",
      detail: "Denied by policy",
      status: 403,
    };

    expect(getApiErrorMessage(error, "en", "fallback")).toBe(
      "You are not allowed to perform this action."
    );
  });

  it("falls back to detail or message when there is no localized code", () => {
    expect(
      getApiErrorMessage(
        {
          name: "ApiError",
          message: "Request failed",
          detail: "More context",
        },
        "en",
        "fallback"
      )
    ).toBe("More context");
  });
});
