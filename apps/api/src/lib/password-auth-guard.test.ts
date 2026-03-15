import { describe, expect, it } from "vitest";
import { getRequestIp } from "./password-auth-guard.js";

function makeHeaders(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe("getRequestIp", () => {
  it("extracts the first IP from x-forwarded-for", () => {
    const headers = makeHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getRequestIp(headers)).toBe("1.2.3.4");
  });

  it("returns a single x-forwarded-for IP", () => {
    const headers = makeHeaders({ "x-forwarded-for": "10.0.0.1" });
    expect(getRequestIp(headers)).toBe("10.0.0.1");
  });

  it("trims whitespace from x-forwarded-for", () => {
    const headers = makeHeaders({ "x-forwarded-for": "  192.168.1.1 , 10.0.0.1" });
    expect(getRequestIp(headers)).toBe("192.168.1.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const headers = makeHeaders({ "x-real-ip": "172.16.0.1" });
    expect(getRequestIp(headers)).toBe("172.16.0.1");
  });

  it("returns null when no IP headers are present", () => {
    const headers = makeHeaders({});
    expect(getRequestIp(headers)).toBeNull();
  });

  it("falls back to x-real-ip when x-forwarded-for is empty", () => {
    const headers = makeHeaders({ "x-forwarded-for": "", "x-real-ip": "10.10.10.10" });
    expect(getRequestIp(headers)).toBe("10.10.10.10");
  });
});
