/**
 * Phase 23 Plan 23-01 Task 3 — GET /api/cron/refresh-prices.
 *
 * Default-run: this test is NOT env-gated and NOT skipped. It runs as
 * part of the standard `npm test` invocation. Tier-1 only per D-01 / D-11
 * (the v1.3.5 retrospective lesson — env-gated cron-handler tests silently
 * skip in CI and the next prod incident is the first observation point).
 *
 * Coverage (seven cases):
 *   1. Missing Authorization header -> 401
 *   2. Wrong Bearer value -> 401
 *   3. CRON_SECRET env unset -> 401 even with a header (fail-closed D-12)
 *   4. Valid Bearer + success -> 200 with ok:true + summary; service called
 *      once with { trigger: "cron" }
 *   5. Valid Bearer + PriceRefreshLockedError -> 200 with { ok:false, reason:"locked" }
 *   6. Valid Bearer + generic Error -> 500 with { ok:false, error:"Refresh failed" }
 *   7. Auth header value and CRON_SECRET value are never passed to the logger
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunPriceRefresh, mockLogEvent, mockLogError } = vi.hoisted(() => ({
  mockRunPriceRefresh: vi.fn(),
  mockLogEvent: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/price-refresh", async () => {
  // Re-export the real `PriceRefreshLockedError` class so `err instanceof`
  // checks in the handler still match instances thrown from the mock.
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

const { GET } = await import("../route");
const { PriceRefreshLockedError } = await import("@/lib/price-refresh");

const SECRET = "test-secret-value-do-not-leak";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/cron/refresh-prices", {
    method: "GET",
    headers,
  });
}

const okSummary = {
  trigger: "cron" as const,
  updated: 12,
  unchanged: 100,
  failed: 1,
  skipped: 0,
  durationMs: 1234,
};

beforeEach(() => {
  mockRunPriceRefresh.mockReset();
  mockLogEvent.mockReset();
  mockLogError.mockReset();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/refresh-prices", () => {
  it("Case 1: missing Authorization header -> 401", async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockRunPriceRefresh).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cron.refresh_prices.unauthorized",
        route: "/api/cron/refresh-prices",
      }),
    );
  });

  it("Case 2: wrong Bearer value -> 401", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(401);
    expect(mockRunPriceRefresh).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cron.refresh_prices.unauthorized" }),
    );
  });

  it("Case 3: CRON_SECRET env unset -> 401 even with a header (fail-closed per D-12)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeRequest({ authorization: "Bearer anything" }));

    expect(res.status).toBe(401);
    expect(mockRunPriceRefresh).not.toHaveBeenCalled();
  });

  it("Case 4: valid Bearer + success -> 200 with ok:true + summary; service called once with trigger: cron", async () => {
    mockRunPriceRefresh.mockResolvedValue(okSummary);

    const res = await GET(makeRequest({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, ...okSummary });
    expect(mockRunPriceRefresh).toHaveBeenCalledTimes(1);
    expect(mockRunPriceRefresh).toHaveBeenCalledWith({ trigger: "cron" });
  });

  it("Case 5: valid Bearer + PriceRefreshLockedError -> 200 with { ok: false, reason: 'locked' } (quiet)", async () => {
    mockRunPriceRefresh.mockRejectedValue(new PriceRefreshLockedError());

    const res = await GET(makeRequest({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      reason: "locked",
    });
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cron.refresh_prices.locked" }),
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("Case 6: valid Bearer + generic Error -> 500 with { ok: false, error: 'Refresh failed' }", async () => {
    mockRunPriceRefresh.mockRejectedValue(new Error("boom"));

    const res = await GET(makeRequest({ authorization: `Bearer ${SECRET}` }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Refresh failed",
    });
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cron.refresh_prices.failed" }),
    );
  });

  it("Case 7: auth header value and CRON_SECRET value are never passed to the logger", async () => {
    await GET(makeRequest({ authorization: `Bearer ${SECRET}` }));
    mockRunPriceRefresh.mockResolvedValue(okSummary);

    // Probe both 401 path (bad header) and success path (good header) to
    // ensure neither branch leaks the secret into logger args.
    const wrongBearer = "Bearer DEFINITELY_NOT_THE_SECRET";
    await GET(makeRequest({ authorization: wrongBearer }));
    await GET(makeRequest({ authorization: `Bearer ${SECRET}` }));

    const allLoggerArgs = JSON.stringify([
      ...mockLogEvent.mock.calls,
      ...mockLogError.mock.calls,
    ]);
    expect(allLoggerArgs).not.toContain(SECRET);
    expect(allLoggerArgs).not.toContain("DEFINITELY_NOT_THE_SECRET");
    expect(allLoggerArgs).not.toContain(wrongBearer);
  });
});
