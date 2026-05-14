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
  // 2026-05-14 quick task 260514-7z2: SQL payload now carries a nullable
  // buyer_phone snapshot. Default fixture omits → null (buyer didn't supply).
  buyerPhone: null,
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
      // Phase 18 D-11: order_items.binder snapshot (NOT NULL DEFAULT 'unsorted').
      binder: "unsorted",
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
      binder: "unsorted",
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
        cardId: "xxx-999-normal-near_mint",
        name: "xxx-999-normal-near_mint",
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
        // 4-segment aggregated id for a card that doesn't exist in the db.
        // The locked_rows CTE returns no rows for it; conflicts CTE
        // produces a row with available=0 from the LEFT JOIN.
        { cardId: "xxx-999-normal-near_mint", quantity: 1 },
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

  describe("allocator (Phase 18 — multi-binder)", () => {
    beforeEach(() => {
      mockExecute.mockReset();
    });

    // Helper: build a SQL payload as the new CTE chain would return it for
    // an aggregated cardId split across multiple binder rows.
    function multiBinderOrderPayload(args: {
      orderRef: string;
      aggregatedId: string;
      sources: Array<{ binder: string; quantity: number }>;
      pricePerUnit?: number; // cents; default 100
    }) {
      const price = args.pricePerUnit ?? 100;
      const totalQty = args.sources.reduce((s, x) => s + x.quantity, 0);
      const totalPrice = totalQty * price;
      return {
        ok: true,
        order: {
          orderRef: args.orderRef,
          buyerName: "Viki",
          buyerEmail: "viki@example.com",
          message: null,
          totalItems: totalQty,
          totalPrice,
          createdAt: "2026-05-11T00:00:00.000Z",
          items: args.sources.map((s) => ({
            cardId: `${args.aggregatedId}-${s.binder}`,
            name: "Lightning Bolt",
            setName: "Alpha",
            setCode: "lea",
            collectorNumber: "232",
            condition: "near_mint",
            price,
            quantity: s.quantity,
            lineTotal: price * s.quantity,
            imageUrl: null,
            binder: s.binder,
          })),
        },
      };
    }

    it("multi-binder split picks smallest-first then lex-binder tiebreak (D-01)", async () => {
      // Lightning Bolt × 3 against (a02:2, a05:2, a07:2) → smallest-first +
      // lex tiebreak picks a02:2 then a05:1, leaves a07 untouched.
      mockExecute.mockResolvedValueOnce({
        rows: [{
          result: multiBinderOrderPayload({
            orderRef: "ORD-D01",
            aggregatedId: "lea-232-normal-near_mint",
            sources: [
              { binder: "a02", quantity: 2 },
              { binder: "a05", quantity: 1 },
            ],
          }),
        }],
      });

      const result = await placeCheckoutOrder({
        orderRef: "ORD-D01",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 3 }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.order.items.length).toBe(2);
      expect(result.order.items[0].binder).toBe("a02");
      expect(result.order.items[0].quantity).toBe(2);
      expect(result.order.items[0].cardId).toBe("lea-232-normal-near_mint-a02");
      expect(result.order.items[1].binder).toBe("a05");
      expect(result.order.items[1].quantity).toBe(1);
      expect(result.order.items[1].cardId).toBe("lea-232-normal-near_mint-a05");
    });

    it("full-supply (2,2,2)×6 distributes [2,2,2] in binder ASC order (D-01, D-03)", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{
          result: multiBinderOrderPayload({
            orderRef: "ORD-D03",
            aggregatedId: "lea-232-normal-near_mint",
            sources: [
              { binder: "a02", quantity: 2 },
              { binder: "a05", quantity: 2 },
              { binder: "a07", quantity: 2 },
            ],
          }),
        }],
      });

      const result = await placeCheckoutOrder({
        orderRef: "ORD-D03",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 6 }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.order.items.length).toBe(3);
      expect(result.order.items.map((i) => i.binder)).toEqual(["a02", "a05", "a07"]);
      expect(result.order.items.map((i) => i.quantity)).toEqual([2, 2, 2]);
      expect(result.order.items.reduce((s, i) => s + i.quantity, 0)).toBe(6);
    });

    it("(2,2,2)×7 returns stock_conflict with aggregated id and SUM available; no decrement (D-05, D-14)", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{
          result: {
            ok: false,
            conflicts: [{
              cardId: "lea-232-normal-near_mint",
              name: "Lightning Bolt",
              requested: 7,
              available: 6,
            }],
          },
        }],
      });

      const result = await placeCheckoutOrder({
        orderRef: "ORD-D05",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 7 }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("stock_conflict");
      expect(result.conflicts.length).toBe(1);
      // Aggregated 4-segment id only, NEVER 5-segment per-binder id.
      expect(result.conflicts[0].cardId).toBe("lea-232-normal-near_mint");
      expect(result.conflicts[0].cardId.split("-").length).toBe(4);
      expect(result.conflicts[0].requested).toBe(7);
      expect(result.conflicts[0].available).toBe(6);
    });

    it("multi-line cart — partial fulfillment of one line aborts the entire order (PITFALLS Pitfall 2 / D-05)", async () => {
      // Two lines: one fulfillable, one short. Strict all-or-nothing: the
      // conflict on the short line prevents ANY decrement; no order returned.
      // (Both cardIds are valid 4-segment aggregated keys.)
      mockExecute.mockResolvedValueOnce({
        rows: [{
          result: {
            ok: false,
            conflicts: [{
              cardId: "yyy-100-foil-near_mint",
              name: "Short Line",
              requested: 5,
              available: 2,
            }],
          },
        }],
      });

      const result = await placeCheckoutOrder({
        orderRef: "ORD-MULTI",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [
          { cardId: "lea-232-normal-near_mint", quantity: 1 },
          { cardId: "yyy-100-foil-near_mint", quantity: 5 },
        ],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("stock_conflict");
      // Only the short line is in conflicts. The fulfillable line is silently
      // absent because no stock_write happened — we never partially fulfilled.
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].cardId).toBe("yyy-100-foil-near_mint");
      // No order returned — zero items decremented.
      expect("order" in result).toBe(false);
    });

    it("aggregated cardId conflict shape — never leaks per-binder breakdown (D-06)", async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{
          result: {
            ok: false,
            conflicts: [{
              cardId: "lea-232-normal-near_mint", // 4-segment aggregated id
              name: "X",
              requested: 10,
              available: 6,
            }],
          },
        }],
      });

      const result = await placeCheckoutOrder({
        orderRef: "ORD-D06",
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 10 }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      const serialized = JSON.stringify(result.conflicts);
      // Buyer-facing privacy belt-and-suspenders: no per-binder hints leak.
      expect(serialized).not.toContain("a02");
      expect(serialized).not.toContain("binder");
      // The conflict shape must match StockConflict EXACTLY — no extra keys.
      expect(Object.keys(result.conflicts[0]).sort()).toEqual(
        ["available", "cardId", "name", "requested"],
      );
      expect(result.conflicts[0].available).toBe(6); // SUM across binders, not per-row.
      // The cardId returned is exactly the 4-segment aggregated id — never
      // 5-segment per-binder.
      expect(result.conflicts[0].cardId.split("-").length).toBe(4);
    });

    it("source contains the new allocator CTE markers and does not regress to JS-side pre-allocation (D-02, D-03, D-04)", () => {
      const source = readFileSync(join(process.cwd(), "src/db/orders.ts"), "utf8");

      // CTE chain markers — every named CTE the allocator depends on must
      // exist in the source verbatim. If a refactor drops or renames any of
      // these, the test fails loud.
      expect(source).toContain("FOR UPDATE OF cards");
      expect(source).toContain("locked_rows AS (");
      expect(source).toContain("conflicts AS (");
      expect(source).toContain("can_fulfill AS (");
      expect(source).toContain("allocations AS (");
      expect(source).toContain("nonzero_allocations AS (");
      expect(source).toContain("stock_write AS (");
      expect(source).toContain("inserted_order AS (");
      expect(source).toContain("inserted_items AS (");

      // Window functions for the running-supply allocation arithmetic.
      expect(source).toMatch(/ROW_NUMBER\(\)\s+OVER/);
      expect(source).toMatch(/SUM\(.*quantity.*\)\s+OVER/);
      expect(source).toContain("LEAST(");
      expect(source).toContain("GREATEST(0,");

      // Hard "do not regress" markers for placeCheckoutOrder. neon-http has
      // no interactive transactions and JS-side pre-allocation +
      // lock-by-chosen-rows is the load-bearing concurrency bug PITFALLS
      // Pitfall 1 prevents.
      expect(source).not.toContain("db.transaction(");
      expect(source).not.toContain("pickPlan");
      expect(source).not.toContain("preallocate");
      expect(source).not.toContain("preAllocate");

      // Scope the `id IN (...)` anti-pattern check to the placeCheckoutOrder
      // body only — cancelOrder legitimately uses `id IN (SELECT id FROM
      // cancellable_order)` which is the unrelated cancel CTE pattern, not
      // the allocator. Extract from `export async function placeCheckoutOrder`
      // to the next top-level export to test only this function's SQL.
      const allocatorMatch = source.match(
        /export async function placeCheckoutOrder[\s\S]*?(?=\nexport (?:async )?function )/,
      );
      expect(allocatorMatch).toBeTruthy();
      const allocatorBody = allocatorMatch?.[0] ?? "";
      // Must NOT pre-pick rows in JS and lock by id IN (...) — that's the
      // load-bearing concurrency bug. The allocator locks by aggregated
      // join key (set_code, collector_number, finish, condition) instead.
      expect(allocatorBody).not.toMatch(/\bid IN \(/);
    });
  });
});
