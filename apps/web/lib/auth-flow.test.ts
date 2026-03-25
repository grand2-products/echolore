import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getGoogleSignInAction returns Auth.js signin URL", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", { querySelector: () => null });

    const { getGoogleSignInAction } = await import("./auth-flow");
    const action = getGoogleSignInAction();

    expect(action).toContain("/api/auth/signin/google");
  });

  it("fetchCsrfToken fetches from Auth.js csrf endpoint", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", { querySelector: () => null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ csrfToken: "test-token" }),
      })
    );

    const { fetchCsrfToken } = await import("./auth-flow");
    const token = await fetchCsrfToken();

    expect(token).toBe("test-token");
  });

  it("logoutCurrentUser submits a POST form with CSRF token", async () => {
    const submittedForms: HTMLFormElement[] = [];

    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", {
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
      body: { appendChild: () => {} },
      querySelector: () => null,
    });
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
