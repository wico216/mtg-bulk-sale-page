# Architecture Research — v1.3 Binder-Aware Inventory & Pick Workflow

**Domain:** Schema/composite-PK migration + multi-source allocator on top of an existing Next.js + Drizzle + Neon HTTP store
**Researched:** 2026-05-10
**Confidence:** HIGH (verified against the existing source: `src/db/schema.ts`, `src/db/queries.ts`, `src/db/orders.ts`, `src/lib/csv-parser.ts`, `src/lib/store/cart-store.ts`, `src/app/cart/cart-page-client.tsx`, `src/app/api/admin/import/{preview,commit}/route.ts`, `package.json`, `drizzle.config.ts`, and the git history of phases 13/14/15)

---

## Existing Architecture (snapshot, not new research)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Browser (Buyer + Admin)                              │
│  ┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────┐    │
│  │ StorefrontShell  │    │ Cart (Zustand +     │    │ Admin pages      │    │
│  │ (RSC tree)       │    │ localStorage)       │    │ (table, import)  │    │
│  │ key: cards.id    │    │ key: full composite │    │                  │    │
│  └────────┬─────────┘    └──────────┬──────────┘    └────────┬─────────┘    │
└───────────┼─────────────────────────┼─────────────────────────┼────────────┘
            ▼                         ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Next.js App Router (force-dynamic RSC + route handlers)    │
│  ┌────────────────┐  ┌───────────────┐  ┌────────────────────────────────┐  │
│  │ app/page.tsx   │  │ /api/checkout │  │ /api/admin/import/{preview,    │  │
│  │ getCards()     │  │ placeCheckout │  │ commit} + cards/[id] +         │  │
│  │ (full table)   │  │ Order()       │  │ orders/[id]/cancel + bulk-     │  │
│  │                │  │               │  │ delete                         │  │
│  └────────┬───────┘  └───────┬───────┘  └──────────────┬─────────────────┘  │
└───────────┼──────────────────┼─────────────────────────┼───────────────────┘
            ▼                  ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│         Data layer  —  src/db/queries.ts + src/db/orders.ts                 │
│  ┌──────────────────────────┐  ┌────────────────────────────────────────┐   │
│  │ replaceAllCards():       │  │ placeCheckoutOrder() — single CTE      │   │
│  │  db.batch([delete+insert │  │  chain inside db.execute(): requested  │   │
│  │  +audit+importHistory])  │  │  → locked_cards FOR UPDATE → conflicts │   │
│  │  (Neon HTTP atomic batch)│  │  → stock_write → inserted_order →      │   │
│  │                          │  │  inserted_items → JSON result          │   │
│  └────────────┬─────────────┘  └────────────────────┬───────────────────┘   │
└───────────────┼──────────────────────────────────────┼─────────────────────┘
                ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Neon Postgres (HTTP transport)                         │
│  cards (PK = `setCode-collectorNumber-foil-condition`)                      │
│  orders, order_items, admin_audit_log, import_history, rate_limit_hits      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Existing Component Responsibilities

| Component | Responsibility | Implementation Today |
|---|---|---|
| `cards.id` | Composite PK string | `${setCode}-${collectorNumber}-${foil ? "foil" : "normal"}-${condition}` — built in `src/lib/csv-parser.ts:91` and `src/db/seed.ts:cardToRow` |
| `parseManaboxCsvContents` | Parse N CSVs, dedupe by composite ID, return `{cards, skippedRows, sourceFiles}` | `src/lib/csv-parser.ts:256` |
| `replaceAllCards` | Atomic full-replace via `db.batch([delete, insert, audit, importHistory])` | `src/db/queries.ts:809` — note: uses **`db.batch`** specifically because `neon-http` does **NOT** support interactive transactions (commented at `:801-808`) |
| `placeCheckoutOrder` | Single CTE chain doing `FOR UPDATE` lock → conflict detect → decrement → order insert → order_items insert → JSON return | `src/db/orders.ts:350-533` |
| `cancelOrder` | Single CTE chain doing optional inventory restore via `UPDATE cards FROM items_for_restore` | `src/db/orders.ts:677-814` |
| Cart store | Zustand `Map<string, number>` keyed on `cards.id`, persisted to localStorage as `viki-cart` with custom Map replacer/reviver | `src/lib/store/cart-store.ts` |
| Silent reconciliation | `cart-page-client.tsx:40-47` — after hydration, walks `items` and `removeItem(cardId)` for any ID not in `cardMap`. Established in commit `dec5dbe` (Phase 10-03 D-13) |
| Migration mechanism | **No `drizzle/` directory exists.** `package.json` has `drizzle-kit` as dev dep but no `db:generate` or `db:push` script. Schema changes are manually pushed (likely `npx drizzle-kit push`) | `drizzle.config.ts` outputs to `./drizzle` but the dir is empty |

### Key existing decisions that constrain v1.3

1. **Neon HTTP driver, no interactive transactions.** Source-of-truth comment in `queries.ts:802-806`: *"drizzle-orm/neon-http does not support interactive transactions… db.batch() is routed through Neon's HTTP transaction() endpoint and is atomic end-to-end."* This rules out pattern (3a) JS-side `SELECT FOR UPDATE → application logic → UPDATE` for the allocator unless we accept losing atomicity.
2. **`force-dynamic` RSC catalog.** `src/app/page.tsx:5` — every storefront pageview re-queries the full cards table. Aggregation cost per request is real.
3. **Schema-push history (no migration files).** Phases 13, 14, and 15 all mutated `schema.ts` directly. There are zero `*.sql` files under `/drizzle/`. The team's mental model is: "edit `schema.ts`, push, ship." We need to honor that.
4. **denormalized `order_items.card_id` (no FK).** `schema.ts:184` comment: *"NO FK to cards — denormalized, survives re-imports."* This means historical order_items will keep referring to old composite IDs after migration; nothing breaks.

---

## Question 1 — Schema Migration Approach

