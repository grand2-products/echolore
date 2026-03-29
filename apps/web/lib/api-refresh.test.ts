import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We need to test the internal functions `shouldAttemptSilentRefresh`,
// `refreshPasswordSession`, and `executeApiRequest`.  They are not exported,
// so we re-import the module after wiring up `fetch` and env vars so the
// module-level `API_BASE` resolves correctly.
// ---------------------------------------------------------------------------

const API_BASE = "http://localhost:3001/api";

// Stub process.env before the module is loaded
vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);

// We need to mock @tanstack/react-query so the module can be imported in a
// non-React test environment (it is imported at module scope in api.ts).
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Because `shouldAttemptSilentRefresh`, `refreshPasswordSession`, and
// `executeApiRequest` are module-private, we extract them by reading the
// source and re-evaluating isolated copies.  This is brittle, so instead we
// test them indirectly through the exported `fetchApi` (which calls
// executeApiRequest -> shouldAttemptSilentRefresh / refreshPasswordSession).
//
// For the pure-logic function `shouldAttemptSilentRefresh` we duplicate the
// small function here so we can unit-test it directly without exporting it
// from production code.
// ---------------------------------------------------------------------------

/** Exact copy of the production function for unit-testing purposes. */
function shouldAttemptSilentRefresh(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath.startsWith("/auth/")) {
    return true;
  }
  return normalizedPath === "/auth/me";
}

// ---------------------------------------------------------------------------
// shouldAttemptSilentRefresh – pure logic tests
// ---------------------------------------------------------------------------

describe("shouldAttemptSilentRefresh", () => {
  it("returns true for non-auth paths", () => {
    expect(shouldAttemptSilentRefresh("/wiki")).toBe(true);
    expect(shouldAttemptSilentRefresh("/users")).toBe(true);
    expect(shouldAttemptSilentRefresh("/meetings/abc")).toBe(true);
    expect(shouldAttemptSilentRefresh("wiki")).toBe(true);
  });

  it("returns true for /auth/me", () => {
    expect(shouldAttemptSilentRefresh("/auth/me")).toBe(true);
  });

  it("returns false for other /auth/* paths", () => {
    expect(shouldAttemptSilentRefresh("/auth/token")).toBe(false);
    expect(shouldAttemptSilentRefresh("/auth/register")).toBe(false);
    expect(shouldAttemptSilentRefresh("/auth/token/google")).toBe(false);
    expect(shouldAttemptSilentRefresh("/auth/verify-email")).toBe(false);
    expect(shouldAttemptSilentRefresh("auth/token")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests exercising fetchApi → executeApiRequest with a
// mocked global `fetch`.
// ---------------------------------------------------------------------------

// We dynamically import `fetchApi` so that our env stubs are in place.
let fetchApi: typeof import("./api").fetchApi;

beforeEach(async () => {
  // Reset module registry so each test gets a fresh `refreshSessionPromise`
  vi.resetModules();
  const mod = await import("./api");
  fetchApi = mod.fetchApi;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Helper to create a minimal Response-like object. */
function fakeResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: String(status),
    type: "basic" as ResponseType,
    url: "",
    clone: () => fakeResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

describe("executeApiRequest silent-refresh integration", () => {
  it("retries the original request after a successful refresh", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

    // 1st call: original /wiki request → 401
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized" }));
    // 2nd call: Auth.js session check → returns valid session
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { user: { id: "u1" } }));
    // 3rd call: retried /wiki request → 200
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { pages: [] }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchApi<{ pages: unknown[] }>("/wiki");

    expect(result).toEqual({ pages: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // First call is the original request
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/wiki`);
    // Second call is the session check
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API_BASE}/auth/session`);
    // Third call is the retry
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${API_BASE}/wiki`);
  });

  it("does NOT retry when the Auth.js session check returns no user", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

    // 1st call: original /wiki request → 401
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized" }));
    // 2nd call: Auth.js session check → no user
    fetchMock.mockResolvedValueOnce(fakeResponse(200, {}));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/wiki")).rejects.toThrow();

    // original + session check = 2 calls, no retry of /wiki
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("concurrent 401s share a single refresh promise (deduplication)", async () => {
    let sessionCallCount = 0;
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) {
        sessionCallCount++;
        // Simulate slight network delay
        await new Promise((r) => setTimeout(r, 10));
        return fakeResponse(200, { user: { id: "u1" } });
      }
      if (url.endsWith("/wiki") || url.endsWith("/users")) {
        // First call for each endpoint returns 401, subsequent calls succeed
        const callsForUrl = fetchMock.mock.calls.filter((c) => String(c[0]) === url).length;
        if (callsForUrl <= 1) {
          return fakeResponse(401, { error: "Unauthorized" });
        }
        return fakeResponse(200, { data: url });
      }
      return fakeResponse(404);
    });

    vi.stubGlobal("fetch", fetchMock);

    // Fire two requests concurrently that both get 401
    const [r1, r2] = await Promise.all([
      fetchApi<{ data: string }>("/wiki"),
      fetchApi<{ data: string }>("/users"),
    ]);

    expect(r1).toEqual({ data: `${API_BASE}/wiki` });
    expect(r2).toEqual({ data: `${API_BASE}/users` });

    // The session endpoint should only have been called once (deduplication)
    expect(sessionCallCount).toBe(1);
  });

  it("does not retry more than once (no infinite loop)", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

    // 1st call: original → 401
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized" }));
    // 2nd call: session check → valid
    fetchMock.mockResolvedValueOnce(fakeResponse(200, { user: { id: "u1" } }));
    // 3rd call: retried original → still 401 (server keeps rejecting)
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized" }));

    vi.stubGlobal("fetch", fetchMock);

    // Should throw after the retry also gets 401, without attempting a second refresh
    await expect(fetchApi("/wiki")).rejects.toThrow();

    // Exactly 3 calls: original, session check, one retry. No further refresh attempts.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not attempt refresh for /auth/token (non-refreshable auth path)", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

    // The only call: /auth/token → 401
    fetchMock.mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized" }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("/auth/token")).rejects.toThrow();

    // Only the original request, no refresh attempt at all
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
