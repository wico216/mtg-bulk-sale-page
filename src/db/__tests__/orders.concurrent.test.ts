/**
 * Phase 18 D-07: Multi-binder concurrent-proof tests against a real
 * Postgres database. Extends the Phase 11 baseline (single-binder
 * last-copy race) to the multi-binder case.
 *
 * **The single most important test in the milestone (per CONTEXT D-07).**
 * If it flakes, the load-bearing concurrency invariant — lock by the
 * aggregated key, never oversell, never partially fulfill — is broken.
 *
 * Run mode:
 *   - When `TEST_DATABASE_URL` is set, the suite runs against that
 *     database. Use a Neon test branch or a local Postgres; NEVER point
 *     at the production database — the tests INSERT, decrement, and
 *     DELETE rows.
 *   - When absent, the suite skips gracefully with a console.warn so CI
 *     and local-dev paths without a configured test DB don't fail noisily.
 *
 * The test isolates itself by:
 *   1. Using a unique `setCode = 'tst'` + a per-run `collectorNumber`
 *      so concurrent test runs don't collide.
 *   2. Cleaning up cards + order_items + orders rows in afterEach.
 *
 * Variant 1 (CONTEXT D-07 as-written, with corrected assertion):
 *   Seed (X, A02, 2) + (X, A05, 2) — total stock 4.
 *   Two parallel placeCheckoutOrder({ X: 3 }) calls (each requests 3).
 *   - Winner takes 3 from total 4 → 1 left.
 *   - Loser sees available=1, requested=3 → conflict, no decrement.
 *   - Final SUM(quantity) = 1.
 *   The CONTEXT D-07 wording "SUM = 0 afterward" is mathematically
 *   impossible with the as-written seeding (winner takes 3, loser
 *   conflicts; the loser cannot decrement under strict all-or-nothing).
 *   Documented in code comment + Task 7 SUMMARY deviations section.
 *
 * Variant 2 (D-07 spirit honoring SUM=0):
 *   Seed (X, A02, 2) + (X, A05, 1) — total stock 3.
 *   Two parallel placeCheckoutOrder({ X: 3 }) calls.
 *   - Winner takes 3 from total 3 → 0 left.
 *   - Loser sees available=0, requested=3 → conflict, no decrement.
 *   - Final SUM(quantity) = 0.
 *
 * Both variants assert: exactly 1 fulfilled-with-ok-true result, exactly
 * 1 fulfilled-with-stock_conflict result, conflict.cardId is the
 * 4-segment aggregated id (NEVER per-binder), conflict.available is the
 * SUM across binders.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

// Establish the test DB connection lazily so the module load doesn't pay
// the neon-http cost when the env var is absent. Using a separate URL
// from `DATABASE_URL` is intentional: never let test runs touch production.
//
// To enable locally:
//   TEST_DATABASE_URL=postgresql://... npx vitest run src/db/__tests__/orders.concurrent.test.ts

const SHOULD_RUN = Boolean(TEST_DB_URL);

if (!SHOULD_RUN) {
  // eslint-disable-next-line no-console
  console.warn(
    "[18-01 concurrent-proof] TEST_DATABASE_URL not set — skipping multi-binder concurrent-proof tests. To enable, set TEST_DATABASE_URL to a Neon test branch (NEVER point at production).",
  );
}

const describeIfDb = SHOULD_RUN ? describe : describe.skip;

describeIfDb("placeCheckoutOrder — multi-binder concurrent proof (D-07)", () => {
  // Lazy imports to avoid pulling in `db/client` (which throws on missing
  // DATABASE_URL) when the suite is skipped.
  let placeCheckoutOrder: typeof import("../orders").placeCheckoutOrder;
  let db: typeof import("../client").db;
  let cards: typeof import("../schema").cards;
  let orders: typeof import("../schema").orders;
  let orderItems: typeof import("../schema").orderItems;
  let sql: typeof import("drizzle-orm").sql;
  let eq: typeof import("drizzle-orm").eq;
  let inArray: typeof import("drizzle-orm").inArray;

  // Per-test unique aggregated key so concurrent test runs don't collide.
  // Generated fresh per test; collector_number embeds Date.now() + suffix.
  let testCollectorNumber: string;
  let aggregatedKey: string;
  const TEST_SET_CODE = "tst";
  const TEST_FINISH = "normal";
  const TEST_CONDITION = "near_mint";

  beforeAll(async () => {
    // Override the production DATABASE_URL with TEST_DATABASE_URL BEFORE
    // importing the db client, so neon-http connects to the test DB.
    process.env.DATABASE_URL = TEST_DB_URL;
    const ordersModule = await import("../orders");
    const clientModule = await import("../client");
    const schemaModule = await import("../schema");
    const drizzleOrm = await import("drizzle-orm");
    placeCheckoutOrder = ordersModule.placeCheckoutOrder;
    db = clientModule.db;
    cards = schemaModule.cards;
    orders = schemaModule.orders;
    orderItems = schemaModule.orderItems;
    sql = drizzleOrm.sql;
    eq = drizzleOrm.eq;
    inArray = drizzleOrm.inArray;
  });

  afterEach(async () => {
    if (!testCollectorNumber) return;
    // Cleanup: delete order_items first (FK), then orders, then cards.
    // Match by setCode + collectorNumber (unique per test run).
    const orderRows = await db.execute<{ id: string }>(sql`
      SELECT DISTINCT o.id
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.set_code = ${TEST_SET_CODE}
        AND oi.collector_number = ${testCollectorNumber}
    `);
    const orderIds = orderRows.rows.map((r) => r.id);
    if (orderIds.length > 0) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    await db.delete(cards).where(
      sql`${cards.setCode} = ${TEST_SET_CODE} AND ${cards.collectorNumber} = ${testCollectorNumber}`,
    );
  });

  /**
   * Variant 1 — CONTEXT D-07 as-written.
   *
   * NOTE on CONTEXT D-07 deviation: the original CONTEXT scenario is
   * `(X,A02,2)+(X,A05,2)` (total=4) with two parallel `×3` requests, and
   * asserts final `SUM=0`. That assertion is mathematically inconsistent
   * with strict all-or-nothing (D-05): the winner takes 3 from 4, the
   * loser conflicts and does NOT decrement, so final SUM=1 (not 0).
   * This test implements the corrected SUM=1 assertion and documents
   * the deviation in Task 7 SUMMARY. Variant 2 below honors the D-07
   * SUM=0 spirit with seeding that mathematically produces SUM=0.
   */
  it("two concurrent buyers ×3 against (A02:2 + A05:2) → 1 success + 1 conflict; SUM=1 (corrected from CONTEXT D-07 SUM=0)", async () => {
    testCollectorNumber = `v1-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    aggregatedKey = `${TEST_SET_CODE}-${testCollectorNumber}-${TEST_FINISH}-${TEST_CONDITION}`;

    // Seed (X, A02, 2) + (X, A05, 2). Total stock 4.
    const a02Id = `${aggregatedKey}-a02`;
    const a05Id = `${aggregatedKey}-a05`;
    await db.insert(cards).values([
      {
        id: a02Id,
        name: `Test Card ${testCollectorNumber}`,
        setCode: TEST_SET_CODE,
        setName: "Test Set",
        collectorNumber: testCollectorNumber,
        condition: TEST_CONDITION,
        finish: TEST_FINISH,
        binder: "a02",
        rarity: "common",
        quantity: 2,
        price: 100,
      },
      {
        id: a05Id,
        name: `Test Card ${testCollectorNumber}`,
        setCode: TEST_SET_CODE,
        setName: "Test Set",
        collectorNumber: testCollectorNumber,
        condition: TEST_CONDITION,
        finish: TEST_FINISH,
        binder: "a05",
        rarity: "common",
        quantity: 2,
        price: 100,
      },
    ]);

    // Fire two parallel checkout calls. allSettled handles either path
    // (success or rejection) — though placeCheckoutOrder shouldn't reject
    // on stock_conflict (it returns ok:false), this defends against
    // CHECK-constraint trips landing as exceptions.
    const orderRefBase = `ORD-D07V1-${Date.now()}`;
    const results = await Promise.allSettled([
      placeCheckoutOrder({
        orderRef: `${orderRefBase}-A`,
        buyerName: "Buyer A",
        buyerEmail: "a@example.com",
        items: [{ cardId: aggregatedKey, quantity: 3 }],
      }),
      placeCheckoutOrder({
        orderRef: `${orderRefBase}-B`,
        buyerName: "Buyer B",
        buyerEmail: "b@example.com",
        items: [{ cardId: aggregatedKey, quantity: 3 }],
      }),
    ]);

    // Exactly two fulfilled, zero rejected.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBe(0);
    expect(fulfilled.length).toBe(2);

    // Exactly one ok:true and one ok:false (stock_conflict).
    const okValues = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof placeCheckoutOrder>>>).value,
    );
    const successes = okValues.filter((v) => v.ok);
    const conflicts = okValues.filter((v) => !v.ok);
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);

    // Loser's conflict shape: cardId is the 4-segment aggregated id (NEVER
    // per-binder); requested=3; available=1 (SUM across binders AFTER the
    // winner decremented).
    const conflict = conflicts[0];
    if (conflict.ok) throw new Error("conflict should be ok:false");
    expect(conflict.code).toBe("stock_conflict");
    expect(conflict.conflicts.length).toBe(1);
    expect(conflict.conflicts[0].cardId).toBe(aggregatedKey);
    expect(conflict.conflicts[0].cardId.split("-").length).toBe(4);
    expect(conflict.conflicts[0].requested).toBe(3);
    expect(conflict.conflicts[0].available).toBe(1);

    // Winner's order has 2 items from binders a02 + a05 (smallest-first +
    // lex tiebreak picks a02:2 first, then a05:1).
    const success = successes[0];
    if (!success.ok) throw new Error("success should be ok:true");
    expect(success.order.items.length).toBe(2);
    expect(success.order.items[0].binder).toBe("a02");
    expect(success.order.items[0].quantity).toBe(2);
    expect(success.order.items[1].binder).toBe("a05");
    expect(success.order.items[1].quantity).toBe(1);

    // Final stock SUM. Winner took 3 from total 4 → 1 remains.
    // Loser did NOT decrement (strict all-or-nothing).
    const sumResult = await db.execute<{ total: number | string }>(sql`
      SELECT COALESCE(SUM(quantity), 0)::integer AS total
      FROM cards
      WHERE set_code = ${TEST_SET_CODE}
        AND collector_number = ${testCollectorNumber}
        AND finish = ${TEST_FINISH}::finish
        AND condition = ${TEST_CONDITION}
    `);
    const finalSum =
      typeof sumResult.rows[0]?.total === "number"
        ? sumResult.rows[0].total
        : parseInt(String(sumResult.rows[0]?.total ?? "0"), 10);
    expect(finalSum).toBe(1);
  });

  /**
   * Variant 2 — Honors the CONTEXT D-07 SUM=0 spirit with seeding that
   * makes SUM=0 mathematically correct.
   */
  it("two concurrent buyers ×3 against (A02:2 + A05:1) → 1 success + 1 conflict; SUM=0 (D-07 spirit)", async () => {
    testCollectorNumber = `v2-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    aggregatedKey = `${TEST_SET_CODE}-${testCollectorNumber}-${TEST_FINISH}-${TEST_CONDITION}`;

    // Seed (X, A02, 2) + (X, A05, 1). Total stock 3.
    await db.insert(cards).values([
      {
        id: `${aggregatedKey}-a02`,
        name: `Test Card ${testCollectorNumber}`,
        setCode: TEST_SET_CODE,
        setName: "Test Set",
        collectorNumber: testCollectorNumber,
        condition: TEST_CONDITION,
        finish: TEST_FINISH,
        binder: "a02",
        rarity: "common",
        quantity: 2,
        price: 100,
      },
      {
        id: `${aggregatedKey}-a05`,
        name: `Test Card ${testCollectorNumber}`,
        setCode: TEST_SET_CODE,
        setName: "Test Set",
        collectorNumber: testCollectorNumber,
        condition: TEST_CONDITION,
        finish: TEST_FINISH,
        binder: "a05",
        rarity: "common",
        quantity: 1,
        price: 100,
      },
    ]);

    const orderRefBase = `ORD-D07V2-${Date.now()}`;
    const results = await Promise.allSettled([
      placeCheckoutOrder({
        orderRef: `${orderRefBase}-A`,
        buyerName: "Buyer A",
        buyerEmail: "a@example.com",
        items: [{ cardId: aggregatedKey, quantity: 3 }],
      }),
      placeCheckoutOrder({
        orderRef: `${orderRefBase}-B`,
        buyerName: "Buyer B",
        buyerEmail: "b@example.com",
        items: [{ cardId: aggregatedKey, quantity: 3 }],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBe(0);
    expect(fulfilled.length).toBe(2);

    const okValues = fulfilled.map(
      (r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof placeCheckoutOrder>>>).value,
    );
    const successes = okValues.filter((v) => v.ok);
    const conflicts = okValues.filter((v) => !v.ok);
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);

    const conflict = conflicts[0];
    if (conflict.ok) throw new Error("conflict should be ok:false");
    expect(conflict.code).toBe("stock_conflict");
    expect(conflict.conflicts[0].cardId).toBe(aggregatedKey);
    expect(conflict.conflicts[0].cardId.split("-").length).toBe(4);
    expect(conflict.conflicts[0].requested).toBe(3);
    expect(conflict.conflicts[0].available).toBe(0);

    const success = successes[0];
    if (!success.ok) throw new Error("success should be ok:true");
    // Winner takes a02:2 + a05:1 = 3.
    expect(success.order.items.length).toBe(2);
    expect(
      success.order.items.reduce((s, it) => s + it.quantity, 0),
    ).toBe(3);

    // Final stock SUM = 0 (winner emptied both binder rows).
    const sumResult = await db.execute<{ total: number | string }>(sql`
      SELECT COALESCE(SUM(quantity), 0)::integer AS total
      FROM cards
      WHERE set_code = ${TEST_SET_CODE}
        AND collector_number = ${testCollectorNumber}
        AND finish = ${TEST_FINISH}::finish
        AND condition = ${TEST_CONDITION}
    `);
    const finalSum =
      typeof sumResult.rows[0]?.total === "number"
        ? sumResult.rows[0].total
        : parseInt(String(sumResult.rows[0]?.total ?? "0"), 10);
    expect(finalSum).toBe(0);
  });
});
