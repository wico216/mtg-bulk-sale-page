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

import { placeCheckoutOrder } from "../orders";

const sqlOrder = {
  orderRef: "ORD-20260427-020304-ABCD12",
  buyerName: "Viki",
  buyerEmail: "viki@example.com",
  message: "pickup tomorrow",
  totalItems: 3,
  totalPrice: 425,
  createdAt: "2026-04-27T02:03:04.000Z",
  items: [
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
  ],
};

describe("placeCheckoutOrder", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns persisted order data with prices converted from cents to dollars", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ result: { ok: true, order: sqlOrder } }] });

    const result = await placeCheckoutOrder({
      orderRef: sqlOrder.orderRef,
      buyerName: sqlOrder.buyerName,
      buyerEmail: sqlOrder.buyerEmail,
      message: sqlOrder.message,
      items: [
        { cardId: "lea-232-normal-near_mint", quantity: 2 },
        { cardId: "lea-232-normal-near_mint", quantity: 1 },
        { cardId: "mh2-45-normal-lightly_played", quantity: 1 },
      ],
    });

    expect(result).toEqual({
      ok: true,
      order: {
        ...sqlOrder,
        totalPrice: 4.25,
        items: [
          { ...sqlOrder.items[0], price: 1.25, lineTotal: 3.75 },
          { ...sqlOrder.items[1], price: 0.5, lineTotal: 0.5 },
        ],
      },
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns stock conflicts without an order when requested cards are missing or short-stocked", async () => {
    const conflicts = [
      {
        cardId: "lea-232-normal-near_mint",
        name: "Lightning Bolt",
        requested: 4,
        available: 1,
      },
      {
        cardId: "missing-card",
        name: "missing-card",
        requested: 1,
        available: 0,
      },
    ];
    mockExecute.mockResolvedValueOnce({ rows: [{ result: { ok: false, conflicts } }] });

    const result = await placeCheckoutOrder({
      orderRef: "ORD-20260427-020304-DCBA21",
      buyerName: "Viki",
      buyerEmail: "viki@example.com",
      items: [
        { cardId: "lea-232-normal-near_mint", quantity: 4 },
        { cardId: "missing-card", quantity: 1 },
      ],
    });

    expect(result).toEqual({ ok: false, code: "stock_conflict", conflicts });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid quantities before hitting the database", async () => {
    await expect(
      placeCheckoutOrder({
        orderRef: "ORD-20260427-020304-ZZZZ99",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 0 }],
      }),
    ).rejects.toThrow("Invalid quantity");
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("uses one raw SQL write with row locks and no unsupported interactive transaction", () => {
    const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("UPDATE cards");
    expect(source).toContain("INSERT INTO orders");
    expect(source).toContain("INSERT INTO order_items");
    expect(source).toContain("db.execute");
    expect(source).not.toContain("db.transaction(");
  });
});
