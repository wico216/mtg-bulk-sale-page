import { vi, describe, it, expect, beforeEach } from "vitest";

// Use vi.hoisted() pattern for mock variables (established in Phase 8)
const {
  mockRequireAdmin,
  mockGetAdminCards,
  mockUpdateCard,
  mockDeleteCard,
  mockDeleteAllCards,
  mockEnforceRateLimit,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminCards: vi.fn(),
  mockUpdateCard: vi.fn(),
  mockDeleteCard: vi.fn(),
  mockDeleteAllCards: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
}));

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock auth module
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));

// Mock query functions
vi.mock("@/db/queries", () => ({
  getAdminCards: mockGetAdminCards,
  updateCard: mockUpdateCard,
  deleteCard: mockDeleteCard,
  deleteAllCards: mockDeleteAllCards,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
  };
});

import { GET, DELETE as DELETE_ALL } from "../route";
import { PATCH, DELETE } from "../[id]/route";

// Helper to create a Request for GET with query params
function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/admin/cards");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

// Helper to create a Request for PATCH/DELETE with JSON body
function makePatchRequest(
  id: string,
  body: Record<string, unknown>,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makeDeleteRequest(
  id: string,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/cards/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function makeDeleteAllRequest(): Request {
  return new Request("http://localhost:3000/api/admin/cards", {
    method: "DELETE",
  });
}

// Admin session fixture
const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

describe("GET /api/admin/cards", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetAdminCards.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("returns paginated response shape", async () => {
    const mockResult = {
      cards: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    };
    mockGetAdminCards.mockResolvedValue(mockResult);

    const response = await GET(makeGetRequest());
    const data = await response.json();

    expect(data).toEqual(mockResult);
  });

  it("passes query params to getAdminCards", async () => {
    mockGetAdminCards.mockResolvedValue({
      cards: [],
      total: 0,
      page: 2,
      limit: 25,
      totalPages: 0,
    });

    await GET(
      makeGetRequest({
        page: "2",
        limit: "25",
        search: "avacyn",
        set: "sld",
        condition: "near_mint",
        sortBy: "price",
        sortDir: "desc",
      }),
    );

    expect(mockGetAdminCards).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      search: "avacyn",
      set: "sld",
      condition: "near_mint",
      sortBy: "price",
      sortDir: "desc",
    });
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(401);
  });

  it("returns 403 when requireAdmin returns 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(403);
  });

  it("returns 500 JSON when getAdminCards throws", async () => {
    // WR-B: prior to the fix, a thrown DB error bubbled out to Next's
    // default HTML 500. The admin UI consumes this with fetch().json(),
    // which then trips on "Unexpected token < in JSON". Match the 5xx
    // -> structured JSON invariant the other admin routes uphold.
    mockGetAdminCards.mockRejectedValueOnce(new Error("simulated DB failure"));

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load cards" });
  });
});