### Recommendation: Hybrid of (a) and the existing push pattern. Three statements, one `db.batch`.

**Pattern: `ADD COLUMN nullable → backfill → make NOT NULL + DEFAULT → swap PK`** — but executed as a single Drizzle `db.batch([sql\`...\`, sql\`...\`])` so all four statements commit together via Neon's HTTP transaction endpoint.

**Why not (b) "create new table, copy, swap":**
- The CTE-chain checkout in `orders.ts` references the table name `cards` directly (line 380). Swapping tables means coordinating a rename + re-pointing every CTE; risky on a live store.
- `order_items` has no FK to `cards`, so a table rename doesn't cascade — but `import_history` and `admin_audit_log` reference `cards` implicitly through audit metadata. Cleaner to keep the same table.
- 12,749 rows × 30 binders is small for Postgres; in-place ALTER is fast (sub-second).

**Why not the literal (a) "two-step nullable migration":**
- The team's existing pattern (Phase 13: added `admin_note` nullable; Phase 14: added two whole tables) is "edit schema.ts, push." There is **no precedent for staged production migrations** in this codebase. Two-step migrations introduce a new operational pattern the team doesn't have habits for.
- Production DB has only 12,749 rows. The window where `binder` is nullable + half the code references it is purely a vector for bugs.

**Why the hybrid wins:**

```sql
-- Step 1: Add column with default + NOT NULL in one ALTER (Postgres-supported).
--         Default fires for every existing row in one rewrite.
ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted';

-- Step 2: Drop the old PK constraint (keeps the rows, drops the index).
ALTER TABLE cards DROP CONSTRAINT cards_pkey;

-- Step 3: Rebuild the PK string column to include binder. Two options:
--   (3a) If `id` will continue to be the literal composite — easier & matches today's pattern:
UPDATE cards
   SET id = id || '-' || binder
 WHERE binder IS NOT NULL;  -- always true after step 1, but keep the predicate explicit

--   (3b) Or: switch to a multi-column composite PK and drop the synthetic id entirely.
--   We RECOMMEND staying with (3a) because:
--     - order_items.cardId is a `text` snapshot already — no schema break
--     - replaceAllCards/CTE-chain use `cards.id` directly, no rewrite
--     - The cart key shift in Q4 is a separate concern from PK shape

-- Step 4: Re-add the PK on the (now-unique) string id.
ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id);
```

**Drizzle execution path:**

Run all four steps in a single `db.batch([...])` call. Neon's HTTP transaction endpoint commits or rolls back the whole batch (same proof point as `replaceAllCards` in `queries.ts:809-861`). Then update `schema.ts` to add `binder: text("binder").notNull().default("unsorted")` so future `drizzle-kit push` runs converge.

