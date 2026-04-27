import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockGetAdminOrders, mockGetOrderById } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockGetAdminOrders: vi.fn(),
    mockGetOrderById: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/db/orders", () => ({
  getAdminOrders: mockGetAdminOrders,
  getOrderById: mockGetOrderById,
}));

import { GET as GET_LIST } from "../route";
import { GET as GET_DETAIL } from "../[id]/route";

const adminSession = {
  user: { email: "admin@example.com", name: "Admin User" },
};

function makeListRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/admin/orders");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

function makeDetailContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/admin/orders", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetAdminOrders.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("returns paginated admin orders", async () => {
    const mockResult = {
      orders: [
        {
          id: "ORD-20260427-020304-ABC123",
          buyerName: "Viki",
          buyerEmail: "viki@example.com",
          totalItems: 3,
          totalPrice: 4.25,
          status: "pending",
          createdAt: "2026-04-27T02:03:04.000Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    };
    mockGetAdminOrders.mockResolvedValue(mockResult);

    const response = await GET_LIST(makeListRequest({ page: "1", limit: "25" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockResult);
    expect(mockGetAdminOrders).toHaveBeenCalledWith({ page: 1, limit: 25 });
  });

  it("passes over-large limits to the helper for centralized capping", async () => {
    mockGetAdminOrders.mockResolvedValue({
      orders: [],
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 0,
    });

    await GET_LIST(makeListRequest({ limit: "500" }));

    expect(mockGetAdminOrders).toHaveBeenCalledWith({ page: 1, limit: 500 });
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET_LIST(makeListRequest());

    expect(response.status).toBe(401);
    expect(mockGetAdminOrders).not.toHaveBeenCalled();
  });

  it("returns 403 when requireAdmin returns a 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await GET_LIST(makeListRequest());

    expect(response.status).toBe(403);
    expect(mockGetAdminOrders).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/orders/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockGetOrderById.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("returns order detail", async () => {
    const order = {
      orderRef: "ORD-20260427-020304-ABC123",
      buyerName: "Viki",
      buyerEmail: "viki@example.com",
      message: "Bring to FNM",
      totalItems: 3,
      totalPrice: 4.25,
      status: "pending",
      createdAt: "2026-04-27T02:03:04.000Z",
      items: [
        {
          cardId: "lea-232-normal-near_mint",
          name: "Lightning Bolt",
          setName: "Alpha",
          setCode: "lea",
          collectorNumber: "232",
          condition: "near_mint",
          price: 1.25,
          quantity: 3,
          lineTotal: 3.75,
          imageUrl: "https://example.com/bolt.jpg",
        },
      ],
    };
    mockGetOrderById.mockResolvedValue(order);

    const response = await GET_DETAIL(
      new Request("http://localhost:3000/api/admin/orders/ORD-20260427-020304-ABC123"),
      makeDetailContext(order.orderRef),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ order });
    expect(mockGetOrderById).toHaveBeenCalledWith(order.orderRef);
  });

  it("returns 404 for a missing order", async () => {
    mockGetOrderById.mockResolvedValue(null);

    const response = await GET_DETAIL(
      new Request("http://localhost:3000/api/admin/orders/missing-order"),
      makeDetailContext("missing-order"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Order not found" });
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET_DETAIL(
      new Request("http://localhost:3000/api/admin/orders/order-1"),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(401);
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });

  it("returns 403 when requireAdmin returns a 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await GET_DETAIL(
      new Request("http://localhost:3000/api/admin/orders/order-1"),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(403);
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });
});
