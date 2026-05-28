import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockEnforceRateLimit,
  mockGetManaBoxRemovalReport,
  mockMarkManaBoxItemsRemoved,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetManaBoxRemovalReport: vi.fn(),
  mockMarkManaBoxItemsRemoved: vi.fn(),
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
vi.mock("@/db/manabox-removals", () => ({
  getManaBoxRemovalReport: mockGetManaBoxRemovalReport,
  markManaBoxItemsRemoved: mockMarkManaBoxItemsRemoved,
}));

import { GET, POST } from "../route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

const report = {
  generatedAt: "2026-05-26T15:00:00.000Z",
  rows: [
    {
      key: "pmei-2024|5|foil|near_mint",
      name: "Diabolic Edict",
      setCode: "pmei-2024",
      setName: "Pioneer Masters 2024",
      collectorNumber: "5",
      finish: "foil",
      condition: "near_mint",
      quantity: 3,
      totalValue: 3.25,
      orderRefs: ["ORD-1"],
      orderItemIds: [10, 11],
      binders: ["trade_box"],
      boxBreakdown: [
        {
          box: "trade_box",
          quantity: 3,
          orderRefs: ["ORD-1"],
          orderItemIds: [10, 11],
        },
      ],
      statuses: ["confirmed"],
      firstSoldAt: "2026-05-26T12:00:00.000Z",
      lastSoldAt: "2026-05-26T13:00:00.000Z",
      imageUrl: "https://example.com/edict.jpg",
    },
  ],
  totalRows: 1,
  totalQuantity: 3,
  totalValue: 3.25,
  orderCount: 1,
  lastMarkedAt: null,
  lastMarkedBy: null,
};

function makePostRequest(body?: unknown) {
  return new Request("http://localhost:3000/api/admin/manabox-removals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/admin/manabox-removals", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetManaBoxRemovalReport.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("returns the current unmarked ManaBox removal report as JSON", async () => {
    mockGetManaBoxRemovalReport.mockResolvedValue(report);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ report });
    expect(mockGetManaBoxRemovalReport).toHaveBeenCalledTimes(1);
  });

  it("does not expose a CSV attachment from the visual-report API", async () => {
    mockGetManaBoxRemovalReport.mockResolvedValue(report);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.json()).toEqual({ report });
  });

  it("returns 401 when requireAdmin rejects the request", async () => {
    mockRequireAdmin.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetManaBoxRemovalReport).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/manabox-removals", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockEnforceRateLimit.mockReset();
    mockMarkManaBoxItemsRemoved.mockReset();
    mockGetManaBoxRemovalReport.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("marks selected order items as removed from ManaBox and returns a refreshed report", async () => {
    const markResult = {
      requestedItemIds: [10, 11],
      markedItemIds: [10, 11],
      skippedItemIds: [],
      markedRows: 2,
      markedQuantity: 3,
      markedAt: "2026-05-26T15:30:00.000Z",
    };
    mockMarkManaBoxItemsRemoved.mockResolvedValue(markResult);
    mockGetManaBoxRemovalReport.mockResolvedValue({ ...report, rows: [], totalRows: 0, totalQuantity: 0 });

    const response = await POST(makePostRequest({ orderItemIds: [10, 11] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      result: markResult,
      report: { ...report, rows: [], totalRows: 0, totalQuantity: 0 },
    });
    expect(mockMarkManaBoxItemsRemoved).toHaveBeenCalledWith({
      orderItemIds: [10, 11],
      audit: { actorEmail: "admin@example.com" },
    });
  });

  it("rejects missing orderItemIds", async () => {
    const response = await POST(makePostRequest({ orderItemIds: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "orderItemIds must be a non-empty array of order item ids",
    });
    expect(mockMarkManaBoxItemsRemoved).not.toHaveBeenCalled();
  });

  it("honors the admin mutation rate limit", async () => {
    mockEnforceRateLimit.mockResolvedValue(Response.json({ error: "Too many requests" }, { status: 429 }));

    const response = await POST(makePostRequest({ orderItemIds: [10] }));

    expect(response.status).toBe(429);
    expect(mockMarkManaBoxItemsRemoved).not.toHaveBeenCalled();
  });
});