```typescript
// scripts/migrate-binder.ts (one-shot, run once before deploying v1.3 code)
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

await db.batch([
  db.execute(sql`ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'`),
  db.execute(sql`ALTER TABLE cards DROP CONSTRAINT cards_pkey`),
  db.execute(sql`UPDATE cards SET id = id || '-' || binder`),
  db.execute(sql`ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id)`),
]);
```

> **NOTE on `db.batch` constraint type-mismatch:** `db.batch` from `neon-http` typically expects relational queries. For raw `db.execute(sql\`...\`)` calls inside a batch, fall back to a single multi-statement raw SQL through `db.execute(sql\`BEGIN; ALTER…; ALTER…; UPDATE…; ALTER…; COMMIT;\`)` if the batch typings reject. The Neon HTTP driver supports multi-statement SQL in one round trip.

**Pre-flight verification (do before running):**

```sql
-- Sanity check: no row will collide after the binder suffix is appended
-- (every row gets the same '-unsorted' suffix, so any collision means a
-- pre-existing duplicate in the current PK — should be impossible but verify).
SELECT id, COUNT(*) FROM cards GROUP BY id HAVING COUNT(*) > 1;
```

**Rollback path:** Take a Neon point-in-time snapshot before running the migration script. Neon's branch feature makes this a one-click action; no need to script reverse migrations. Document this in the phase plan.

**Confidence:** HIGH. The single-`db.batch` pattern is exactly how `replaceAllCards` already operates (verified in source).

---

## Question 2 — Storefront Aggregation Query

### Recommendation: SQL `GROUP BY` in a new `getCardsAggregated()` query. Do NOT change `getCards()`.

**Why a new function, not edit `getCards()`:**
- `getCards()` is also called by `cart-page-client.tsx:34` (via the `cards` prop on `app/cart/page.tsx`) and `app/checkout/page.tsx`. Those need the **disaggregated** rows for stock validation and admin views. Two functions, two semantics.
- `rowToCard()` returns `Card`, but the aggregated output has different identity (no `binder`, sums `quantity`). Inventing a new `AggregatedCard` type protects the type system.

### The SQL pattern

```sql
-- getCardsAggregated() — what the storefront sees
SELECT
  -- Synthetic aggregated id (matches the new cart key)
  set_code || '-' || collector_number ||
    '-' || (CASE WHEN foil THEN 'foil' ELSE 'normal' END) ||
    '-' || condition                                            AS id,
  set_code,
  collector_number,
  foil,
  condition,
  -- Pick a representative for fields that don't vary by binder. They DON'T
  -- vary because they come from Scryfall enrichment keyed on (set_code,
  -- collector_number) — name/setName/colorIdentity/imageUrl/oracleText/
  -- rarity/scryfallId are identical across binder rows of the same card.
  MAX(name)             AS name,
  MAX(set_name)         AS set_name,
  MAX(price)            AS price,        -- price is per (set, collector, foil, condition); identical across binders
  MAX(image_url)        AS image_url,
  MAX(oracle_text)      AS oracle_text,
  MAX(rarity)           AS rarity,
  MAX(scryfall_id)      AS scryfall_id,
  -- Aggregate over binders
  SUM(quantity)::integer AS quantity,
  -- Color identity: arrays don't aggregate cleanly with MAX. They're
  -- identical-across-binders (Scryfall-derived), so just take the first.
  (ARRAY_AGG(color_identity ORDER BY binder))[1] AS color_identity,
  -- Distinct binder list — admin reuses this same query for the inventory
  -- table's "binders for this card" cell. Storefront ignores it.
  ARRAY_AGG(DISTINCT binder ORDER BY binder)     AS binders,
  MAX(updated_at)        AS updated_at,
  MIN(created_at)        AS created_at
FROM cards
GROUP BY set_code, collector_number, foil, condition
ORDER BY MAX(name) ASC;
```

### Performance at production scale (12,749 rows × 30 binders)

12,749 cards is the **post-aggregation** count. With 30 binders and partial overlap, the underlying table is at most ~30 × 12,749 = ~382k rows in the absolute worst case — realistically much lower because most cards live in only one binder. Even at 400k rows, an unindexed sequential scan + hash aggregate in Postgres on Neon completes in single-digit milliseconds. **No pagination, no caching, no materialized view needed for this scale.**

**Verification path:** Run `EXPLAIN ANALYZE` on the query post-import. If hash aggregate cost > 50ms, add a covering index:
```sql
CREATE INDEX cards_aggregation_idx
  ON cards (set_code, collector_number, foil, condition)
  INCLUDE (quantity, binder, price, name, image_url);
```
Don't add this preemptively — it slows every UPDATE during checkout.

### Why SQL not app-code GROUP BY

| Concern | SQL `GROUP BY` | App-code `Map`-reduce |
|---|---|---|
| Network bytes (HTTP transport) | ~12.7k aggregated rows | ~382k raw rows worst case (30× larger payload) |
| Memory in serverless function | Single result set | Build full row array + Map |
| Cold-start cost | Neon does the work pre-warm | Lambda has to allocate + iterate |
| Code complexity | One query, typed result | Bookkeeping logic, easy to drift |

The Neon HTTP round-trip cost dominates everything else; sending 30× more rows is the hot path to fix. Do it in SQL.

### Drizzle implementation

```typescript
// src/db/queries.ts
import { sql } from "drizzle-orm";

export interface AggregatedCard extends Omit<Card, "binder"> {
  /** All binders this aggregated card is sourced from. Empty if none. */
  binders: string[];
}

export async function getCardsAggregated(): Promise<AggregatedCard[]> {
  const result = await db.execute<AggregatedCardRow>(sql`
    SELECT
      set_code || '-' || collector_number ||
        '-' || (CASE WHEN foil THEN 'foil' ELSE 'normal' END) ||
        '-' || condition                                  AS "id",
      set_code                                            AS "setCode",
      collector_number                                    AS "collectorNumber",
      MAX(name)                                           AS "name",
      MAX(set_name)                                       AS "setName",
      MAX(price)                                          AS "price",
      condition,
      foil,
      SUM(quantity)::integer                              AS "quantity",
      (ARRAY_AGG(color_identity ORDER BY binder))[1]      AS "colorIdentity",
      MAX(image_url)                                      AS "imageUrl",
      MAX(oracle_text)                                    AS "oracleText",
      MAX(rarity)                                         AS "rarity",
      MAX(scryfall_id)                                    AS "scryfallId",
      ARRAY_AGG(DISTINCT binder ORDER BY binder)          AS "binders",
      MAX(updated_at)                                     AS "updatedAt",
      MIN(created_at)                                     AS "createdAt"
    FROM cards
    GROUP BY set_code, collector_number, foil, condition
    ORDER BY MAX(name) ASC
  `);
  return result.rows.map(rowToAggregatedCard);
}
```

`app/page.tsx` swaps `getCards()` → `getCardsAggregated()`. `app/cart/page.tsx` and `app/checkout/page.tsx` keep `getCards()` — they need to render the buyer's cart against the aggregated `id`, which they can do because the synthesized `id` follows the same scheme as the cart key (Q4).

**Confidence:** HIGH.

---

## Question 3 — Allocator Integration with Existing CTE-Chain Checkout

### Recommendation: Pure SQL allocator inside the existing CTE chain. Pattern (3b).

**Why pattern (3a) is rejected outright:** The Neon HTTP driver does not support interactive transactions (proof: `queries.ts:802-806` comment). A JS-side `SELECT FOR UPDATE → think → UPDATE` cannot be atomic on this driver — the SELECT and UPDATE would be separate HTTP round trips, each its own implicit single-statement transaction. The lock from `FOR UPDATE` is released the moment the SELECT statement returns. Concurrent checkouts would then race exactly as they do without any locking. **This is a correctness blocker, not a performance trade-off.**

The current `placeCheckoutOrder` already proves the pattern works for non-trivial allocation logic in a single CTE chain. We extend it.

### The allocator CTE

The buyer line is `(set_code, collector_number, foil, condition, quantity)` — keyed on the **aggregated** identity. The allocator must:

1. Find every binder row that matches `(set_code, collector_number, foil, condition)`, locked.
2. Order them deterministically (binder name ASC, so allocation is reproducible across concurrent checkouts trying to lock the same row set).
3. Use a window function to compute the running total.
4. Take rows until running total ≥ requested quantity.
5. For the last row, take only `requested - prior_running_total` (the remainder).
6. UPDATE each chosen row's quantity. INSERT one `order_items` row per chosen binder.
7. If any line cannot be filled (sum of available across all binder rows < requested), report it as a `stock_conflict` and roll back.

**Conceptual SQL (pseudocode for the allocator subtree of the existing CTE chain):**

```sql
WITH requested(set_code, collector_number, foil, condition, requested_qty) AS (
  VALUES (...)  -- buyer's lines, aggregated cart key
),
-- Lock every binder row that could supply any requested line.
locked_rows AS (
  SELECT cards.*,
         ROW_NUMBER() OVER (
           PARTITION BY set_code, collector_number, foil, condition
           ORDER BY binder ASC
         ) AS bucket_rank,
         SUM(quantity) OVER (
           PARTITION BY set_code, collector_number, foil, condition
           ORDER BY binder ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_supply,
         SUM(quantity) OVER (
           PARTITION BY set_code, collector_number, foil, condition
         ) AS total_supply
  FROM cards
  INNER JOIN requested USING (set_code, collector_number, foil, condition)
  ORDER BY set_code, collector_number, foil, condition, binder
  FOR UPDATE OF cards         -- explicit table reference: the locks attach to cards
),
-- Detect under-stocked aggregated lines BEFORE deciding allocations.
conflicts AS (
  SELECT r.set_code, r.collector_number, r.foil, r.condition,
         COALESCE(MAX(l.total_supply), 0) AS available,
         r.requested_qty AS requested,
         COALESCE(MAX(l.name), '?')      AS name
  FROM requested r
  LEFT JOIN locked_rows l USING (set_code, collector_number, foil, condition)
  GROUP BY r.set_code, r.collector_number, r.foil, r.condition, r.requested_qty
  HAVING COALESCE(MAX(l.total_supply), 0) < r.requested_qty
),
can_fulfill AS (SELECT NOT EXISTS (SELECT 1 FROM conflicts) AS ok),
-- Allocate. For each (aggregated_key, binder) row, take exactly:
--   min(quantity, max(0, requested_qty - prior_running_supply))
-- where prior_running_supply = running_supply - quantity (this row's contribution).
allocations AS (
  SELECT l.id AS card_id,
         l.binder,
         l.name,
         l.set_name,
         l.set_code,
         l.collector_number,
         l.condition,
         l.price,
         l.image_url,
         LEAST(
           l.quantity,
           GREATEST(0, r.requested_qty - (l.running_supply - l.quantity))
         ) AS take_qty
  FROM locked_rows l
  INNER JOIN requested r USING (set_code, collector_number, foil, condition)
  CROSS JOIN can_fulfill
  WHERE can_fulfill.ok
),
-- Drop zero-take rows (binders past the cumulative requested threshold).
nonzero_allocations AS (
  SELECT * FROM allocations WHERE take_qty > 0
),
-- Decrement the chosen rows.
stock_write AS (
  UPDATE cards
     SET quantity = cards.quantity - nz.take_qty,
         updated_at = now()
    FROM nonzero_allocations nz
   WHERE cards.id = nz.card_id
   RETURNING cards.id
),
-- Same write-check sentinel as today.
write_check AS (
  SELECT (SELECT ok FROM can_fulfill)
     AND (SELECT COUNT(*) FROM stock_write) = (SELECT COUNT(*) FROM nonzero_allocations)
     AS ok
),
order_totals AS (
  SELECT SUM(nz.take_qty)::integer AS total_items,
         COALESCE(SUM(COALESCE(nz.price, 0) * nz.take_qty), 0)::integer AS total_price
    FROM nonzero_allocations nz
),
inserted_order AS (
  INSERT INTO orders (...)
  SELECT ... FROM order_totals, write_check WHERE write_check.ok
  RETURNING ...
),
-- Insert ONE order_items row per (binder source) — so admin order detail can
-- show "Lightning Bolt × 3 — 2 from Binder A, 1 from Binder B".
inserted_items AS (
  INSERT INTO order_items (
    order_id, card_id, name, set_name, set_code, collector_number,
    condition, price, quantity, line_total, image_url, binder
  )
  SELECT
    inserted_order.id,
    nz.card_id,                  -- this is the binder-suffixed row id
    nz.name, nz.set_name, nz.set_code, nz.collector_number, nz.condition,
    nz.price, nz.take_qty,
    CASE WHEN nz.price IS NULL THEN NULL ELSE nz.price * nz.take_qty END,
    nz.image_url,
    nz.binder
  FROM inserted_order, nonzero_allocations nz
  RETURNING ...
)
SELECT jsonb_build_object(...);  -- same shape as today
```

### Concurrency analysis

**Question:** What happens when two buyers checkout the same aggregated card at the same time, and the binder rows would supply exactly enough for one but not both?

**Answer:** Postgres's `FOR UPDATE` row-locks resolve it correctly — but only because we lock **all** rows for the aggregated key, not just the ones we want to take.

Walk-through, two concurrent transactions T1 and T2, each requesting Lightning Bolt × 3:

```
Initial state:
  cards: (LB, binder=A, qty=2), (LB, binder=B, qty=2), (LB, binder=C, qty=2)
  Total available = 6, requested by each = 3.

T1 begins:
  locked_rows CTE acquires FOR UPDATE locks on all 3 LB rows.
  Allocates: A=2, B=1 (3 total). Decrements: A→0, B→1, C=2.
  Order placed. Row locks released on COMMIT.

T2 begins (was waiting on the FOR UPDATE lock for the duration of T1):
  locked_rows CTE re-reads the now-decremented rows: A=0, B=1, C=2.
  total_supply = 3 ≥ 3 → no conflict, can_fulfill.ok = true.
  Allocates: A=0 (skip — take_qty=0), B=1, C=2 (3 total). Decrements.
  Order placed.

Final state:
  cards: (LB, A, 0), (LB, B, 0), (LB, C, 0). Each got one of the 6.
```

Walk-through where the second buyer is short:
```
Initial state:
  (LB, A, 2), (LB, B, 1). Total available = 3.
  T1 requests 2, T2 requests 2.

T1 acquires locks. Allocates: A=2 (or A=1, B=1; either is fine — see "fairness" below).
  Suppose: A=2, B unchanged. Final: (A, 0), (B, 1).
T2 acquires locks (after T1 commits). Re-reads: total_supply = 1 < 2.
  conflicts CTE has 1 row → can_fulfill.ok = false.
  No stock_write happens. Order insert blocked. Returns stock_conflict.
  T2's UI shows "Only 1 available."
```

Both outcomes are correct: total stock is conserved, no oversells, no deadlocks (because every transaction locks rows in the same order: binder ASC).

### "Fairness" of binder selection

We allocate **binder A first, then B, then C** because of `ORDER BY binder ASC`. This is intentional and gives the operator predictable behavior: "When you pull an order for Lightning Bolt × 3, check Binder A first, then B, then C." If the operator wants different ordering (e.g. "deplete unsorted binder first to clean it out"), the `ORDER BY` clause is one line to change. Document this as a Key Decision.

### Stock conflict response shape (must change)

Today's `StockConflict` is keyed on `cardId` — a single composite ID. With binder allocation, the conflict is reported on the **aggregated** key (the cart's view of the world), not a binder-specific row. The conflict shape becomes:

