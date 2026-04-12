import { vi, describe, it, expect, beforeEach } from "vitest";

// Use vi.hoisted() to create mock functions/variables available during vi.mock factory execution
const { mockRedirect, mockNext, capturedCallback } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockNext: vi.fn(),
  capturedCallback: { fn: null as ((req: unknown) => unknown) | null },
}));

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => {
      mockRedirect(...args);
      return { type: "redirect", url: args[0] };
    },
    next: (...args: unknown[]) => {
      mockNext(...args);
      return { type: "next" };
    },
  },
}));

vi.mock("@/lib/auth/helpers", () => ({
  isAdminEmail: (email: string | null | undefined) => {
    if (!email) return false;
    return email === process.env.ADMIN_EMAIL;
  },
}));

// Mock the auth module from src/auth.ts (proxy.ts imports from "./auth")
// The auth() function wraps a callback -- we capture it for testing
vi.mock("../auth", () => ({
  auth: (callback: (req: unknown) => unknown) => {
    capturedCallback.fn = callback;
    return callback;
  },
}));

// Import proxy after mocks are set up to trigger module execution
import "../proxy";

/**
 * Helper to create a mock request object matching what Auth.js passes to the callback.
 */
function makeRequest(pathname: string, auth: unknown = null) {
  return {
    nextUrl: {
      pathname,
    },
    url: "http://localhost:3000" + pathname,
    auth,
  };
}

describe("proxy.ts route protection", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockNext.mockClear();
    process.env.ADMIN_EMAIL = "admin@example.com";
  });

  function callProxy(req: ReturnType<typeof makeRequest>) {
    const fn = capturedCallback.fn;
    if (!fn) throw new Error("Proxy callback was not captured -- mock setup failed");
    return fn(req);
  }

  it("redirects unauthenticated request to /admin to /admin/login", () => {
    const req = makeRequest("/admin");
    callProxy(req);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe("/admin/login");
  });

  it("passes through unauthenticated request to /admin/login", () => {
    const req = makeRequest("/admin/login");
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes through unauthenticated request to /admin/access-denied", () => {
    const req = makeRequest("/admin/access-denied");
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects authenticated admin on /admin/login to /admin", () => {
    const req = makeRequest("/admin/login", {
      user: { email: "admin@example.com" },
    });
    callProxy(req);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe("/admin");
  });

  it("redirects authenticated non-admin on /admin to /admin/access-denied", () => {
    const req = makeRequest("/admin", {
      user: { email: "other@example.com" },
    });
    callProxy(req);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe("/admin/access-denied");
  });

  it("redirects authenticated non-admin on /admin/login to /admin/access-denied (review fix)", () => {
    const req = makeRequest("/admin/login", {
      user: { email: "other@example.com" },
    });
    callProxy(req);

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    const redirectUrl = mockRedirect.mock.calls[0][0] as URL;
    expect(redirectUrl.pathname).toBe("/admin/access-denied");
  });

  it("passes through authenticated non-admin on /admin/access-denied", () => {
    const req = makeRequest("/admin/access-denied", {
      user: { email: "other@example.com" },
    });
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes through request to /api/auth/* always", () => {
    const req = makeRequest("/api/auth/signin/google");
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes through unauthenticated request to /api/admin/health (NOT redirected)", () => {
    const req = makeRequest("/api/admin/health");
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes through authenticated non-admin request to /api/admin/health (NOT redirected)", () => {
    const req = makeRequest("/api/admin/health", {
      user: { email: "other@example.com" },
    });
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("passes through authenticated admin request to /api/admin/health", () => {
    const req = makeRequest("/api/admin/health", {
      user: { email: "admin@example.com" },
    });
    callProxy(req);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
