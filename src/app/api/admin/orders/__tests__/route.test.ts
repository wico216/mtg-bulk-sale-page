import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockGetAdminOrders,
  mockGetOrderById,
  mockUpdateOrderWorkflow,
  mockCancelOrder,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminOrders: vi.fn(),
  mockGetOrderById: vi.fn(),
  mockUpdateOrderWorkflow: vi.fn(),
  mockCancelOrder: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin-check", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/db/orders", () => ({
  getAdminOrders: mockGetAdminOrders,
  getOrderById: mockGetOrderById,
  updateOrderWorkflow: mockUpdateOrderWorkflow,
  cancelOrder: mockCancelOrder,
}));

import { GET as GET_LIST } from "../route";
import { GET as GET_DETAIL, PATCH as PATCH_DETAIL } from "../[id]/route";
import { POST as POST_CANCEL } from "../[id]/cancel/route";

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

function makeDetailRequest(body?: unknown): Request {
  return new Request(
    "http://localhost:3000/api/admin/orders/ORD-20260427-020304-ABC123",
    body === undefined
      ? undefined
      : {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}

function makeCancelRequest(body?: unknown): Request {
  return new Request(
    "http://localhost:3000/api/admin/orders/ORD-20260427-020304-ABC123/cancel",
    body === undefined
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
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

  it("passes search and status filters to the helper", async () => {
    mockGetAdminOrders.mockResolvedValue({
      orders: [],
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
    });

    await GET_LIST(
      makeListRequest({ page: "1", q: "viki@example.com", status: "pending" }),
    );

    expect(mockGetAdminOrders).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      q: "viki@example.com",
      status: "pending",
    });
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
      adminNote: "Pull from blue binder.",
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

describe("PATCH /api/admin/orders/[id]", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockUpdateOrderWorkflow.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("updates status and internal note", async () => {
    const order = {
      orderRef: "ORD-20260427-020304-ABC123",
      buyerName: "Viki",
      buyerEmail: "viki@example.com",
      adminNote: "Ready for pickup.",
      totalItems: 1,
      totalPrice: 1.5,
      status: "confirmed",
      createdAt: "2026-04-27T02:03:04.000Z",
      items: [],
    };
    mockUpdateOrderWorkflow.mockResolvedValue(order);

    const response = await PATCH_DETAIL(
      makeDetailRequest({ status: "confirmed", adminNote: "Ready for pickup." }),
      makeDetailContext(order.orderRef),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, order });
    expect(mockUpdateOrderWorkflow).toHaveBeenCalledWith({
      orderId: order.orderRef,
      status: "confirmed",
      adminNote: "Ready for pickup.",
    });
  });

  it("clears an internal note with an empty string", async () => {
    mockUpdateOrderWorkflow.mockResolvedValue({
      orderRef: "ORD-20260427-020304-ABC123",
      buyerName: "Viki",
      buyerEmail: "viki@example.com",
      adminNote: null,
      totalItems: 1,
      totalPrice: 1.5,
      status: "pending",
      createdAt: "2026-04-27T02:03:04.000Z",
      items: [],
    });

    const response = await PATCH_DETAIL(
      makeDetailRequest({ adminNote: "   " }),
      makeDetailContext("ORD-20260427-020304-ABC123"),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateOrderWorkflow).toHaveBeenCalledWith({
      orderId: "ORD-20260427-020304-ABC123",
      adminNote: null,
    });
  });

  it("rejects invalid status values", async () => {
    const response = await PATCH_DETAIL(
      makeDetailRequest({ status: "cancelled" }),
      makeDetailContext("ORD-20260427-020304-ABC123"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid status. Must be one of: pending, confirmed, completed",
    });
    expect(mockUpdateOrderWorkflow).not.toHaveBeenCalled();
  });

  it("rejects overlong internal notes", async () => {
    const response = await PATCH_DETAIL(
      makeDetailRequest({ adminNote: "a".repeat(1001) }),
      makeDetailContext("ORD-20260427-020304-ABC123"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Internal note must be 1000 characters or fewer",
    });
    expect(mockUpdateOrderWorkflow).not.toHaveBeenCalled();
  });

  it("returns 400 when no valid fields are provided", async () => {
    const response = await PATCH_DETAIL(
      makeDetailRequest({}),
      makeDetailContext("ORD-20260427-020304-ABC123"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No valid fields to update" });
    expect(mockUpdateOrderWorkflow).not.toHaveBeenCalled();
  });

  it("returns 404 when the order does not exist", async () => {
    mockUpdateOrderWorkflow.mockResolvedValue(null);

    const response = await PATCH_DETAIL(
      makeDetailRequest({ status: "confirmed" }),
      makeDetailContext("missing-order"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Order not found" });
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH_DETAIL(
      makeDetailRequest({ status: "confirmed" }),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(401);
    expect(mockUpdateOrderWorkflow).not.toHaveBeenCalled();
  });

  it("returns 403 when requireAdmin returns a 403 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH_DETAIL(
      makeDetailRequest({ status: "confirmed" }),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(403);
    expect(mockUpdateOrderWorkflow).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/orders/[id]/cancel", () => {
  beforeEach(() => {
    mockRequireAdmin.mockReset();
    mockCancelOrder.mockReset();
    mockRequireAdmin.mockResolvedValue(adminSession);
  });

  it("cancels an order with explicit inventory restore", async () => {
    const result = {
      ok: true,
      alreadyCancelled: false,
      restoredQuantity: 3,
      restoredRows: 1,
      skippedItems: [],
      order: {
        orderRef: "ORD-20260427-020304-ABC123",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        totalItems: 3,
        totalPrice: 4.25,
        status: "cancelled",
        createdAt: "2026-04-27T02:03:04.000Z",
        items: [],
      },
    };
    mockCancelOrder.mockResolvedValue(result);

    const response = await POST_CANCEL(
      makeCancelRequest({ restoreInventory: true }),
      makeDetailContext(result.order.orderRef),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, result });
    expect(mockCancelOrder).toHaveBeenCalledWith({
      orderId: result.order.orderRef,
      restoreInventory: true,
    });
  });

  it("returns 409 when the helper rejects a completed order", async () => {
    mockCancelOrder.mockResolvedValue({
      ok: false,
      code: "completed_order",
      message: "Completed orders cannot be cancelled",
    });

    const response = await POST_CANCEL(
      makeCancelRequest({ restoreInventory: false }),
      makeDetailContext("completed-order"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Completed orders cannot be cancelled",
      code: "completed_order",
    });
  });

  it("returns 404 when the order does not exist", async () => {
    mockCancelOrder.mockResolvedValue({
      ok: false,
      code: "not_found",
      message: "Order not found",
    });

    const response = await POST_CANCEL(
      makeCancelRequest({ restoreInventory: false }),
      makeDetailContext("missing-order"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Order not found",
      code: "not_found",
    });
  });

  it("requires restoreInventory to be a boolean", async () => {
    const response = await POST_CANCEL(
      makeCancelRequest({ restoreInventory: "yes" }),
      makeDetailContext("ORD-20260427-020304-ABC123"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "restoreInventory must be a boolean",
    });
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON bodies", async () => {
    const response = await POST_CANCEL(
      new Request("http://localhost:3000/api/admin/orders/order-1/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 401 when requireAdmin returns a 401 Response", async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST_CANCEL(
      makeCancelRequest({ restoreInventory: false }),
      makeDetailContext("order-1"),
    );

    expect(response.status).toBe(401);
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });
});
