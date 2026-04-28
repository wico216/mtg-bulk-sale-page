import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockInsert, insertBuilder } = vi.hoisted(() => {
  const insertBuilder = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  return {
    mockExecute: vi.fn(),
    mockInsert: vi.fn(() => insertBuilder),
    insertBuilder,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
  },
}));

import { cancelOrder, getAdminOrders, getOrderById, updateOrderWorkflow } from "../orders";

const orderRows = [
  {
    id: "ORD-20260427-020304-ABC123",
    buyerName: "Viki",
    buyerEmail: "viki@example.com",
    totalItems: 3,
    totalPrice: 425,
    status: "pending",
    createdAt: "2026-04-27T02:03:04.000Z",
  },
  {
    id: "ORD-20260426-010203-XYZ789",
    buyerName: "Friend",
    buyerEmail: "friend@example.com",
    totalItems: 1,
    totalPrice: 50,
    status: "completed",
    createdAt: new Date("2026-04-26T01:02:03.000Z"),
  },
];

const detailOrderRow = {
  id: "ORD-20260427-020304-ABC123",
  buyerName: "Viki",
  buyerEmail: "viki@example.com",
  message: "Bring to FNM",
  totalItems: 3,
  totalPrice: 425,
  status: "pending",
  adminNote: "Pull from blue binder.",
  createdAt: "2026-04-27T02:03:04.000Z",
};

const detailItemRows = [
  {
    cardId: "lea-232-normal-near_mint",
    name: "Lightning Bolt",
    setName: "Alpha",
    setCode: "lea",
    collectorNumber: "232",
    condition: "near_mint",
    price: 125,
    quantity: 3,
    lineTotal: 375,
    imageUrl: "https://example.com/bolt.jpg",
  },
  {
    cardId: "mh2-45-normal-lightly_played",
    name: "Counterspell",
    setName: "Modern Horizons 2",
    setCode: "mh2",
    collectorNumber: "45",
    condition: "lightly_played",
    price: 50,
    quantity: 1,
    lineTotal: 50,
    imageUrl: null,
  },
];

function resetAuditMocks() {
  mockInsert.mockClear();
  insertBuilder.values.mockClear();
  insertBuilder.returning.mockReset();
  insertBuilder.returning.mockResolvedValue([
    {
      id: 99,
      action: "order.status_update",
      actorEmail: "admin@example.com",
      targetType: "order",
      targetId: detailOrderRow.id,
      targetCount: 1,
      metadata: {},
      createdAt: "2026-04-28T06:00:00.000Z",
    },
  ]);
}

describe("getAdminOrders", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns paginated orders with prices converted from cents to dollars", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: orderRows })
      .mockResolvedValueOnce({ rows: [{ total: 37 }] });

    const result = await getAdminOrders({ page: 2, limit: 10 });

    expect(result).toEqual({
      orders: [
        { ...orderRows[0], totalPrice: 4.25 },
        {
          ...orderRows[1],
          totalPrice: 0.5,
          createdAt: "2026-04-26T01:02:03.000Z",
        },
      ],
      total: 37,
      page: 2,
      limit: 10,
      totalPages: 4,
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("defaults page to 1, limit to 25, and caps requested limit at 100", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 250 }] });

    const result = await getAdminOrders({ page: 0, limit: 500 });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.totalPages).toBe(3);
  });

  it("accepts search and status filters for centralized query handling", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [orderRows[0]] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await getAdminOrders({
      page: 1,
      limit: 25,
      q: "viki@example.com",
      status: "pending",
    });

    expect(result.orders).toHaveLength(1);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("orders list SQL newest first", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("ORDER BY created_at DESC");
  });

  it("filters orders by search text and status in SQL", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("ILIKE");
    expect(source).toContain("status =");
    expect(source).toContain("buyer_email");
    expect(source).toContain("buyer_name");
  });
});

