import { vi, describe, it, expect, beforeEach } from "vitest";

// Use vi.hoisted() pattern for mock variables (established in Phase 8)
const { mockRequireAdmin, mockGetAdminCards, mockUpdateCard, mockDeleteCard, mockDeleteAllCards } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockGetAdminCards: vi.fn(),
    mockUpdateCard: vi.fn(),
    mockDeleteCard: vi.fn(),
    mockDeleteAllCards: vi.fn(),
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

// Admin session fixture
const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

describe("GET /api/admin/cards", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetAdminCards.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
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
});

describe("DELETE /api/admin/cards", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDeleteAllCards.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("deletes all cards and returns the deleted count", async () => {
    mockDeleteAllCards.mockResolvedValue({ deleted: 42 });

    const response = await DELETE_ALL();
    const data = await response.json();

    expect(data).toEqual({ success: true, deleted: 42 });
    expect(mockDeleteAllCards).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when requireAdmin returns 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await DELETE_ALL();
    expect(response.status).toBe(401);
    expect(mockDeleteAllCards).not.toHaveBeenCalled();
  });

  it("returns 500 when deleteAllCards rejects", async () => {
    mockDeleteAllCards.mockRejectedValue(new Error("DB is down"));

    const response = await DELETE_ALL();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Delete inventory failed — inventory unchanged",
    });
  });
});

describe("PATCH /api/admin/cards/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUpdateCard.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
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
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", { price: 5.99 });
  });

  it("updates quantity to 0", async () => {
    mockUpdateCard.mockResolvedValue({ id: "card-1", quantity: 0 });

    const [req, ctx] = makePatchRequest("card-1", { quantity: 0 });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", { quantity: 0 });
  });

  it('converts condition abbreviation NM to near_mint', async () => {
    mockUpdateCard.mockResolvedValue({ id: "card-1", condition: "near_mint" });

    const [req, ctx] = makePatchRequest("card-1", { condition: "NM" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockUpdateCard).toHaveBeenCalledWith("card-1", {
      condition: "near_mint",
    });
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
});

describe("DELETE /api/admin/cards/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockDeleteCard.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
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
});
