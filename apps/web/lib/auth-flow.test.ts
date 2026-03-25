import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a POST form with CSRF token on logout", async () => {
    // Track forms appended to the body
    const submittedForms: HTMLFormElement[] = [];

    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });

    vi.stubGlobal(
      "document",
      (() => {
        const doc = {
          createElement: (tag: string) => {
            const el: Record<string, unknown> = {
              tagName: tag,
              children: [] as unknown[],
              style: {} as Record<string, string>,
            };
            el.appendChild = (child: unknown) => (el.children as unknown[]).push(child);
            if (tag === "form") {
              el.submit = () => submittedForms.push(el as unknown as HTMLFormElement);
            }
            return el;
          },
          body: {
            appendChild: () => {},
          },
          querySelector: () => null,
        };
        return doc;
      })()
    );

    // Mock fetch to return a CSRF token
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ csrfToken: "test-token" }),
      })
    );

    const { logoutCurrentUser } = await import("./auth-flow");
    await logoutCurrentUser();

    expect(submittedForms).toHaveLength(1);
    const form = submittedForms[0] as unknown as Record<string, unknown>;
    expect(form.method).toBe("POST");
    expect(form.action).toEqual(expect.stringContaining("/api/auth/signout"));

    const children = form.children as Array<Record<string, unknown>>;
    const csrfInput = children.find((c) => c.name === "csrfToken");
    expect(csrfInput).toBeDefined();
    expect(csrfInput?.value).toBe("test-token");
  });
});