describe("DELETE /api/admin/cards", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDeleteAllCards.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("deletes all cards and returns the deleted count", async () => {
    mockDeleteAllCards.mockResolvedValue({ deleted: 42 });

    const response = await DELETE_ALL(makeDeleteAllRequest());
    const data = await response.json();

    expect(data).toEqual({ success: true, deleted: 42 });
    expect(mockDeleteAllCards).toHaveBeenCalledWith({ actorEmail: "admin@example.com" });
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await DELETE_ALL(makeDeleteAllRequest());
    expect(response.status).toBe(401);
    expect(mockDeleteAllCards).not.toHaveBeenCalled();
  });

  it("returns 500 when deleteAllCards rejects", async () => {
    mockDeleteAllCards.mockRejectedValue(new Error("DB is down"));

    const response = await DELETE_ALL(makeDeleteAllRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Delete inventory failed — inventory unchanged",
    });
  });

  it("returns 429 when delete-all is rate-limited and does not touch the database", async () => {
    mockEnforceRateLimit.mockResolvedValueOnce(
      Response.json(
        { error: "rate_limited", code: "rate_limited", retryAfterSeconds: 30 },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );
    const response = await DELETE_ALL(makeDeleteAllRequest());
    expect(response.status).toBe(429);
    expect(mockDeleteAllCards).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/cards/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUpdateCard.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("updates price (converts dollars to cents via updateCard)", async () => {
    const updatedCard = {
      id: "card-1",
      name: "Test",
      price: 5.99,
    };
    mockUpdateCard.mockResolvedValue(updatedCard);

    const [req, ctx] = makePatchRequest("card-1", { price: 5.99 });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.card).toEqual(updatedCard);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", { price: 5.99 }, { actorEmail: "admin@example.com" });
  });

  it("updates quantity to 0", async () => {
    mockUpdateCard.mockResolvedValue({ id: "card-1", quantity: 0 });

    const [req, ctx] = makePatchRequest("card-1", { quantity: 0 });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", { quantity: 0 }, { actorEmail: "admin@example.com" });
  });

  it('converts condition abbreviation NM to near_mint', async () => {
    mockUpdateCard.mockResolvedValue({ id: "card-1", condition: "near_mint" });

    const [req, ctx] = makePatchRequest("card-1", { condition: "NM" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", {
      condition: "near_mint",
    }, { actorEmail: "admin@example.com" });
  });

  it("returns 400 for negative price", async () => {
    const [req, ctx] = makePatchRequest("card-1", { price: -1 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 400 for negative quantity", async () => {
    const [req, ctx] = makePatchRequest("card-1", { quantity: -5 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid condition", async () => {
    const [req, ctx] = makePatchRequest("card-1", { condition: "INVALID" });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 400 for empty body (no valid fields)", async () => {
    const [req, ctx] = makePatchRequest("card-1", {});
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);
  });

  it("returns 404 for nonexistent card", async () => {
    mockUpdateCard.mockResolvedValue(null);

    const [req, ctx] = makePatchRequest("nonexistent", { price: 1.0 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(404);
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const [req, ctx] = makePatchRequest("card-1", { price: 1.0 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it("returns 403 when requireAdmin returns 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const [req, ctx] = makePatchRequest("card-1", { price: 1.0 });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
  });

  it("returns 400 JSON for a malformed JSON body", async () => {
    // WR-B: an unparseable body (e.g. UI bug, mis-set Content-Type) must
    // not propagate the request.json() SyntaxError into Next's default
    // HTML 500. Validate via raw body so request.json() rejects.
    const req = new Request(`http://localhost:3000/api/admin/cards/card-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const ctx = { params: Promise.resolve({ id: "card-1" }) };
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(mockUpdateCard).not.toHaveBeenCalled();
  });

  it("returns 500 JSON when updateCard throws", async () => {
    // WR-B: match the structured-500-JSON invariant the rest of the admin
    // routes uphold (orders/[id] PATCH, cancel, bulk-delete, delete-all).
    mockUpdateCard.mockRejectedValueOnce(new Error("simulated DB failure"));

    const [req, ctx] = makePatchRequest("card-1", { price: 1.0 });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Card update failed — card unchanged",
    });
  });
});

describe("DELETE /api/admin/cards/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDeleteCard.mockReset();
    mockEnforceRateLimit.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("returns success for existing card", async () => {
    mockDeleteCard.mockResolvedValue(true);

    const [req, ctx] = makeDeleteRequest("card-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it("returns 404 for nonexistent card", async () => {
    mockDeleteCard.mockResolvedValue(false);

    const [req, ctx] = makeDeleteRequest("nonexistent");
    const response = await DELETE(req, ctx);
    expect(response.status).toBe(404);
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const [req, ctx] = makeDeleteRequest("card-1");
    const response = await DELETE(req, ctx);
    expect(response.status).toBe(401);
  });

  it("returns 403 when requireAdmin returns 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const [req, ctx] = makeDeleteRequest("card-1");
    const response = await DELETE(req, ctx);
    expect(response.status).toBe(403);
  });

  it("returns 500 JSON when deleteCard throws", async () => {
    // WR-B: match the structured-500-JSON invariant the rest of the admin
    // routes uphold.
    mockDeleteCard.mockRejectedValueOnce(new Error("simulated DB failure"));

    const [req, ctx] = makeDeleteRequest("card-1");
    const response = await DELETE(req, ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Card delete failed — card unchanged",
    });
  });
});