```typescript
export interface StockConflict {
  cardId: string;           // The AGGREGATED id matching the cart key
  name: string;
  requested: number;
  available: number;        // Sum across binder rows for this aggregated key
}
```

This is shape-compatible with today's caller (`StockConflict` interface in `src/lib/types.ts:110-115`) — only the **meaning** of `cardId` shifts from "row id" to "aggregated id." The cart UI doesn't care; it already shows "Only N available."

**Confidence:** HIGH for the SQL pattern (this is a standard Postgres window-function allocation; the existing checkout already proves the CTE-chain pattern works on Neon HTTP). MEDIUM for the exact `LEAST(quantity, GREATEST(0, requested - prior_running))` arithmetic — recommend a unit test fixture: `(2, 2, 2)` × 3 = `[2, 1, 0]`, `(2, 2, 2)` × 5 = `[2, 2, 1]`, `(2, 2, 2)` × 6 = `[2, 2, 2]`, `(2, 2, 2)` × 7 = conflict.

---

## Question 4 — Cart Key Shift Migration

### Recommendation: Lean on the existing silent-reconciliation mechanism. Add a one-time key-normalization pass on hydration.

**Where to add it:** `src/app/cart/cart-page-client.tsx`, in the existing `useEffect` that already handles hydration + stale-key removal (`:40-47`). Two-line addition.

