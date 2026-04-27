import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
  },
}));

import { getAdminOrders, getOrderById } from "../orders";

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

  it("orders list SQL newest first", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("ORDER BY created_at DESC");
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
