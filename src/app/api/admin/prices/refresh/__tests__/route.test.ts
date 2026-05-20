/**
 * Phase 23 Plan 23-01 Task 3 — POST /api/admin/prices/refresh.
 *
 * Default-run: this test is NOT env-gated and NOT skipped. It runs as
 * part of the standard `npm test` invocation. Tier-1 only per D-01 / D-11
 * (the v1.3.5 retrospective lesson — env-gated admin-route tests silently
 * skip in CI and downstream regressions surface only in production).
 *
 * Coverage (six cases):
 *   1. requireAdmin returns a 401 Response -> handler propagates unchanged
 *   2. enforceRateLimit returns a 429 Response -> propagated; rate_limited logged
 *   3. Auth+rate pass + service succeeds -> 200 { success: true, ...summary };
 *      service called once with { trigger: "manual", actorEmail }
 *   4. Auth+rate pass + service throws PriceRefreshLockedError -> 409
 *      { error: "Refresh in progress" } (NOT 5xx — D-03 UX requirement)
 *   5. Auth+rate pass + service throws generic Error -> 500
 *      { error: "Price refresh failed" }
 *   6. Successful run emits structured logEvent with actor + metadata: summary
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockRunPriceRefresh,
  mockLogEvent,
  mockLogError,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockRunPriceRefresh: vi.fn(),
  mockLogEvent: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
  };
});

vi.mock("@/lib/price-refresh", async () => {
  class PriceRefreshLockedError extends Error {
    constructor() {
      super("Price refresh already in progress");
      this.name = "PriceRefreshLockedError";
    }
  }
  return {
    runPriceRefresh: mockRunPriceRefresh,
    PriceRefreshLockedError,
  };
});

vi.mock("@/lib/logger", () => ({
  logEvent: mockLogEvent,
  logError: mockLogError,
}));

const { POST } = await import("../route");
const { PriceRefreshLockedError } = await import("@/lib/price-refresh");

const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/admin/prices/refresh", {
    method: "POST",
  });
}

const okSummary = {
  trigger: "manual" as const,
  updated: 42,
  unchanged: 50,
  failed: 1,
  skipped: 0,
  durationMs: 5678,
};

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockEnforceRateLimit.mockReset();
  mockRunPriceRefresh.mockReset();
  mockLogEvent.mockReset();
  mockLogError.mockReset();
  mockRequireAdmin.mockResolvedValue(adminSession);
  mockEnforceRateLimit.mockResolvedValue(null);
});

describe("POST /api/admin/prices/refresh", () => {
  it("Case 1: requireAdmin returns a 401 Response -> handler propagates unchanged; service never called", async () => {
    const auth401 = Response.json({ error: "Unauthorized" }, { status: 401 });
    mockRequireAdmin.mockResolvedValue(auth401);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockRunPriceRefresh).not.toHaveBeenCalled();
  });

  it("Case 2: enforceRateLimit returns a 429 Response -> propagated + rate_limited event logged", async () => {
    const limited429 = Response.json(
      { error: "Too Many Requests" },
      { status: 429 },
    );
    mockEnforceRateLimit.mockResolvedValue(limited429);

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(mockRunPriceRefresh).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "admin.price_refresh.rate_limited",
        actor: "admin@example.com",
        route: "/api/admin/prices/refresh",
      }),
    );
  });

  it("Case 3: auth+rate pass + success -> 200 with { success: true, ...summary }; service called with { trigger: 'manual', actorEmail }", async () => {
    mockRunPriceRefresh.mockResolvedValue(okSummary);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      ...okSummary,
    });
    expect(mockRunPriceRefresh).toHaveBeenCalledTimes(1);
    expect(mockRunPriceRefresh).toHaveBeenCalledWith({
      trigger: "manual",
      actorEmail: "admin@example.com",
    });
  });

  it("Case 4: auth+rate pass + PriceRefreshLockedError -> 409 { error: 'Refresh in progress' } (D-03 UX requirement)", async () => {
    mockRunPriceRefresh.mockRejectedValue(new PriceRefreshLockedError());

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Refresh in progress",
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "admin.price_refresh.locked" }),
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("Case 5: auth+rate pass + generic Error -> 500 { error: 'Price refresh failed' }", async () => {
    mockRunPriceRefresh.mockRejectedValue(new Error("DB exploded"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Price refresh failed",
    });
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "admin.price_refresh.failed",
        actor: "admin@example.com",
      }),
    );
  });

  it("Case 6: successful run emits structured logEvent with actor + metadata: summary", async () => {
    mockRunPriceRefresh.mockResolvedValue(okSummary);

    await POST(makeRequest());

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "admin.price_refresh.succeeded",
        actor: "admin@example.com",
        metadata: okSummary,
      }),
    );
  });
});