**Why this is the right shape:**
- The Phase 10-03 silent-reconciliation pattern (commit `dec5dbe`) already handles "cart key not in current inventory → silent removal." It runs on every cart page mount, post-hydration. Buyers expect their cart to silently shrink across imports — it's the established UX contract.
- The shift from `setCode-collectorNumber-foil-condition-binder` → `setCode-collectorNumber-foil-condition` is **deterministic and reversible from the old key**. We can map old → new by stripping the trailing `-{binder}` segment.
- After the v1.3 deploy, every storefront card has the new aggregated `id`. Old keys silently fail the `cardMap.has(cardId)` check and get removed — but the buyer loses their cart. Bad UX even if technically working.

### The migration code

```typescript
// src/app/cart/cart-page-client.tsx
useEffect(() => {
  if (!hydrated) return;

  // v1.3 cart key migration. The old composite was 5 segments:
  //   `${setCode}-${collectorNumber}-${foil}-${condition}-${binder}`
  // Storefront now exposes 4-segment aggregated ids:
  //   `${setCode}-${collectorNumber}-${foil}-${condition}`
  //
  // For any cart entry whose key is NOT in cardMap, try the same key with the
  // last `-{token}` stripped. If that exists in cardMap, transfer the qty
  // there. Otherwise, fall through to the existing silent-removal path.
  for (const [cardId, qty] of items) {
    if (cardMap.has(cardId)) continue;

    const lastDash = cardId.lastIndexOf("-");
    if (lastDash > 0) {
      const aggregatedCandidate = cardId.slice(0, lastDash);
      if (cardMap.has(aggregatedCandidate)) {
        // Migrate this entry. Use setQuantity so we respect maxStock.
        const max = cardMap.get(aggregatedCandidate)?.quantity;
        const existing = items.get(aggregatedCandidate) ?? 0;
        setQuantity(aggregatedCandidate, Math.min(existing + qty, max ?? Infinity));
      }
    }
    removeItem(cardId);  // silent-drop the old key (existing behavior)
  }
}, [hydrated, items, cardMap, removeItem, setQuantity]);
```

**Why not a Zustand `migrate` hook on the persisted store:**
Zustand's `persist` middleware does support a `version`/`migrate` pair, but the migration would need access to the live `cardMap` to know which aggregated id to map to (the old composite included `binder`, but the buyer-side store has no idea which binders survived). The migrate hook only sees the localStorage state; it can't query `cardMap`. The reconciliation **must** run after both hydration and `cardMap` is built — i.e. exactly where it lives today.

**Edge cases:**
1. **Buyer had the same card across two binders in cart.** Old keys: `lb-100-normal-near_mint-A` qty 2, `lb-100-normal-near_mint-B` qty 1. Both reconcile to `lb-100-normal-near_mint`. The loop adds them: qty 3 (capped at the new aggregated stock). Correct.
2. **Buyer's last segment looks like a binder but isn't (collision).** Composite IDs go `setCode-collectorNumber-foil-condition`. `condition` values are strings like `"near_mint"`, `"lightly_played"`. None contain a hyphen unless someone re-introduces them — but `foil` is `"foil" | "normal"` and `binder` is freeform user text including possible hyphens. **Risk:** if a binder name contains a `-`, the lastIndexOf strip eats only the last segment, leaving e.g. `lb-100-normal-near_mint-Modern` instead of `lb-100-normal-near_mint`. Mitigate by validating binder names at import (reject hyphens, or replace with `_`) **OR** by counting segments instead of stripping `lastIndexOf`:
   ```typescript
   const segs = cardId.split("-");
   if (segs.length === 5) {
     const aggregatedCandidate = segs.slice(0, 4).join("-");
   }
   ```
   But `setCode` itself can contain hyphens (e.g. `pre`, `pset`, sometimes promo set codes are like `psld` or `j25`). Hyphens in **set codes** make any segment-counting unreliable. Recommend: at import time, sanitize binder names — replace any `-` with `_` and warn the operator. Document the constraint in the import preview UI.
