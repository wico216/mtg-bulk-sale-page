import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockDeleteCardsByIds, mockDeleteAllCards, mockEnforceRateLimit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockDeleteCardsByIds: vi.fn(),
    mockDeleteAllCards: vi.fn(),
    mockEnforceRateLimit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/db/queries", () => ({
  deleteCardsByIds: mockDeleteCardsByIds,
  deleteAllCards: mockDeleteAllCards,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
  };
});

import { POST } from "../bulk-delete/route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/cards/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(body: string): Request {
  return new Request("http://localhost:3000/api/admin/cards/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/admin/cards/bulk-delete", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDeleteCardsByIds.mockReset();
    mockDeleteAllCards.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("deletes selected cards and never calls delete-all inventory", async () => {
    mockDeleteCardsByIds.mockResolvedValue({
      deleted: 2,
      ids: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
    });

    const response = await POST(
      makeRequest({
        ids: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      deleted: 2,
      ids: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
    });
    expect(mockDeleteCardsByIds).toHaveBeenCalledWith([
      "lea-232-normal-near_mint",
      "mh2-45-normal-lightly_played",
    ], { actorEmail: "admin@example.com" });
    expect(mockDeleteAllCards).not.toHaveBeenCalled();
  });

  it("de-dupes IDs before calling the helper", async () => {
    mockDeleteCardsByIds.mockResolvedValue({
      deleted: 1,
      ids: ["lea-232-normal-near_mint"],
    });

    await POST(
      makeRequest({
        ids: ["lea-232-normal-near_mint", "lea-232-normal-near_mint"],
      }),
    );

    expect(mockDeleteCardsByIds).toHaveBeenCalledWith([
      "lea-232-normal-near_mint",
    ], { actorEmail: "admin@example.com" });
  });

  it.each([
    ["missing ids", {}],
    ["empty ids", { ids: [] }],
    ["non-array ids", { ids: "lea-232-normal-near_mint" }],
    ["non-string ids", { ids: ["lea-232-normal-near_mint", 42] }],
    ["blank ids", { ids: ["lea-232-normal-near_mint", ""] }],
    ["too many ids", { ids: Array.from({ length: 501 }, (_, index) => `card-${index}`) }],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
    expect(mockDeleteAllCards).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(makeRawRequest("not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(makeRequest({ ids: ["lea-232-normal-near_mint"] }));

    expect(response.status).toBe(401);
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
  });

  it("returns 403 when requireAdmin returns a 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(makeRequest({ ids: ["lea-232-normal-near_mint"] }));

    expect(response.status).toBe(403);
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
  });

  it("returns 500 with unchanged-inventory copy when deletion fails", async () => {
    mockDeleteCardsByIds.mockRejectedValue(new Error("DB is down"));

    const response = await POST(makeRequest({ ids: ["lea-232-normal-near_mint"] }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Bulk delete failed — inventory unchanged",
    });
  });

  it("returns 429 and does not call deleteCardsByIds when rate-limited", async () => {
    mockEnforceRateLimit.mockResolvedValueOnce(
      Response.json(
        { error: "rate_limited", code: "rate_limited", retryAfterSeconds: 30 },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );

    const response = await POST(makeRequest({ ids: ["lea-232-normal-near_mint"] }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
  });

  it("rate-limit runs AFTER auth so an unauthenticated caller still sees 401, not 429", async () => {
    // If auth fails, the route must return the auth status -- rate-limit
    // tarpitting must not hide an auth bug behind a 429.
    mockRequireAdmin.mockResolvedValueOnce(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(makeRequest({ ids: ["lea-232-normal-near_mint"] }));

    expect(response.status).toBe(401);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockDeleteCardsByIds).not.toHaveBeenCalled();
  });
});