describe("getOrderById", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns order detail with item snapshots converted from cents to dollars", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [detailOrderRow] })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await getOrderById(detailOrderRow.id);

    expect(result).toEqual({
      orderRef: detailOrderRow.id,
      buyerName: detailOrderRow.buyerName,
      buyerEmail: detailOrderRow.buyerEmail,
      message: detailOrderRow.message,
      adminNote: detailOrderRow.adminNote,
      totalItems: 3,
      totalPrice: 4.25,
      status: "pending",
      createdAt: detailOrderRow.createdAt,
      items: [
        { ...detailItemRows[0], price: 1.25, lineTotal: 3.75 },
        { ...detailItemRows[1], price: 0.5, lineTotal: 0.5 },
      ],
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("returns null when the order does not exist", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    await expect(getOrderById("missing-order")).resolves.toBeNull();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("reads order_items snapshots instead of current cards", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("FROM order_items");
    expect(source).not.toContain("getCardById");
  });
});

describe("updateOrderWorkflow", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    resetAuditMocks();
  });

  it("writes an order.status_update audit entry without storing internal note content", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: detailOrderRow.id }] })
      .mockResolvedValueOnce({
        rows: [{ ...detailOrderRow, status: "confirmed", adminNote: "Private note" }],
      })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await updateOrderWorkflow({
      orderId: detailOrderRow.id,
      status: "confirmed",
      adminNote: "Private note",
      audit: { actorEmail: "admin@example.com" },
    });

    expect(result?.status).toBe("confirmed");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const stored = insertBuilder.values.mock.calls[0][0] as {
      action: string;
      actorEmail: string;
      targetType: string;
      targetId: string;
      targetCount: number;
      metadata: Record<string, unknown>;
    };
    expect(stored).toMatchObject({
      action: "order.status_update",
      actorEmail: "admin@example.com",
      targetType: "order",
      targetId: detailOrderRow.id,
      targetCount: 1,
    });
    expect(stored.metadata).toMatchObject({
      changedFields: ["status", "adminNote"],
      status: "confirmed",
      adminNoteChanged: true,
    });
    expect(JSON.stringify(stored.metadata)).not.toContain("Private note");
  });

  it("does not write an audit entry when the order is missing", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const result = await updateOrderWorkflow({
      orderId: "missing-order",
      status: "confirmed",
      audit: { actorEmail: "admin@example.com" },
    });

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("cancelOrder", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    resetAuditMocks();
  });

  it("cancels an order without restoring inventory", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            result: {
              found: true,
              completed: false,
              alreadyCancelled: false,
              restoredQuantity: 0,
              restoredRows: 0,
              skippedItems: [],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ...detailOrderRow, status: "cancelled" }] })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await cancelOrder({
      orderId: detailOrderRow.id,
      restoreInventory: false,
    });

    expect(result).toMatchObject({
      ok: true,
      alreadyCancelled: false,
      restoredQuantity: 0,
      restoredRows: 0,
      skippedItems: [],
      order: { orderRef: detailOrderRow.id, status: "cancelled" },
    });
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it("restores existing inventory rows and reports skipped missing rows", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            result: {
              found: true,
              completed: false,
              alreadyCancelled: false,
              restoredQuantity: 3,
              restoredRows: 1,
              skippedItems: [
                {
                  cardId: "missing-card",
                  name: "Missing Snapshot",
                  quantity: 2,
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ...detailOrderRow, status: "cancelled" }] })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await cancelOrder({
      orderId: detailOrderRow.id,
      restoreInventory: true,
    });

    expect(result).toMatchObject({
      ok: true,
      restoredQuantity: 3,
      restoredRows: 1,
      skippedItems: [
        { cardId: "missing-card", name: "Missing Snapshot", quantity: 2 },
      ],
    });
  });

  it("writes cancel and restore audit entries when cancellation restores inventory", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            result: {
              found: true,
              completed: false,
              alreadyCancelled: false,
              restoredQuantity: 3,
              restoredRows: 1,
              skippedItems: [
                {
                  cardId: "missing-card",
                  name: "Missing Snapshot",
                  quantity: 2,
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ...detailOrderRow, status: "cancelled" }] })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await cancelOrder({
      orderId: detailOrderRow.id,
      restoreInventory: true,
      audit: { actorEmail: "admin@example.com" },
    });

    expect(result).toMatchObject({ ok: true, restoredQuantity: 3, restoredRows: 1 });
    expect(mockInsert).toHaveBeenCalledTimes(2);
    const [cancelAudit, restoreAudit] = insertBuilder.values.mock.calls.map(
      (call) => call[0] as { action: string; metadata: Record<string, unknown>; targetCount: number },
    );
    expect(cancelAudit).toMatchObject({
      action: "order.cancel",
      targetCount: 1,
      metadata: {
        restoreRequested: true,
        restoredQuantity: 3,
        restoredRows: 1,
        skippedItems: [
          { cardId: "missing-card", name: "Missing Snapshot", quantity: 2 },
        ],
      },
    });
    expect(restoreAudit).toMatchObject({
      action: "order.restore_inventory",
      targetCount: 1,
      metadata: {
        restoredQuantity: 3,
        restoredRows: 1,
        skippedItems: [
          { cardId: "missing-card", name: "Missing Snapshot", quantity: 2 },
        ],
      },
    });
  });

  it("rejects completed orders without returning order detail", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          result: {
            found: true,
            completed: true,
            alreadyCancelled: false,
            restoredQuantity: 0,
            restoredRows: 0,
            skippedItems: [],
          },
        },
      ],
    });

    const result = await cancelOrder({
      orderId: detailOrderRow.id,
      restoreInventory: true,
    });

    expect(result).toEqual({
      ok: false,
      code: "completed_order",
      message: "Completed orders cannot be cancelled",
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns not_found when the order does not exist", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          result: {
            found: false,
            completed: false,
            alreadyCancelled: false,
            restoredQuantity: 0,
            restoredRows: 0,
            skippedItems: [],
          },
        },
      ],
    });

    const result = await cancelOrder({
      orderId: "missing-order",
      restoreInventory: false,
    });

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      message: "Order not found",
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("treats already-cancelled orders as idempotent and does not restore twice", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            result: {
              found: true,
              completed: false,
              alreadyCancelled: true,
              restoredQuantity: 0,
              restoredRows: 0,
              skippedItems: [],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ...detailOrderRow, status: "cancelled" }] })
      .mockResolvedValueOnce({ rows: detailItemRows });

    const result = await cancelOrder({
      orderId: detailOrderRow.id,
      restoreInventory: true,
    });

    expect(result).toMatchObject({
      ok: true,
      alreadyCancelled: true,
      restoredQuantity: 0,
      restoredRows: 0,
      order: { status: "cancelled" },
    });
  });

  it("guards restore work behind the first successful cancellation update", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("status IN ('pending'::order_status, 'confirmed'::order_status)");
    expect(source).toContain("EXISTS (SELECT 1 FROM updated_order)");
  });
});