3. **Buyer hit /cart for the first time after the deploy with no localStorage `viki-cart` entry at all.** Reconciliation no-ops. Correct.
4. **Buyer is mid-checkout (on `/checkout` page) when the deploy happens.** Old cart keys POST to `/api/checkout` with stale IDs. The CTE chain's `requested_agg` does an INNER JOIN on `cards.id` — old IDs find no rows → conflict → cart bumps to 0. UX: stock_conflict toast → buyer redirected to cart → reconciliation runs → cart re-keyed → re-checkout succeeds. **This is acceptable but worth noting in the verification plan.**

**Confidence:** HIGH for the pattern (it's the same shape as the existing reconciliation). MEDIUM for the binder-name-with-hyphen edge case — recommend a phase-level decision on the sanitization approach.

---

## Question 5 — Audit and Import-History Changes

### Recommendation: NO new tables. NO new top-level columns on `admin_audit_log` or `import_history`. Use the existing `metadata` JSONB on both. ONE new column on `order_items` (binder snapshot).

### Reasoning

`admin_audit_log.metadata` and `import_history.metadata` are both `jsonb NOT NULL DEFAULT '{}'::jsonb` (`schema.ts:72-75, 100-103`). They were designed (Phase 14) as the unbounded extension surface — the `sanitizeAdminAuditMetadata` helper at `queries.ts:277-288` already truncates to 4KB and redacts sensitive keys.

Adding `binder` as a top-level column to either audit table would:
- Couple the audit schema to v1.3's domain model. Future milestones (v1.4 etc.) might add other dimensions; if every dimension gets a column, the audit table mutates per milestone.
- Require Drizzle migrations for what is essentially observability metadata.
- Break the "audit metadata is safe and bounded" Key Decision in PROJECT.md (which keeps audit a black box from a schema-evolution perspective).

### Specific metadata fields to add

For `admin_audit_log`:

| Action | New `metadata` keys | Reason |
|---|---|---|
| `inventory.import_commit` | `selectedBinders: string[]`, `unselectedBinders: string[]`, `replacedRows: number`, `untouchedRows: number` | The new selective replace makes "what got replaced" non-obvious. The seller asks: "Did my Modern binder get wiped?" Audit answers: was it in `selectedBinders`? |
| `inventory.update` | `binder: string` (the row's binder, after edit), `binderChanged: boolean`, `previousBinder?: string` | Inventory edits can change which binder a row lives in. Track it. |
| `inventory.delete_one`, `inventory.delete_many` | `binders: string[]` (binders affected) | Operator wants to know which binders shrunk. |
| `order.cancel` (with restore) | `restoredByBinder: Record<string, number>` (qty restored per binder) | Restore goes back to specific binder rows; show which. |

For `import_history`:

| New `metadata` keys | Reason |
|---|---|
| `selectedBinders: string[]` | Which binders the operator picked from the preview UI |
| `binderRowCounts: Record<string, number>` | "Modern: 412 rows, Vintage: 89 rows, …" — supports the audit page's per-import detail view |
| `replaceMode: "selective" \| "full"` | Distinguishes selective-binder imports from a hypothetical full-replace fallback |

### What about `order_items.binder`?

Tempting alternative: parse binder from `order_items.card_id` (since the row id is binder-suffixed). Rejected because:
1. Binder names can contain `-` and `setCode` can contain `-`, so parsing the binder out of the id is fragile (same issue as Q4 cart-migration).
2. `order_items` already follows the **denormalized snapshot** convention — every other field (name, setName, setCode, collectorNumber, condition, price, imageUrl) is duplicated from cards explicitly so order rows survive re-imports without joins. Binder is the same kind of fact.

So: **`order_items` gets one new column `binder text NOT NULL DEFAULT 'unsorted'`**, populated by the allocator's `inserted_items` CTE. Single ALTER TABLE, defaults backfill historical rows, admin order detail can read it directly.

**Confidence:** HIGH. The `metadata` JSONB pattern is exactly what Phase 14 designed it for; we're using the existing escape hatch instead of creating a new one. The single `order_items.binder` add is consistent with Phase 13's `admin_note` and the rest of the denormalized-snapshot fields on that table.

---

## Question 6 — Build Order (Suggestion)

### Phase decomposition with integration dependencies

The roadmapper makes the final call. Here's a defensible four-phase split:

#### Phase A: Schema migration + parser binder support
**Does:**
- Add `binder text NOT NULL DEFAULT 'unsorted'` to `cards` schema.
- Add new `etched` value to a new `finishEnum` if going strict, or keep `foil: boolean` and add `finish: text NOT NULL DEFAULT 'normal'` (recommend the latter — boolean → enum migration is messy and the code already says `foil ? "foil" : "normal"` in the composite).
- Run the migration script (Q1).
- Update `parseManaboxCsvContents` to extract `Binder Name` from CSV rows, attach to `Card`.
- Update `cardToRow` and the composite ID builder in `csv-parser.ts:91` to include binder.
- Add `binder` to the `Card` interface.

**Integration deps:** None (foundation phase).
**Done when:** Existing tests pass with `binder = 'unsorted'` defaulting everywhere; manual import of a Manabox CSV produces rows with the correct binder column populated.

#### Phase B: Selective import preview + commit
**Does:**
- Preview UI gains the binder picker (checkbox per discovered binder + row count).
- `parseManaboxCsvContents` returns a new `binders` summary in the preview payload.
- Commit endpoint accepts `selectedBinders: string[]`.
- `replaceAllCards` becomes `replaceCardsForBinders(cards, selectedBinders, audit)` — the `db.batch` becomes `[delete WHERE binder IN (...), insert, audit, importHistory]`.
- Audit + import_history metadata gains the binder fields from Q5.
- Selection persistence (selected binders remembered between imports) — a new `import_preferences` table or just localStorage on the admin client.

**Integration deps:** Phase A (binder column exists, parser populates it).
**Done when:** Operator can import a CSV containing 5 binders, pick 3, verify those 3 replace and the other 2 are untouched.

#### Phase C: Storefront aggregation + cart key shift
**Does:**
- Add `getCardsAggregated()` to `queries.ts` (Q2).
- `app/page.tsx` swaps to `getCardsAggregated()`.
- StorefrontShell renders the aggregated `Card`. Hide binder from buyer view.
- `app/cart/page.tsx` and `app/checkout/page.tsx` keep `getCards()` for now but render the cart against aggregated `id`s (cart key migration in `cart-page-client.tsx`).
- Cart-key migration code (Q4).
- Admin inventory table gains the "Binder" column (already exposed by `getAdminCards` since `binder` is on `Card`).

**Integration deps:** Phase A (column exists + populated).
**Done when:** Buyer browsing the storefront sees one row per `(set, collector, foil, condition)` with summed quantities; cart from a pre-deploy localStorage migrates seamlessly to the aggregated keys.

> **Why C does not depend on B:** Aggregation works regardless of how the rows got there. Phase B only changes the *write* path; Phase C only changes the *read* path. They can be developed in parallel after A lands; ship C first if that's safer (read-only changes are more reversible than write-path changes).

#### Phase D: Allocator integration in checkout
**Does:**
- Rewrite the `placeCheckoutOrder` CTE chain with the allocator (Q3).
- Update `StockConflict` to be aggregated-key-based.
- Add `binder` column to `order_items` (Q5).
- Allocator emits one `order_items` row per binder source.
- Admin order detail page reads `order_items.binder` and renders `[binder]` annotation.
- Checkout `/api/checkout` payload accepts aggregated `cardId`s (no schema change to `CheckoutLineInput`).

**Integration deps:** Phase A (binder column), Phase C (storefront / cart use aggregated ids — without C, the allocator has no aggregated input to work from).
**Done when:** Buyer checks out a card whose stock spans 3 binders; order_items has 3 rows with correct binders and decremented quantities; concurrent-checkout test (two buyers, one in-stock binder source) shows one success + one stock_conflict.

### Suggested order: A → (B || C) → D

A is foundational. B and C are independent — recommend doing C first (the read-side change is lower risk and unlocks user-visible value), then B, then D.

D depends on both A and C — the allocator operates on the aggregated key that C introduces.

### Risks the roadmapper should know

- **Binder name sanitization** is a small but cross-cutting decision (touches Phase A's parser + Phase C's cart migration). Recommend resolving it in Phase A so Phases B/C/D don't relitigate.
- **Phase D's CTE rewrite is the highest-complexity phase.** Allocate ample time for the unit test fixture matrix described in Q3.
- **The allocator's `ORDER BY binder ASC` priority is a Key Decision.** If the operator ever wants different priority (e.g. "always pull from unsorted first to clean it out"), it's a one-line change but should be agreed on before D ships.

**Confidence:** HIGH for the dependency graph (it falls out of the data-flow analysis). MEDIUM for the suggested order — the team may have a different risk preference (e.g. ship D first behind a feature flag and prove correctness before exposing C to buyers).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Doing the allocator in JavaScript

**What people do:** `SELECT * FROM cards WHERE … FOR UPDATE`, sort and slice in app code, then `UPDATE … WHERE id IN (…)`.
**Why it's wrong:** `neon-http` returns each statement as its own implicit transaction. The lock from `FOR UPDATE` releases when the SELECT response arrives at the function. The UPDATE that follows races against any other concurrent checkout.
**Do this instead:** Single CTE chain in one `db.execute` (or wrapped in `db.batch` if multi-statement), as the existing `placeCheckoutOrder` already does.

### Anti-Pattern 2: Adding `binder` as a fifth `cardId` segment without changing the cart key

**What people do:** Push the new `cards.id` (with binder suffix) all the way to the cart and checkout.
**Why it's wrong:** Buyers shouldn't pick "Lightning Bolt from Binder A" vs "Lightning Bolt from Binder B" — the milestone explicitly says binder is invisible to buyers. Exposing it leaks operational structure into the buyer's experience and breaks the silent-reconciliation contract (buyer's cart silently shrinks every import as binder names shift).
**Do this instead:** Cart key is the **aggregated** id (Q4). Allocator decides which binders to draw from server-side.

### Anti-Pattern 3: Materialized view for the aggregated storefront

**What people do:** Wrap `getCardsAggregated()` in a Postgres materialized view, refresh on every import commit.
**Why it's wrong:** 12k aggregated rows × negligible per-row aggregation cost = sub-50ms query without any caching. A materialized view adds: (1) a refresh step in `replaceCardsForBinders`, (2) a stale-data window between commits and refresh, (3) more schema to maintain. Premature optimization for this scale.
**Do this instead:** Plain `GROUP BY` query. Add a covering index only if `EXPLAIN ANALYZE` shows >50ms.

### Anti-Pattern 4: Drizzle `migrate` workflow when the team has been on `push`

**What people do:** Introduce `drizzle-kit generate` + apply-via-migrations folder for the binder column "because that's the proper way."
**Why it's wrong:** Phases 13/14 added columns and whole tables via direct schema edits with no migration files. The team's habit + tooling is `push`. Introducing `generate`/`apply` adds new operational steps the team has no muscle memory for, on a phase that's already complex.
**Do this instead:** Either write a one-shot `scripts/migrate-binder.ts` (Q1) and run it manually, or rely on `drizzle-kit push` after editing `schema.ts`. Document the data migration step in the phase plan.

---

## Integration Points Map

### New components

| Component | File | Depends on |
|---|---|---|
| `getCardsAggregated()` | `src/db/queries.ts` (new export) | new `binder` column |
| `replaceCardsForBinders(cards, selectedBinders, audit)` | `src/db/queries.ts` (replaces `replaceAllCards`) | new `binder` column, audit metadata extensions |
| Binder picker component | `src/app/admin/import/_components/binder-picker.tsx` | preview payload includes binder summary |
| Allocator CTE | `src/db/orders.ts` (rewrites `placeCheckoutOrder`) | `binder` column, aggregated `cardId` shape |
| Cart-key migration loop | `src/app/cart/cart-page-client.tsx` (extends existing useEffect) | `getCardsAggregated()` returning new id shape |
| Migration script | `scripts/migrate-binder.ts` (new) | nothing — runs once before deploy |

### Modified components

| Component | What changes | Why |
|---|---|---|
| `cards` table | + `binder text NOT NULL DEFAULT 'unsorted'`; PK rebuilt to include binder | Q1 |
| `Card` interface | + `binder: string` | Q1 |
| `cardToRow` (`src/db/seed.ts`) | + `binder: card.binder` | Q1 |
| Composite ID builder (`src/lib/csv-parser.ts:91`) | Append `-${binder}` | Q1 |
| `parseManaboxCsvContents` | Reads `Binder Name` from `ManaboxRow`, populates `card.binder` | Phase A |
| `ManaboxRow` interface | + `"Binder Name": string`, `"Binder Type"?: string` | Phase A |
| `mergeCards` (`src/lib/csv-parser.ts:141`) | Dedup key still composite ID — no change required (binder is part of the id) | Phase A |
| Preview payload | + `binders: Array<{name: string, rowCount: number}>` | Phase B |
| Commit payload | + `selectedBinders: string[]` | Phase B |
| `replaceAllCards` → `replaceCardsForBinders` | `db.batch([delete WHERE binder IN (selected), insert, audit, importHistory])` | Phase B |
| `app/page.tsx` | Calls `getCardsAggregated` not `getCards` | Phase C |
| `cart-page-client.tsx` useEffect | Adds key-normalization branch before silent-removal | Phase C / Q4 |
| Admin inventory table | Adds Binder column + filter | Phase C |
| `placeCheckoutOrder` CTE | New allocator subtree | Phase D |
| `StockConflict` semantics | `cardId` becomes the aggregated id | Phase D |
| `order_items` table | + `binder text NOT NULL DEFAULT 'unsorted'` | Phase D / Q5 |
| Allocator's `inserted_items` CTE | Selects `binder` from `nonzero_allocations`, writes to `order_items.binder` | Phase D |
| Admin order detail | Renders `[binder]` annotation per line item from `order_items.binder` | Phase D |
| `admin_audit_log.metadata` | + binder-related keys per Q5 table | Phase B + D |
| `import_history.metadata` | + `selectedBinders`, `binderRowCounts`, `replaceMode` | Phase B |

### Internal boundaries (data-flow contracts)

| Boundary | Old contract | New contract |
|---|---|---|
| ManaboxRow → Card | (Name, Set code, Collector number, Foil, Condition, Quantity) | + Binder Name |
| Card → cards row | composite id = 4 segments | composite id = 5 segments (binder appended) |
| RSC → StorefrontShell | `Card[]` (one row per composite id) | `AggregatedCard[]` (one row per aggregated id, has `binders: string[]`) |
| Cart store ↔ localStorage | key = 4-segment composite id | key = 4-segment **aggregated** id (collision: same string, different meaning — see Q4 migration) |
| Cart → /api/checkout | `{cardId: string, quantity: number}[]` where cardId = full composite | Same shape, but cardId = aggregated id; allocator picks binder rows server-side |
| placeCheckoutOrder → order_items | One row per cart line | **One row per binder source per cart line** (cart line for qty 3 split across 2 binders → 2 order_items rows) |
| /admin/orders/[id] → order detail UI | Order items, no binder shown | Order items + per-row binder annotation (from `order_items.binder`) |

---

## Sources

All sources are local repository inspection (HIGH confidence):

- `src/db/schema.ts` — current table definitions, PK shape, indexes
- `src/db/queries.ts` — `replaceAllCards` `db.batch` pattern (lines 802-861), `getCards`, audit/import_history infrastructure
- `src/db/orders.ts` — `placeCheckoutOrder` CTE chain (lines 350-533), `cancelOrder` restore CTE (lines 677-814)
- `src/lib/csv-parser.ts` — composite ID builder (line 91), `mergeCards` (line 141), `parseManaboxCsvContent`/`parseManaboxCsvContents`
- `src/lib/store/cart-store.ts` — Zustand + localStorage persistence shape
- `src/app/cart/cart-page-client.tsx` — silent reconciliation pattern (lines 40-47), Phase 10-03 D-13 contract
- `src/components/cart-item.tsx` — stale-cart-item rendering
- `src/app/page.tsx` — `force-dynamic` storefront RSC
- `src/app/api/admin/import/{preview,commit}/route.ts` — preview/commit payload shapes, NDJSON streaming pattern
- `src/lib/import-contract.ts` — `PreviewPayload`, `CommitRequest`, `CommitResponse` types
- `src/lib/types.ts` — `Card`, `ManaboxRow`, `OrderData`, `StockConflict` interfaces
- `package.json` + `drizzle.config.ts` — drizzle-kit present, no migration files exist (`drizzle/` directory absent)
- `git show 87cf95d` (Phase 13 schema diff: added `cancelled` enum value, `admin_note` column)
- `git show f04fc7b` (Phase 14 schema diff: added `admin_audit_log`, `import_history` tables)
- `git show dec5dbe` (Phase 10-03 silent-reconciliation commit: established the Phase 10 D-13 cart-shrink contract)
- `.planning/PROJECT.md` — Key Decisions (especially "Audit metadata is safe and bounded" and "Multi-CSV import still full-replaces inventory")

---
*Architecture research for: v1.3 Binder-Aware Inventory & Pick Workflow*
*Researched: 2026-05-10*
