import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret-for-vitest-32chars!");

const { createSignedAccessToken, parseSignedAccessToken } = await import("./token-service.js");

const TEST_SECRET = "test-session-secret-for-vitest-32chars!";

function signBody(body: string) {
  return createHmac("sha256", TEST_SECRET).update(body).digest("base64url");
}

describe("token-service", () => {
  describe("createSignedAccessToken / parseSignedAccessToken", () => {
    it("round-trips a valid payload", () => {
      const payload = {
        sub: "user_1",
        ver: 1,
        am: "password" as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = createSignedAccessToken(payload);
      const parsed = parseSignedAccessToken(token);

      expect(parsed).toEqual(payload);
    });

    it("returns null for a tampered token", () => {
      const payload = {
        sub: "user_1",
        ver: 1,
        am: "password" as const,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = createSignedAccessToken(payload);
      const [body, sig] = token.split(".");
      const tampered = `${body}x.${sig}`;
      expect(parseSignedAccessToken(tampered)).toBeNull();
    });

    it("returns null for an expired token", () => {
      const payload = {
        sub: "user_1",
        ver: 1,
        am: "sso" as const,
        exp: Math.floor(Date.now() / 1000) - 10,
      };

      const token = createSignedAccessToken(payload);
      expect(parseSignedAccessToken(token)).toBeNull();
    });

    it("returns null for a malformed token", () => {
      expect(parseSignedAccessToken("")).toBeNull();
      expect(parseSignedAccessToken("not-a-token")).toBeNull();
      expect(parseSignedAccessToken("a.b.c")).toBeNull();
    });

    it("returns null for invalid auth mode", () => {
      const body = Buffer.from(
        JSON.stringify({
          sub: "u",
          ver: 1,
          am: "invalid",
          exp: Math.floor(Date.now() / 1000) + 3600,
        })
      ).toString("base64url");

      const signature = signBody(body);
      expect(parseSignedAccessToken(`${body}.${signature}`)).toBeNull();
    });

    it("returns null when required fields are missing", () => {
      const body = Buffer.from(
        JSON.stringify({ ver: 1, am: "password", exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString("base64url");

      const signature = signBody(body);
      expect(parseSignedAccessToken(`${body}.${signature}`)).toBeNull();
    });
  });
});
