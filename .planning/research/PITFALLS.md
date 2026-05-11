# Pitfalls Research — v1.3 Binder-Aware Inventory & Pick Workflow

**Domain:** Adding a per-binder dimension to a populated transactional checkout system (Next.js + Drizzle/Neon-HTTP, ~12,749 rows, existing `FOR UPDATE`-locked atomic checkout).
**Researched:** 2026-05-10
**Confidence:** HIGH (every pitfall is grounded in a specific file/line in this codebase or a documented Phase 11/14/15 invariant).

---

## Reading guide

Each pitfall has the same shape: **WHAT** (the failure mode in concrete terms), **HOW IT MANIFESTS** (in *this* codebase, with file:line references), **PREVENTION** (specific defensive code or test pattern), **DETECTION** (early warning signs), **PHASE TO ADDRESS**.

Phase IDs use the v1.3 milestone numbering proposed in `STACK.md` / `FEATURES.md`:

- **Phase 16 — Schema & Migration:** schema change, backfill, FK survival.
- **Phase 17 — Parser & Etched:** Manabox column ingest, finish enum, name normalization.
- **Phase 18 — Allocator:** server-side multi-binder allocator on the checkout commit path.
- **Phase 19 — Import Preview / Picker:** binder picker UI, scoped replace, NDJSON streaming.
- **Phase 20 — Storefront Aggregation & Cart Migration:** aggregated stock display, cart-key reconciliation extension.
- **Phase 21 — Admin Visibility & Audit:** binder column, filter, audit metadata bounded representation.
- **Phase 22 — Hardening & UAT:** STRIDE delta, performance pinning, concurrent-checkout proof v2.

---

## Critical Pitfalls

### Pitfall 1 — Allocator double-decrement under concurrent checkout

**WHAT.** Two checkouts both want 3× of card X. Today X exists once with `quantity = 4`. Tomorrow X exists in `A02:2` and `A05:2` (two physical rows after binder dimension lands). A naive multi-binder allocator does:

```sql
-- naive (BROKEN) per-row decrement, no aggregate lock:
SELECT id, quantity FROM cards WHERE name = 'X' AND quantity > 0;  -- both txns see [A02:2, A05:2]
-- both pick A02 first, both pick A05 second
UPDATE cards SET quantity = quantity - 2 WHERE id = 'A02-row';
UPDATE cards SET quantity = quantity - 1 WHERE id = 'A05-row';
-- A02 and A05 each get decremented twice → quantity goes negative → 4 oversold copies.
```

Even if you put `FOR UPDATE` on each row individually, two sessions can lock disjoint subsets and still both succeed because neither sees the other's intent on the rows it didn't lock.

**HOW IT MANIFESTS.** The current `placeCheckoutOrder()` in `src/db/orders.ts:369-517` has a single CTE that does:

1. `requested_agg` — sums per `card_id`.
2. `locked_cards` — `FOR UPDATE` on `cards` joined to `requested_agg`. This works because `card_id` IS the primary key today, so locking by `card_id` locks the **only** row that holds that card's stock.

After v1.3, "card_id" no longer uniquely identifies a stock row. The composite-PK choice is `(card_logical_id, binder)` (or a stable `id` derived from both — see Phase 16). So `cards.id` no longer aligns 1:1 with stock for a given printable. The CTE's `FOR UPDATE` line at `orders.ts:380-384` will lock 0..N rows per requested logical card. Two concurrent transactions can each lock different subsets of those rows without conflict, and each can compute "available across my locked subset = enough" independently.

**The exact failure scenario in SQL terms.** Assume `cards (logical_id, binder, quantity)` with rows `(X, A02, 2)` and `(X, A05, 2)`. Two transactions T1, T2 both request 3 of X.

```
T1: SELECT ... WHERE logical_id = 'X' FOR UPDATE;  -- locks (X,A02), (X,A05)
                                                    -- BUT releases nothing yet
T2: SELECT ... WHERE logical_id = 'X' FOR UPDATE;  -- BLOCKS waiting on T1
T1: UPDATE cards SET quantity = quantity - 2 WHERE id = 'X-A02';
T1: UPDATE cards SET quantity = quantity - 1 WHERE id = 'X-A05';
T1: COMMIT.                                         -- quantities now (X,A02,0), (X,A05,1)
T2: (unblocks, sees fresh values)                   -- locks (X,A02,0), (X,A05,1)
T2: requested_agg says T2 wants 3, available = 1   -- conflicts CTE rejects.
```

Good — **but only if T1's lock query selects ALL rows for X by logical_id**, not just the ones it intends to decrement. The risk is a "smart" allocator that pre-computes a pick plan in app code (e.g., pick A02 first, then A05) and then locks just `id IN ('X-A02', 'X-A05')`. Two transactions with different pick plans (e.g., one picks `A02 + A05`, the other picks `A05 + A02`) might still serialize correctly via row-lock waits, but a bad split (T1 locks only A02, T2 locks only A05) will let both succeed and oversell.

**SERIALIZABLE alternative.** Postgres SERIALIZABLE would catch the conflict at commit time and abort one transaction (`could not serialize access due to read/write dependencies among transactions`). But Neon-HTTP does NOT support interactive transactions (per `src/db/queries.ts:799-801` comment) — `db.batch()` runs at the default isolation. SERIALIZABLE is not available to us without changing drivers.

**PREVENTION.** Three defensive layers, all implementable without changing the driver:

1. **Lock by logical_id, not by chosen rows.** The allocator MUST lock every row where `logical_id = X` *before* deciding which to decrement. The single-CTE pattern in the current `placeCheckoutOrder` does this naturally — extend it to:

   ```sql
   WITH requested(logical_id, requested_qty) AS (VALUES (...)),
   locked_stock AS (
     SELECT cards.* FROM cards
     INNER JOIN requested ON requested.logical_id = cards.logical_id
     ORDER BY cards.id              -- deterministic order to prevent deadlocks
     FOR UPDATE                     -- lock EVERY stock row for every requested logical card
   ),
   ...
   ```

   This is the single defensive change that closes the bug. **Do NOT pre-compute a pick plan in app code, then lock just those rows** — you must lock the whole set the buyer might draw from.

2. **Allocate inside the same CTE.** Choose which binder rows to decrement using a window function (deterministic order: e.g., `ORDER BY binder ASC, quantity DESC` to drain small binders first), then `UPDATE` with a `WHERE id IN ...` derived from the allocator subquery. All in one statement = one Neon-HTTP roundtrip = single batch atom.

3. **Defensive `quantity >= 0` constraint.** Add `CHECK (quantity >= 0)` to the `cards` table in Phase 16. If the allocator is ever wrong, Postgres aborts the transaction at commit and the over-decrement becomes a 503 instead of a silent oversell. Cheap, mechanical, immediate detection.

   ```sql
   ALTER TABLE cards ADD CONSTRAINT cards_quantity_nonneg CHECK (quantity >= 0);
   ```

4. **Pin the allocator with the existing concurrent-proof harness.** Phase 11 SUMMARY documents a `successCount: 1, conflictCount: 1, finalQuantity: 0` test. Extend it: seed `(X,A02,2)` and `(X,A05,2)`, fire two concurrent `placeCheckoutOrder({ X: 3 })`, assert `successCount === 1, conflictCount === 1, sum(quantities) === 1` (one losing buyer, one winner takes 3, 1 left).

**DETECTION.** A `quantity < 0` row in production. A unit test that asserts the allocator's CTE contains both `FOR UPDATE` AND a join keyed on the logical card id (not on a pre-chosen binder set). If anyone in code review writes "let pickPlan = cards.filter(...)" outside the CTE, that is the smell.

**PHASE TO ADDRESS.** Phase 18 (Allocator). Verification gate: extend the Phase 11 concurrent-proof harness with a multi-binder scenario in Phase 22 (Hardening & UAT).

---

### Pitfall 2 — Partial allocation semantics: silent oversell vs. all-or-nothing

**WHAT.** Buyer wants 3 of X. Across all binders, only 2 are available. The allocator has three options:

| Option | Behavior | Pro | Con |
|---|---|---|---|
| A. Partial fulfill | Decrement 2, return success with 2 | "Friendly" — buyer gets something | Buyer's cart said 3, order shows 2, "where did 1 go?" |
| B. All-or-nothing | Reject the line, surface stock_conflict for that line | Matches existing Phase 11 contract | Buyer must re-add and try again |
| C. Soft pre-check + re-display | Show buyer "only 2 left" mid-checkout, let them confirm | Best UX | Two roundtrips, race window between confirm and decrement |

**HOW IT MANIFESTS.** The existing Phase 11 contract IS option B. `src/db/orders.ts:386-394` produces a `conflicts` row when `locked_cards.quantity < requested_agg.requested_qty`, and the `can_fulfill` CTE refuses to write any stock if any conflict exists. The buyer-facing checkout client at `src/app/checkout/checkout-client.tsx` (per Phase 11-01-SUMMARY:46-48) "preserves cart and form data for all checkout errors." The buyer sees the conflict list and can adjust.

If Phase 18 introduces partial allocation, it **breaks an existing contract that the cart UI relies on** and creates the new failure mode "order succeeded for less than I asked for" — for which there is no UI today.

**PREVENTION.**

1. **Industry pattern + recommendation: keep all-or-nothing.** Shopify, BigCommerce, and Stripe Checkout all use all-or-nothing line item commits. Partial fulfillment is a fulfillment-time concern (after the order is placed and the seller is packing), not a checkout-time concern. For a friend-store with no payment, all-or-nothing keeps the contract simple: "the order is exactly what the cart said."

2. **Reuse the existing `StockConflict` shape.** From `src/db/orders.ts:13-18`:
   ```ts
   { cardId, name, requested, available }
   ```
   For v1.3, `available` is the SUM across binders the buyer can see (i.e., aggregated). Do not expose per-binder availability in the conflict payload — it leaks binder names (Pitfall 6).

3. **Pin the contract with a regression test.** `src/db/__tests__/orders.test.ts` already has a stock-conflict test. Extend it: "given cards (X,A02,1), (X,A05,1), request 3 X → expect ok=false, conflicts=[{cardId:X, requested:3, available:2}], no stock decremented."

**DETECTION.** Any `if (allocated < requested) return { ok: true, ... }` branch in the allocator is the smell. Any `partial: true` flag in `PlaceCheckoutOrderResult` is the smell.

**PHASE TO ADDRESS.** Phase 18 (Allocator). Pin in Phase 18 acceptance test; also surface in Phase 22 STRIDE-delta as a "behavior contract preserved" item.

---

### Pitfall 3 — order_items FK to a deleted binder row mid-checkout

**WHAT.** Admin opens "Edit binder A02" and clicks delete on a row. Simultaneously, a buyer's checkout commits a decrement against that A02 row. Question: does the historical `order_items` row survive when the `cards` row vanishes?

**HOW IT MANIFESTS.** `src/db/schema.ts:175-202` — `order_items` deliberately has **NO FK** to `cards.id` (line 184: `// NO FK to cards -- denormalized, survives re-imports`). The `cardId` column is a denormalized text snapshot. This is correct today and stays correct in v1.3 — full inventory replace also deletes-and-reinserts every `cards` row, and historical orders don't break.

The remaining risk is the *runtime* race, not the historical integrity:

- T1 (admin) starts a delete: `DELETE FROM cards WHERE id = 'X-A02-row'`.
- T2 (buyer checkout) starts the allocator CTE: `SELECT ... FOR UPDATE` joining on `logical_id = 'X'`.
- One of them wins the row lock. If the admin DELETE wins, the buyer's allocator sees fewer rows and may produce a `stock_conflict`. If the buyer's checkout wins, the admin's DELETE waits until the checkout commits, then deletes a row whose quantity is already lower.

Both outcomes are **correct** because of the row lock. The pitfall is **not** here.

**The actual pitfall** is: a different code path that deletes binder rows OUTSIDE the lock. Specifically, the Phase 19 "scoped replace" import. The existing `replaceAllCards()` at `src/db/queries.ts:809-861` does `db.delete(cards)` then `db.insert(cards).values(rows)` in a `db.batch([...])`. For v1.3 the scoped variant must do `db.delete(cards).where(inArray(cards.binder, selectedBinders))` then re-insert just those binders' rows. **If a checkout is mid-flight with an open lock on a row in a selected binder, the batch DELETE will queue behind the row lock — but the batch is `db.batch([...])` which is a single Neon-HTTP HTTP call, NOT an interactive transaction.** Each statement in the batch is executed serially as one transaction; a long-running checkout lock will time out the import batch, not the other way around.

**The subtle failure:** The checkout commits successfully, decrementing `X-A02` from 2 to 1. The scoped import then runs and replaces all of A02 with new rows (because A02 was selected). The order_items row points to "X-A02" which now does not exist (or has a different stock count from a fresh import). For the **historical order display** this is fine — order_items has the snapshot. For the **admin order detail "click to view current stock for this card"** feature, the link breaks.

**PREVENTION.**

1. **Keep the no-FK design.** Do NOT add `references(() => cards.id)` to `orderItems.cardId` in v1.3. The denormalization is the design.

2. **Pin the no-FK invariant with a schema test.** Add to `src/db/__tests__/schema.test.ts` (or create one): `expect(getDrizzleSchemaJson(orderItems).columns.cardId.references).toBeUndefined();`.

3. **Make `cards.id` deterministic across re-imports.** Today: `${setCode}-${collectorNumber}-${foil}-${condition}`. v1.3 proposal: `${setCode}-${collectorNumber}-${foil}-${condition}-${binder}` (binder appended). This preserves the property that re-importing a binder produces the same `id` for the same physical row, so the order_items.cardId text link continues to resolve after re-imports of the same binder. **Critical:** the binder portion of the id should be a slug-normalized form (lowercased, whitespace collapsed) to be stable against the typo case in Pitfall 10.

4. **In the admin order detail UI, treat `cards.id` lookup as nullable.** If the row no longer exists, render the snapshot fields from `order_items` and a small "(no longer in inventory)" tag. The existing UI in `src/app/admin/orders/[id]/page.tsx` already uses the order_items snapshot for display — verify nothing newly added in Phase 21 introduces a hard `cards` join.

**DETECTION.** A test that creates an order, deletes the underlying card, re-fetches the order, and asserts the order detail page renders without throwing. A schema-level invariant test.

**PHASE TO ADDRESS.** Phase 16 (id format), Phase 19 (scoped replace semantics), Phase 21 (admin order detail render).

---

### Pitfall 4 — Migration: backfilling 12,749 rows with `binder = 'unsorted'` collapses real distinct rows

**WHAT.** Adding `binder` to the composite PK is a destructive schema change. Today `id = 'sld-001-normal-NM'` is unique. Tomorrow `id = 'sld-001-normal-NM-unsorted'` is unique. The backfill is straightforward: `UPDATE cards SET binder = 'unsorted'` then regenerate the id. **But** if the migration has any merge step that says "if the new id already exists, sum quantities," it can silently merge two distinct rows that happened to collide.

The exact scenario where this bites: someone runs the v1.3 backfill *after* a partial v1.3 import has already happened (e.g., dev tested the new importer, then ran the migration). Some rows already have `binder = 'A02'` and the new id, others still need backfill. The migration tries to MERGE rather than UPSERT-NEW-ROW and silently coalesces rows.

**HOW IT MANIFESTS.** This codebase does not use `drizzle-kit migrate` for data backfills — schema migrations are SQL files generated by `drizzle-kit generate`, but data backfills are typically inline SQL or one-off scripts (see Phase 15-01 documenting the `rate_limit_hits` table being added to schema *after* runtime had already lazy-created it, comment in `src/db/schema.ts:140-152`).

The likely v1.3 backfill flow:

```sql
-- step 1: add column with default
ALTER TABLE cards ADD COLUMN binder text NOT NULL DEFAULT 'unsorted';

-- step 2: drop the old PK (which is the id column PK), recompute id
ALTER TABLE cards DROP CONSTRAINT cards_pkey;
UPDATE cards SET id = id || '-unsorted';     -- naive, breaks if any id already has '-unsorted'
ALTER TABLE cards ADD PRIMARY KEY (id);
```

Three things go subtly wrong:

1. **Idempotency.** Re-running the migration appends `-unsorted` twice, producing `id = 'sld-001-normal-NM-unsorted-unsorted'`. The second `ADD PRIMARY KEY` succeeds (the new ids are still unique) but every existing `order_items.cardId` text snapshot now mismatches. The UI in admin order detail shows "(no longer in inventory)" for every historical line item.

2. **PK collision in real data.** It's plausible (low probability but real on 12,749 rows) that an existing `id` value is itself the prefix of another existing `id` after appending the suffix. Example: `id = 'sld-001-normal-NM'` and `id = 'sld-001-normal-NM-unsorted'` both exist, the latter from a hand-edited test row. The `UPDATE cards SET id = id || '-unsorted'` produces two rows with `id = 'sld-001-normal-NM-unsorted'` → constraint violation, migration aborts mid-flight, table is in a broken state with no PK.

3. **order_items text-link breakage.** Even on a clean migration, every existing `order_items.cardId` was written before the `-unsorted` suffix. After migration, the text doesn't match any cards row. Historical orders still render (snapshot fields), but any admin "view current stock" link fails. This is the **silent data-loss-equivalent** for the admin workflow.

**PREVENTION.**

1. **Explicit migration script with three checks.** Write the backfill as a standalone TypeScript script (`scripts/migrate-v1.3-binder.ts`), not an inline SQL. Three pre-flight assertions before any DML:

   ```ts
   // 1. No row already has the suffix we're about to append.
   const collisions = await db.execute(sql`
     SELECT id FROM cards WHERE id LIKE '%-unsorted'
   `);
   if (collisions.rows.length > 0) {
     throw new Error(`Migration would create duplicate ids: ${collisions.rows.map(r => r.id).join(', ')}`);
   }

   // 2. No `binder` column already exists.
   const colExists = await db.execute(sql`
     SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cards' AND column_name = 'binder'
   `);
   if (colExists.rows.length > 0) throw new Error('Migration already ran (binder column exists)');

   // 3. Capture order_items.cardId distribution BEFORE migration so we can verify after.
   const beforeCount = await db.execute(sql`
     SELECT COUNT(DISTINCT card_id) AS n FROM order_items
   `);
   ```

2. **Co-migrate `order_items.cardId` in the same batch.** The denormalized snapshot has the OLD id format. Either (a) update the snapshots to the new format in the same batch, OR (b) keep the old snapshots and accept they're "historical, no live link." Pick (b) for v1.3 (historical orders are a snapshot by design — see Pitfall 3) but document the choice in the migration script header.

3. **Run on a Neon branch first.** Neon supports branch databases. Phase 16 should: branch prod → run migration on branch → run a query that joins `order_items` to `cards` and counts unmatched rows → confirm post-migration unmatched count matches pre-migration unmatched count (i.e., migration introduced zero new mismatches). Only then merge.

4. **Backup before every step.** `pg_dump` of `cards` and `order_items` to a timestamped file in `.planning/migrations/v1.3/backups/`. The Phase 15 README runbook section already documents the `pg_dump` pattern (`15-SECURITY-REVIEW.md:97-99`).

**DETECTION.** A pre-flight assertion script that runs in CI on a fresh seed and a populated seed. A test that runs the migration twice and asserts the second run errors with "already ran" instead of corrupting data.

**PHASE TO ADDRESS.** Phase 16 (Schema & Migration). The migration script itself is the deliverable; the verification gate is "run on Neon branch → diff order_items unmatched count is 0 → merge."

---

### Pitfall 5 — Cart-key migration: silent cart-empty after deploy

**WHAT.** Buyer has 5 items in localStorage with cart keys like `sld-001-normal-NM`. v1.3 ships. The new code reads the cart, builds `cardMap` from the new DB rows (which all have keys like `sld-001-normal-NM-A02`), and then the existing reconciliation effect at `src/app/cart/cart-page-client.tsx:40-47` runs:

```tsx
useEffect(() => {
  if (!hydrated) return;
  for (const [cardId] of items) {
    if (!cardMap.has(cardId)) {
      removeItem(cardId);    // ← silently empties every old cart
    }
  }
}, [hydrated, items, cardMap, removeItem]);
```

Every old cart entry is silently dropped. The buyer sees "The satchel is empty." with no explanation.

This is **the existing Phase 10 reconciliation pattern** (D-13 in the comment, line 38). It is also the right place to extend — but extending it WRONG produces phantom items (cart shows 5 items, cardMap returns the wrong card or undefined for stock).

**HOW IT MANIFESTS.** Two failure modes:

- **Mode A — silent empty.** Old cart keys don't match any new key. Reconciliation strips everything. Buyer thinks the site lost their cart.
- **Mode B — phantom item.** Two binders have the same `(setCode, collectorNumber, foil, condition)`. Old cart has 1× of `sld-001-normal-NM`. New code creates a "best-effort match" by stripping the binder suffix from the new id before comparing — if it returns the FIRST match (e.g., `sld-001-normal-NM-A02`) and the buyer actually owned the card from `sld-001-normal-NM-A05`, the cart now points at a stock row that may be empty. Buyer sees `quantity = 0` next to the line item, increment button disabled, cart looks broken.

**PREVENTION.**

1. **Cart key MUST be the aggregated logical id, not the per-binder id.** The buyer-facing cart (and the storefront aggregated view) should treat the card as `(setCode, collectorNumber, foil, condition)` — the binder is invisible to buyers (Phase 22 STRIDE / Pitfall 6). The cart key migration is then a one-shot translation: old key matches the new logical id directly. No mismatch, no silent empty. The allocator (Pitfall 1) is what splits the logical id into per-binder rows server-side at checkout.

2. **Extend the existing reconciliation effect to handle the one-shot translation.** In `src/app/cart/cart-page-client.tsx:40-47`, before the silent strip:

   ```tsx
   useEffect(() => {
     if (!hydrated) return;
     for (const [cardId] of items) {
       if (cardMap.has(cardId)) continue;
       // v1.3 migration: old per-row keys → new logical keys
       // Old key has 4 segments; new logical key also has 4 segments.
       // If old key has 5+ segments (already a v1.3 per-binder key from a stale checkout),
       // strip the last segment to recover the logical key.
       const segments = cardId.split('-');
       const candidate = segments.length > 4 ? segments.slice(0, 4).join('-') : cardId;
       if (cardMap.has(candidate)) {
         setQuantity(candidate, items.get(cardId)!);
         removeItem(cardId);
       } else {
         removeItem(cardId);  // truly stale, drop
       }
     }
   }, [hydrated, items, cardMap, removeItem, setQuantity]);
   ```

   **Note:** the segment count guard requires that cardId never naturally contains 5+ segments. Today the format is `setCode-collectorNumber-foil-condition`. `setCode` is lowercase set abbreviation (`sld`, `mh3`, no hyphens), `collectorNumber` is alphanumeric and CAN contain a `-` (e.g., `001a-token`). **This is a real bug in the v1.0 id format that v1.3 inherits.** Verify with a regex test: assert `cards.id` always parses to exactly 4 parts under a stricter delimiter (consider switching to `|` or `:` for v1.3 to disambiguate).

3. **Add a one-time toast on first v1.3 visit.** Set a sentinel in localStorage (`viki-cart-version: '1.3'`). On first load with old version (or no version), if the cart had items that got translated, show "Your cart was updated." for 4s. If items got dropped, show "Some cart items are no longer available." This avoids the silent failure mode.

4. **Pin with a test.** `src/lib/store/__tests__/cart-store.test.ts` (create if missing) — given pre-v1.3 localStorage state, simulate hydration, assert the new state has items under translated keys.

**DETECTION.** Browser console error `Cannot read property 'price' of undefined` when CartItem renders an unmatched key. A v1.3 deploy followed by support messages "where did my cart go?". A unit test that round-trips localStorage state through hydration.

**PHASE TO ADDRESS.** Phase 20 (Storefront Aggregation & Cart Migration). The reconciliation extension is the deliverable; verification gate is "manually re-create v1.2 localStorage cart in DevTools, deploy v1.3, verify cart hydrates correctly."

---

### Pitfall 6 — Binder-name leak via API responses, emails, or order detail

**WHAT.** Binder names ARE physical-world inventory identifiers ("Top shelf, red box, A02"). The product spec says binder is hidden from public pages. Any code path that returns a `cards` row (or a serialized cart, order, conflict, image alt, structured log) without redacting `binder` leaks the name.

**HOW IT MANIFESTS.** Existing leak vectors in this codebase:

| Vector | File | Risk |
|---|---|---|
| `getCards()` storefront fetch | `src/db/queries.ts:48-51` | Returns all DB columns via `rowToCard` (`queries.ts:23-42`). Adding `binder` to schema + leaving `rowToCard` untouched leaks via storefront SSR. |
| Public `Card` type | `src/lib/types.ts:28-52` | Storefront and cart UIs share this type. Adding `binder?: string` here makes it hydration payload. |
| Stock conflict response | `src/db/orders.ts:482-487` | Currently returns `{cardId, name, requested, available}`. If allocator mistakenly includes per-binder breakdown ("requested 3, available A02:1 + A05:1"), buyer sees binder names in the JSON body. |
| Buyer confirmation email | (notifications.ts) | Iterates `order.items`. If `OrderItem` gains `binder`, leak is in the buyer's mailbox. |
| Order detail SSR for non-admin (none today, but future) | — | If a buyer-facing "view my order" page is added without filtering binder, leak. |
| Structured logs | `src/lib/logger.ts` | The Phase 15 redaction pattern is for **secrets**, not for **binders**. `metadata: { cardId: 'sld-001-NM-A02' }` is fully logged. If you decide a logical_id of `sld-001-NM` is buyer-safe and `sld-001-NM-A02` is admin-only, the logger has no concept of that distinction. |
| Admin export CSV | `src/app/api/admin/export/route.ts` | Today exports all card columns. Adding binder column to export is fine (admin-only), but if export URL is ever made public this leaks immediately. |

**STRIDE patterns to reference (from `15-SECURITY-REVIEW.md`):**

- **I-DISC-01 (resolved):** "Health endpoint env-value redaction" enforces a literal-only contract via `STATUS_LABELS` lookup. The pattern is: there is no path from the secret-shaped value to user-visible text. Mirror this for binder: there should be no path from `cards.binder` to a public response.
- **I-DISC-02 (resolved):** "Server logs redact secrets" via `safeErrorSummary`. Extend the log redaction key pattern to redact `binder` keys when they appear in a public-route log line. (Or simpler: never log `binder` in public-route paths.)
- **I-DISC-04 (acceptable):** "Public storefront enumeration" — explicitly accepts that public storefront returns all card data. **The v1.3 contract addition is: `binder` is an exception to this acceptance.**

**PREVENTION.**

1. **Two `Card` types — `PublicCard` and `AdminCard`.** The current single `Card` type at `src/lib/types.ts:28-52` is shared between storefront and admin. For v1.3, either:
   - Add `binder?: string` only to `AdminCard` (new type), and keep `PublicCard` (existing `Card`) without it, OR
   - Keep one type but add a strict `toPublicCard()` mapper that strips `binder` and run it on every server-to-client payload boundary.

   Option A is more surgical (TypeScript prevents accidental leak at compile time). Option B is one-line easier to add. **Recommend A** because the compile-time guarantee aligns with the I-DISC-01 lookup-table pattern.

2. **Pin "no-binder-on-public-routes" with a route test.** For every public route (`GET /`, `GET /cart`, `POST /api/checkout`), serialize the response and assert `JSON.stringify(response).includes('binder')` is `false`. This is a one-line per-route invariant test. Pattern to copy: the existing health-endpoint pin in `src/app/api/admin/health/__tests__/route.test.ts` ("never includes secret values in the response").

3. **Allocator returns aggregated `available`, never per-binder breakdown.** The `StockConflict` shape (`src/db/orders.ts:13-18`) MUST stay `{cardId, name, requested, available}`. Even internally, the conflicts CTE should aggregate before returning. Pattern in current `orders.ts:386-394`:

   ```sql
   conflicts AS (
     SELECT requested_agg.card_id,
            ...
            COALESCE(SUM(locked_cards.quantity), 0) AS available  -- SUM, not array
     FROM requested_agg
     LEFT JOIN locked_cards ON locked_cards.logical_id = requested_agg.logical_id
     GROUP BY requested_agg.card_id, requested_agg.requested_qty, ...
     HAVING SUM(locked_cards.quantity) IS NULL
         OR SUM(locked_cards.quantity) < requested_agg.requested_qty
   ),
   ```

4. **Email template review.** The notification template should iterate `order.items` and only render fields from a reviewed allowlist (`name, setName, condition, quantity, price, lineTotal, imageUrl`). Add a snapshot test for the rendered email HTML asserting `binder` text never appears.

5. **Add `binder` to the audit log redaction allowlist for public-route logs.** When a stock_conflict is logged (`src/lib/logger.ts` via `logEvent` from the checkout route at `src/app/api/checkout/route.ts:117-121`), the metadata payload must NOT contain raw `binder` strings. Today the metadata is `{conflictCount}` only (line 120) — keep it that way. Phase 18 must NOT add binder breakdown to the log.

**DETECTION.** A grep for `binder` in any file under `src/app/{cart,confirmation,api/checkout}/` and `src/components/{cart-item,card-grid,card-modal}.tsx` — any match in a non-admin context is a finding. A unit test per public route that JSON.stringifies the response and asserts no binder leak.

**PHASE TO ADDRESS.** Phase 20 (public type split, cart UI), Phase 21 (admin UI gets binder), Phase 22 (STRIDE delta — add I-DISC-05 "binder name privacy" finding, document the lookup-table pattern enforcing it).

---

### Pitfall 7 — Etched finish silently treated as `normal`

**WHAT.** Manabox `Foil` column carries `normal`, `foil`, AND `etched` (Scryfall's `usd_etched` price field at `src/lib/types.ts:91` confirms etched as a real, distinct printing tier — etched cards have a different visual treatment AND a different price than foil/normal). Today the parser at `src/lib/csv-parser.ts:87` does:

```ts
const foil = row.Foil === "foil";
```

Anything that is not the literal string `"foil"` becomes `false`. So `Foil: "etched"` → `foil = false` → the card is recorded as a non-foil. Three downstream effects:

1. **Wrong price.** `src/lib/enrichment.ts:53-55` picks `usd` for non-foil rows. Etched cards have `usd_etched` (often $5-$50 vs `usd` $0.10) — buyer sees a $0.50 list price for what should be $25.
2. **Wrong PK collision.** `id = sld-001-normal-NM` for both the normal and etched printings of the same collector number. If a binder has both, the parser's `mergeCards()` (`csv-parser.ts:141-154`) sums them under the same id. The etched copies vanish into the normal stock. Buyer picks "Mountain (normal) — $0.10 × 1" expecting normal, gets etched.
3. **Wrong filter UI.** The `foil: boolean` field in `Card` (`src/lib/types.ts:47`) is a boolean. The cart-item displays `card.foil ? " · Foil" : ""` (`src/components/cart-item.tsx:191`). Etched cards display as if normal.

**HOW IT MANIFESTS.** This bug is **already in production today** at v1.2 — any etched card in the seller's collection is silently mis-priced and mis-merged. v1.3 intersects with this because the new `Foil` enum work is on the table and binder-aware imports are the natural moment to fix it. If v1.3 ships without the fix, the binder-picker UI will show the wrong price next to etched copies, in 30+ binders.

**PREVENTION.**

1. **Add `etched` as a third finish enum value.** Change `src/lib/types.ts:10` from `Foil: "foil" | "normal"` to `Foil: "foil" | "normal" | "etched"`. Change `Card.foil: boolean` (line 47) to `Card.finish: 'normal' | 'foil' | 'etched'`. The boolean is the source of the bug.

2. **Update the id format.** `csv-parser.ts:91`:
   ```ts
   // before:
   id: `${setCode}-${collectorNumber}-${foil ? "foil" : "normal"}-${condition}`,
   // after:
   id: `${setCode}-${collectorNumber}-${finish}-${condition}-${binderSlug}`,
   ```
   Etched and foil now produce distinct ids. v1.3's binder migration is the right moment for this change.

3. **Update the price picker.** `src/lib/enrichment.ts:49-60` is already correct *for foil-vs-etched price selection*, but it picks based on `foil: boolean`. After the type change to `finish: 'normal' | 'foil' | 'etched'`, change to:
   ```ts
   function getPrice(prices, finish) {
     const raw = finish === 'etched'  ? prices.usd_etched ?? prices.usd_foil ?? prices.usd
              : finish === 'foil'    ? prices.usd_foil ?? prices.usd_etched ?? prices.usd
                                     : prices.usd ?? prices.usd_foil ?? prices.usd_etched;
     ...
   }
   ```
   This is a minor refactor of the existing fallback ladder.

4. **Handle the migration of existing rows.** The v1.3 schema migration (Phase 16) needs an inline rename: existing rows with `foil = true` → `finish = 'foil'`, `foil = false` → `finish = 'normal'`. There are no etched rows today (because the parser silently coalesced them into normal). After v1.3 deploys, the next CSV import will surface them correctly.

5. **Database column.** Either add a new `finish` enum column (requires Drizzle pg enum like the existing `orderStatusEnum`, see `src/db/schema.ts:15-20`) or keep the boolean and add a separate `is_etched` boolean. Recommend pg enum: type-safe, clear, mirrors the existing `order_status` pattern.

6. **Pin with a parser test.** Add to `src/lib/__tests__/csv-parser-content.test.ts`: "given a row with Foil='etched', expect parsed card with finish='etched' AND a distinct id from the normal/foil printings of the same collector number."

**DETECTION.** A test asserting that for every Manabox CSV row, the parser's output has `finish` ∈ `{normal, foil, etched}`. A grep for `card.foil` in the codebase — every match is a place that needs to consider `finish === 'foil' || finish === 'etched'`.

**PHASE TO ADDRESS.** Phase 17 (Parser & Etched). This is co-located with binder ingest because both are Manabox CSV column changes. The downstream display fixes (`cart-item.tsx`, `card-modal.tsx`) belong in Phase 17 as well.

---

### Pitfall 8 — Binder-picker preview latency on 12,749-row CSV

**WHAT.** The binder-picker UI needs the FULL set of binder names + per-binder row counts before it can render the picker. With 12,749 rows across 30+ binders, the naive flow is:

1. POST CSV(s) → server parses synchronously into `Card[]` (~500ms).
2. Server enriches with Scryfall (~150 cards × ~50ms cached / 100ms uncached = 7-15s for new cards).
3. Server returns full preview payload.

The current implementation (`src/app/api/admin/import/preview/route.ts:51-122`) streams NDJSON progress lines during the enrichment step. With binder-aware preview, the binder picker must render BEFORE enrichment completes (otherwise the operator stares at a progress bar for 15s before they can choose binders to include).

**HOW IT MANIFESTS.** Three failure modes:

- **Mode A — picker blocks on enrichment.** If you wait until enrichment is done, the operator waits 15s for a UI that's just "name + checkbox" per binder. This is a regression from v1.2 (which has no picker, so 15s was acceptable as the only step).
- **Mode B — out-of-memory parse.** Naively, `parseManaboxCsvContents` (`src/lib/csv-parser.ts:256-275`) loads every file as a string, runs PapaParse on each, and returns the merged `Card[]` in memory. At 12,749 rows × ~500 bytes/Card = ~6MB. This fits in the Vercel Function 1024MB heap, so this is NOT actually an OOM concern at the documented scale. But it is at 5× scale (~63MB) — flag for future.
- **Mode C — preview sample staleness.** The preview shows a 20-row sample (`preview/route.ts:77`). If the picker filters out a binder, the sample MUST be re-computed from the post-filter row set. A naive implementation re-runs the parser; a smart one filters the in-memory list.

**Streaming question:** Can the binder-picker render BEFORE enrichment? Yes — parsing (the step that produces binder names + row counts) is local CPU, fast (~500ms for 12,749 rows). Enrichment is the slow part. Two-stage stream:

```
Stream message 1: { type: 'binders', binders: [{name: 'A02', rowCount: 423, finishMix: {...}}, ...] }
                   → UI renders picker immediately (<1s after upload).
Stream message 2..N: { type: 'progress', done, total, stage: 'enrich' }
                   → After operator confirms binder selection, enrichment runs ONLY for selected binders.
Stream final: { type: 'result', preview: {...} }
```

**Latency budget.**
- Upload + parse + binders message: ≤ 2s for the picker to render (target).
- Enrichment of selected binders (say 3 of 30 = ~1,275 cards): ~10-20s with Scryfall cache hits, ~2-3 min for fresh cards. The existing `maxDuration = 300` (5 min) at `preview/route.ts:17` covers this.

**PREVENTION.**

1. **Two-stage NDJSON contract.** Extend `ImportStreamMessage` (in `src/lib/import-contract.ts`) with a new `'binders'` message kind that fires after parse, before enrichment:

   ```ts
   type ImportStreamMessage =
     | { type: 'binders'; binders: BinderSummary[] }   // NEW
     | { type: 'progress'; done: number; total: number; stage: 'enrich' }
     | { type: 'result'; preview: PreviewPayload }
     | { type: 'error'; message: string };
   ```

2. **Two-call flow vs one-call hold-and-resume.** Two options:
   - **Two-call (recommended for v1.3 simplicity):** First call returns binder summary only. UI renders picker. Operator picks. Second call (`POST /api/admin/import/preview/enrich`) takes the parsed-cards payload + selected binder list and runs enrichment. Stateless, no server-side parsed-cards cache. Simpler.
   - **Hold-and-resume:** Single fetch holds the connection open after the `binders` message and waits for a confirmation header from the client before continuing. More elegant but requires a request body upgrade pattern that doesn't fit Next.js Route Handlers cleanly.

   **Recommend two-call.** Server returns parsed cards in the binders response (compressed by setCode prefix to save bytes), client posts back the subset for enrichment.

3. **Stream-friendly parser.** PapaParse supports a streaming mode (`step:` callback, see `node_modules/papaparse/papaparse.js`). For v1.3 at 12,749 rows the synchronous parse is fast enough (~500ms in Node 22 measured on similar workloads). Add a perf pin (`expect parseTime < 2000`) but don't switch to streaming yet — defer until 5× scale.

4. **Binder summary computation.** In the same parse pass, group by binder name into a `Map<binderName, {rowCount, sampleNames: string[]}>`. The 30 binder summaries serialize to ~5KB. Send as the first NDJSON line.

5. **Cache the parsed-cards payload between picker render and enrichment kick.** Two-call flow means the client holds the parsed cards. Send compressed JSON (gzip on response, browsers auto-decompress; Vercel runtime supports `Content-Encoding: gzip`). Or better: skip Scryfall enrichment for the unselected binders entirely, so the second call has fewer cards to enrich.

**DETECTION.** A perf test asserting `parseManaboxCsvContents(12_749_rows) < 2000ms`. A user-flow test (Playwright) that uploads a fixture of 12,749 rows and asserts the binder picker is rendered within 3s. An OOM-watcher in the route handler (`process.memoryUsage().heapUsed` log when it exceeds 256MB) flagged in Vercel logs.

**PHASE TO ADDRESS.** Phase 19 (Import Preview / Picker). The streaming protocol design is the deliverable; verification gate is the perf pin + Playwright test.

---

### Pitfall 9 — "Remembered selection" silently drops binders the operator forgot

**WHAT.** Spec says: "selection is remembered between imports." Operator selects binders A01, A02, A05 in March, runs import. In May, operator imports a fresh export, sees A01, A02, A05 pre-checked. They click "Import" without scanning the picker, but the May export contains a NEW binder A07 (a recent purchase). A07 is NOT in the remembered selection, so:

- Scoped replace runs against `binder IN ('A01', 'A02', 'A05')`.
- A07's rows are silently NOT imported.
- Storefront shows zero stock for everything that was only in A07.
- Operator notices a week later when a buyer asks "where's the rare card I saw in your photos?".

The opposite failure: operator's January import included a temporary loaner binder X that they no longer have. May export omits X. Remembered selection still includes X. Scoped replace runs against `binder IN ('A01', 'A02', 'A05', 'X')` — X has zero rows in the new CSV → scoped replace deletes X (because the scope is "selected binders, replaced with new contents, even if new contents are empty"). This one is actually correct behavior, but only if the operator understands that "remembered selection includes a binder you no longer have" means "delete it from inventory."

**HOW IT MANIFESTS.** localStorage key (likely `viki-import-binder-selection`) holds a string array. The picker mounts and reads it, pre-checks each matching binder name. New binders in the upload are unchecked by default. Operator scans 30 checkboxes and either notices the unchecked new one or doesn't.

**PREVENTION.**

1. **Default-on for new binders, default-off for missing-from-export binders.** When the picker renders, the rules are:
   - Binder in CSV AND in remembered selection → checked, normal styling.
   - Binder in CSV AND NOT in remembered selection → checked AND highlighted ("New: A07 — 142 rows"). Operator must explicitly uncheck.
   - Binder in remembered selection AND NOT in CSV → shown above the CSV-binders section in a separate "Will delete from inventory" panel, checked, highlighted red. Operator must explicitly uncheck (or confirm).

2. **A confirmation summary before commit.** Before the destructive scoped replace, a modal: "This import will: ADD 142 rows to A07. REPLACE 423 rows in A02. DELETE 89 rows from binder X (no longer in your export). [Cancel] [Confirm import]." This is the same pattern as the existing v1.2 import flow's confirmation step (`src/app/admin/import/_components/import-client.tsx:259-344`) — extend it with the per-binder action breakdown.

3. **Audit metadata captures the actual decision.** The audit log entry for the import (action `inventory.import_commit`) should include `selectedBinders: ['A01', 'A02', 'A05', 'A07']` and `unselectedBinders: ['X']` so post-hoc you can reconstruct what the operator chose. (See Pitfall 13 for the bounded representation.)

4. **Pin with a UAT.** Phase 22 UAT: "operator opens importer with remembered selection, CSV contains a new binder, operator confirms without scanning. Verify: confirmation modal lists the new binder under 'WILL ADD'. If operator clicks Confirm, the new binder IS imported."

**DETECTION.** A user-test scenario where the operator hits the picker on autopilot. Telemetry: log when remembered selection differs from CSV binder set (warning level), so post-hoc you can see how often this happens.

**PHASE TO ADDRESS.** Phase 19 (Import Preview / Picker). UX pattern is the deliverable.

---

### Pitfall 10 — Binder name typo: `"A02 "` (trailing space) vs `"A02"`

**WHAT.** Manabox is a free-form text field for binder names. Operator types `"A02"` for one binder, `"A02 "` (with trailing space) for another, `"a02"` for another, all in different sessions. CSV exports preserve the literal strings. Without normalization, the importer treats these as 3 distinct binders.

**HOW IT MANIFESTS.** Three downstream effects:

1. **Picker UI shows ghost duplicates.** `A02`, `A02 `, `a02` listed as 3 separate checkboxes. Operator gets confused.
2. **Scoped replace misses real intent.** Operator selects `A02` in the picker. Scoped replace runs against `binder = 'A02'`. The `A02 ` rows are untouched, the `a02` rows are untouched. The new CSV's `A02 ` rows are inserted as a separate fourth binder.
3. **Allocator pick order is non-deterministic.** Two equivalent binders sort differently (`A02 ` < `A02` because trailing space sorts low in some collations). Allocator's `ORDER BY binder ASC` produces the wrong physical-pick order ("pull from A02 ", which the operator reads as A02, but it's actually a different slot).

**PREVENTION.**

1. **Normalize at parse time.** In `src/lib/csv-parser.ts` (the `rowToCardOrSkip` function around line 37-106), add:

   ```ts
   const rawBinder = row['Binder Name'];
   const binder = String(rawBinder ?? 'unsorted').trim().toLowerCase().replace(/\s+/g, ' ');
   ```

   - `trim()` kills leading/trailing whitespace.
   - `toLowerCase()` collapses case.
   - `replace(/\s+/g, ' ')` collapses internal whitespace runs.

   The normalized string is what goes into `cards.binder` and into the composite id.

2. **Display the original name once for confirmation.** When the picker first encounters a new normalized binder name, store both the normalized form and the first observed raw form (e.g., `A02 (original: "A02 ")` if they differ). After the operator confirms, never display the raw form again — DB only sees the normalized form.

3. **Preview the dedup.** On the binder summary message (Pitfall 8), include `dedupedFrom: ['A02 ', 'A02', 'a02']` for any binder where 2+ raw forms collapsed. Show this in the picker UI so the operator can verify intent.

4. **Pin with a parser test.** Add to `csv-parser-content.test.ts`: "given two CSV rows with `Binder Name: 'A02'` and `Binder Name: 'A02 '`, expect parsed cards to share the same normalized binder field AND collapse into one row when sums match (or two rows distinguished by other fields)."

**DETECTION.** A unit test on the normalizer. A pre-import warning if the binder count after normalization is less than the binder count before. Post-hoc query: `SELECT binder, COUNT(*) FROM cards GROUP BY binder, LOWER(TRIM(binder)) HAVING COUNT(DISTINCT binder) > 1` — should return zero rows in production.

**PHASE TO ADDRESS.** Phase 17 (Parser & Etched). Co-located with the Manabox column ingest because both are CSV-side concerns.

---

### Pitfall 11 — Storefront stock changes mid-cart-session, cart shows phantom stock

**WHAT.** Buyer adds 3 of card X to cart. Storefront aggregated display showed 8 available (across A02, A05, A07). Buyer leaves the tab open for 4 hours. In the meantime, admin imports a new CSV that drops binder A07 (which contained 5 of X). Aggregated stock is now 3. Buyer's cart UI is stale: shows quantity 3, max 8 (cached at add-to-cart time). Buyer hits checkout.

The allocator finds X across A02 + A05 → 3 available. Equals what the buyer asked for → success. **Lucky case.** Buyer gets exactly what their cart said; they got the LAST 3.

The unlucky case: the import drops A02 + A07 (8 → 0 of X). Buyer's cart shows quantity 3, max 8. Buyer hits checkout. Allocator returns `stock_conflict: { cardId: X, requested: 3, available: 0 }`. The Phase 11 buyer-facing UI handles this — confirmed by `src/app/checkout/checkout-client.tsx` (per Phase 11-01-SUMMARY:46-48 "preserves cart and form state for all checkout errors") — but the buyer's experience is "I had 3 in cart for hours, hit checkout, was told 'no longer available'."

**HOW IT MANIFESTS.** This is **structurally identical to v1.2 today** — admin runs `replaceAllCards()` (full inventory replace), buyer's cart references stale ids, the Phase 10 D-13 reconciliation pattern at `cart-page-client.tsx:40-47` silently strips the stale ids. The buyer just sees their cart get smaller.

The v1.3 difference: with binder-aware aggregation, more buyer carts will hit "card still exists, but lower stock" rather than "card id no longer exists." Stale-stock conflicts at checkout will be more common than stale-id stripping at cart-display.

**PREVENTION.**

1. **Reuse and extend the existing reconciliation pattern.** In `cart-page-client.tsx`, the D-13 effect strips stale ids. v1.3 extends it: also re-clamp quantities to current `cardMap.get(id).quantity`:

   ```tsx
   useEffect(() => {
     if (!hydrated) return;
     for (const [cardId, qty] of items) {
       const card = cardMap.get(cardId);
       if (!card) {
         removeItem(cardId);  // existing D-13
         continue;
       }
       if (qty > card.quantity) {
         setQuantity(cardId, card.quantity);  // NEW: clamp to current aggregated stock
         // No toast — silent clamp matches the silent strip pattern (D-13).
       }
     }
   }, [hydrated, items, cardMap, removeItem, setQuantity]);
   ```

2. **At checkout, the allocator is the final source of truth.** The aggregated `card.quantity` shown in the cart is a hint; the allocator's atomic count at commit is canonical. The Phase 11 stock_conflict response handles the loser case. Do NOT add a separate "is the cart still valid?" pre-check API — it's a TOCTOU race anyway, and the existing transactional check at commit is correct.

3. **Buyer confirmation message on stock_conflict should be clear about aggregation.** Today: "Some cards are no longer available." For v1.3: "Some cards now have less stock than your cart. We've adjusted the quantities; please review." (with conflict details). The allocator returns aggregated `available`, so the message is naturally aggregation-aware.

4. **Pin with a test.** `src/app/cart/__tests__/reconciliation.test.tsx`: given pre-hydrated cart with `{X: 5}` and current `cardMap = {X: {quantity: 3}}`, after reconciliation effect runs, expect cart state to be `{X: 3}`.

**DETECTION.** A user-visible "we adjusted your cart" toast on the cart page (vs the silent clamp) would be the kind alternative. Operationally: a metric counting `checkout.stock_conflict` events (already logged at `src/app/api/checkout/route.ts:117-121`) — if it spikes after an import, a notice could be sent.

**PHASE TO ADDRESS.** Phase 20 (Storefront Aggregation & Cart Migration). Reconciliation extension; the existing pattern is the integration point.

---

### Pitfall 12 — Multi-CSV merge sums quantities across binders, losing the binder dimension

**WHAT.** Today `parseManaboxCsvContents()` at `src/lib/csv-parser.ts:256-275` does:

```ts
return { cards: mergeCards(cards), skippedRows, sourceFiles };
```

Where `mergeCards()` (lines 141-154) sums quantities by composite id `${setCode}-${collectorNumber}-${foil}-${condition}`. If the same logical card appears in two binders A02 and A05 in the same import batch, the merge collapses them into ONE row with summed quantity. **The binder dimension is destroyed at parse time.**

For v1.3, this is exactly wrong: A02 and A05 should remain separate rows with separate quantities.

**HOW IT MANIFESTS.** Walk-through:
- CSV-1.csv (binder A02): `Mountain (sld-001-normal-NM), qty 2, Binder Name: A02`.
- CSV-2.csv (binder A05): `Mountain (sld-001-normal-NM), qty 2, Binder Name: A05`.
- Today: parser produces `{ id: 'sld-001-normal-NM', qty: 4 }`.
- v1.3 incorrect (binder added but merge unchanged): if the binder field is added to `Card` and to the row body, but the id is NOT updated to include binder, then `mergeCards()` sums across binders (collapses the dimension) AND the binder field on the resulting Card is whichever binder's row was processed first.

**The pitfall is the dependency chain.** If v1.3 implements binder-as-a-data-field but forgets to include binder in the composite id, the parser's merge silently collapses cross-binder rows.

**PREVENTION.**

1. **Include binder in the composite id (re-confirm Pitfall 7 + Pitfall 4).** This is the load-bearing change. Once binder is in the id, `mergeCards()` correctly keeps cross-binder rows separate.

2. **Add a parser test that pins the cross-binder behavior.** In `csv-parser-content.test.ts`:

   ```ts
   it('keeps the same logical card in two binders as two stock rows', () => {
     const csv1 = makeCsv([{ ...sampleRow, 'Binder Name': 'A02', Quantity: 2 }]);
     const csv2 = makeCsv([{ ...sampleRow, 'Binder Name': 'A05', Quantity: 2 }]);
     const result = parseManaboxCsvContents([
       { fileName: 'a02.csv', content: csv1 },
       { fileName: 'a05.csv', content: csv2 },
     ]);
     expect(result.cards).toHaveLength(2);
     expect(result.cards.map(c => c.binder).sort()).toEqual(['a02', 'a05']);
   });
   ```

3. **DO sum quantities WITHIN the same binder across CSVs.** If two CSVs both have the same card in A02 (operator exported A02 twice for some reason), merge them correctly: `id` includes binder, so `mergeCards()` sums them naturally.

**DETECTION.** Post-import sanity check: `SELECT COUNT(DISTINCT binder), COUNT(*) FROM cards` — if `count(distinct binder) === 1` after a multi-binder import, something collapsed. The parser test above is the regression pin.

**PHASE TO ADDRESS.** Phase 17 (Parser & Etched) — this is part of the same parser change as the binder ingest.

---

### Pitfall 13 — Audit log for partial-replace import: too coarse vs unbounded metadata

**WHAT.** Admin selects 3 of 30 binders for a partial replace. The Phase 14 audit log entry must capture WHAT happened:

- Too coarse: `action: 'inventory.import_commit', metadata: {}` — operator can't reconstruct which binders.
- Too fine: `metadata: { binders: ['A01', 'A02', 'A05'], cardsBeforePerBinder: {...full breakdown...}, cardsAfterPerBinder: {...}, deletedRows: [...12,749 ids...] }` — blows past the existing 4096-byte cap (`MAX_AUDIT_METADATA_BYTES` at `src/db/queries.ts:224`), gets truncated to `{ truncated: true, summary: '...' }` (lines 281-288), forensic information lost.

**HOW IT MANIFESTS.** The existing audit sanitizer (`sanitizeAdminAuditMetadata`, `src/db/queries.ts:277-288`) hard-truncates to 4096 bytes serialized JSON. 30 binder names averaging 4 chars each + per-binder counts → roughly:

```json
{"selectedBinders":["A01","A02","A05",...,"A30"],"countsBefore":{"A01":423,"A02":156,...},"countsAfter":{...}}
```

That's ~30 binders × ~30 chars per `"A01":423,` × 2 (before+after) = ~1800 bytes. Comfortably under the cap. Full row id lists ARE over the cap.

**The bounded representation:**

```json
{
  "selectedBinders": ["A01", "A02", "A05"],
  "totalBindersInExport": 30,
  "scopedReplaceCounts": {
    "before": { "A01": 423, "A02": 156, "A05": 89 },
    "after":  { "A01": 412, "A02": 158, "A05": 91 },
    "deletedFromUnselected": 0
  },
  "totalCardsAfterImport": 12749,
  "newBindersInExport": ["A07"],
  "missingBindersFromExport": ["X"]
}
```

Total: ~1.5KB serialized. Well within the cap. Forensic-complete: any audit reader can answer "which binders did we touch, what was the size delta, did anything outside the scope change."

**PREVENTION.**

1. **Author the metadata shape during Phase 19 (importer).** Lock the contract in a TypeScript type:

   ```ts
   interface ScopedImportAuditMetadata {
     selectedBinders: string[];      // normalized form (Pitfall 10)
     totalBindersInExport: number;
     scopedReplaceCounts: {
       before: Record<string, number>;
       after: Record<string, number>;
       deletedFromUnselected: 0;     // literal type — must be 0 for scoped replace
     };
     totalCardsAfterImport: number;
     newBindersInExport: string[];
     missingBindersFromExport: string[];
   }
   ```

2. **Add a sanity check at write time.** `deletedFromUnselected: 0` is the invariant — if a scoped replace touches anything outside the selected binders, the import is buggy. Throw before audit insert if non-zero.

3. **Include the audit metadata in the existing `replaceAllCards()` path.** Today the audit metadata is `{ insertedCards: rows.length }` (`src/db/queries.ts:823-824`). For v1.3, extend to merge the `ScopedImportAuditMetadata` shape. The existing `AdminMutationAuditContext.metadata` field accepts `Record<string, unknown>` so the type is permissive; the test pins are what enforce the shape.

4. **Pin with an audit test.** `src/db/__tests__/admin-audit.test.ts` (existing, per `15-SECURITY-REVIEW.md:84` "Phase 14 test suite pins both the redaction and the truncation behavior") — add: "scoped import commit metadata fits under MAX_AUDIT_METADATA_BYTES with 30 selected binders."

**DETECTION.** A test asserting `JSON.stringify(buildAuditMetadata(30Binders)).length < 4096`. A grep for `truncated: true` in `admin_audit_log.metadata` in production — if any import audit row is truncated, the metadata shape is too verbose.

**PHASE TO ADDRESS.** Phase 19 (importer audit shape) + Phase 21 (admin audit page rendering of the new fields).

---

## Moderate Pitfalls

### Pitfall 14 — Allocator pick order is non-deterministic across deploys

**WHAT.** Allocator picks 3 of X across A02 (2) and A05 (2). Decrements 2 from A02, 1 from A05. Tomorrow's deploy changes the `ORDER BY` clause subtly (e.g., `ORDER BY binder ASC` → `ORDER BY quantity ASC`) and the same buyer hitting the same allocator gets 1 from A02 + 2 from A05. The seller pulls the wrong physical pile.

**PREVENTION.** Document the pick order in code comments + pin with a test asserting the exact pick output for a known input. Recommend pick order: `ORDER BY binder ASC, quantity DESC` (drain alphabetically-first binder fully before moving to the next, matching the seller's mental model of "go to A02, take what I can, then go to A05").

**PHASE TO ADDRESS.** Phase 18 (Allocator).

---

### Pitfall 15 — Empty binder rows after scoped replace are not garbage-collected

**WHAT.** Scoped replace inserts new rows for binder A02. Some of A02's previous cards (sld-005, sld-009) are not in the new export. The current `replaceAllCards()` deletes EVERYTHING then inserts. The scoped variant deletes WHERE `binder IN (selectedBinders)` then inserts. Result: any card that was previously in A02 but not in the new A02 export is correctly removed. **Good.**

The pitfall is the OPPOSITE direction: a card was previously in A02 with quantity 2, and A02's new export has the same card with quantity 0. The CSV row has `quantity: 0`. The parser today treats `quantity: 0` as a valid card row (because Manabox uses 0 to mean "I have this card listed but currently zero copies"). The scoped replace inserts a `(card, A02, qty=0)` row. The storefront aggregation correctly excludes it. The admin inventory table shows a phantom 0-stock row. Operator confused.

**PREVENTION.** Filter `quantity > 0` rows at parse time. Today the parser doesn't do this (`csv-parser.ts:98` — `quantity: row.Quantity ?? 1`). Add a SkippedRow with reason `'zero quantity'` for `Quantity === 0`. Or filter post-merge.

**PHASE TO ADDRESS.** Phase 17 (Parser).

---

### Pitfall 16 — Binder filter UI in admin causes paging skew

**WHAT.** Admin inventory table at `getAdminCards()` (`src/db/queries.ts:639-686`) supports page/limit/search/set/condition. v1.3 adds binder filter. Naive: add `if (binder) conditions.push(eq(cards.binder, binder))`. Done.

The pitfall: the admin's `breakdowns.bySet/byColor/byRarity` in `getAdminDashboardStats()` at `queries.ts:584-636` does NOT take a filter. The dashboard counts every card. After v1.3, if "binder" is exposed as a dashboard breakdown (one option: yes, helps operator see "I have 5,234 cards in unsorted, time to sort them"), it's a new breakdown dimension. The breakdown loop at lines 605-620 loads all rows and accumulates. At 12,749 rows × 30 binders, the result map has 30 entries. Fine.

**PREVENTION.** Add `byBinder: Array<AdminDashboardBreakdown & { binder: string }>` to `AdminDashboardStats`. Don't load by binder filter in the dashboard query (unfiltered total is what the dashboard wants). The pitfall is minor; flagging for completeness.

**PHASE TO ADDRESS.** Phase 21 (Admin Visibility).

---

### Pitfall 17 — Order detail showing `[binder]` annotation must NOT use `cards.binder` directly

**WHAT.** Spec: "Admin order detail shows `[binder]` annotation on every line item." The naive implementation joins `order_items` to `cards` on `card_id` and pulls `cards.binder`. Two failures:

1. After a re-import, the underlying `cards` row may have a different binder (or be deleted). The annotation lies — shows the CURRENT binder, not the binder the card was pulled from at order time.
2. The order_items snapshot at `src/db/schema.ts:175-202` is by design denormalized (no FK, see Pitfall 3). Joining to `cards` for the binder annotation undermines that design.

**PREVENTION.** Add `binder` to the `order_items` table as a snapshot column. Capture it at `placeCheckoutOrder()` time (the allocator already touches per-binder rows; copy the binder into the inserted order_items row). The annotation reads from the snapshot, not from the live `cards` table.

**Schema change:** `order_items` gets a new `binder` column. Existing historical rows get NULL — UI shows `[unsorted]` or omits the annotation for rows where `binder IS NULL` (pre-v1.3 orders).

**PHASE TO ADDRESS.** Phase 18 (Allocator captures binder into order_items) + Phase 21 (admin order detail renders the annotation).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Append `binder` to existing composite id (vs introduce new structured id format) | One-line schema change; existing string-based PK code works unchanged | Re-encoding the id when binder changes is expensive; collisions if binder name contains `-`; 5-segment id breaks the segment-count guard in cart reconciliation (Pitfall 5) | Acceptable in v1.3 IF binder names are normalized aggressively (Pitfall 10) and the cart reconciliation is segment-count-aware |
| Skip etched fix in v1.3 ("we'll do it later") | Smaller v1.3 diff | Etched cards mis-priced + mis-merged in 30+ binders. Migration cost grows with every fresh import. | Never — v1.3 is the natural moment because Manabox columns are already being touched |
| Single `Card` type with `binder?: string` (vs PublicCard/AdminCard split) | One-line type change | TypeScript can't catch leak at compile time; relies on runtime tests on every public route | Acceptable only if runtime invariant tests cover ALL public surfaces; better to split types |
| Cache parsed-cards on the server between picker and enrichment (vs round-trip via client) | Slightly less network | Server-state across requests violates the route-handler statelessness; needs Redis or cookies, both new infra | Never for v1.3; round-trip via client is fine |
| Return per-binder breakdown in stock_conflict response ("for debugging") | One less query in admin diagnostics | Binder name leak (Pitfall 6); breaks the existing aggregated contract | Never for the public conflict shape; ok for admin-only debug logs |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Naive parse of multi-CSV upload, all in memory | Vercel Function memory spike >256MB | Two-stage NDJSON streaming (Pitfall 8); skip enrichment for unselected binders | At ~5× current scale (~63K rows) |
| Allocator runs N+1 row locks | Concurrent checkouts serialize per-row, latency spikes from ~80ms to ~500ms | Single CTE with `FOR UPDATE` on the joined set (existing Phase 11 pattern, extend it) | At ~50 concurrent buyers (well above friend-store scale; flag for future) |
| Storefront aggregated query does GROUP BY on every page load | Postgres CPU spike on `getCards()`; slow first-paint | Add an index on `(setCode, collectorNumber, foil, condition)` so the aggregation is index-only; or cache the aggregated view in app memory with a re-import invalidation hook | At ~50K rows; 12,749 is comfortably below |
| Binder picker UI re-renders on every checkbox click with full payload | UI sluggish at 30+ binders | React `useMemo` on the per-binder card lists; checkbox state is local only | Already at 30 binders today |
| Dashboard breakdown loops 12,749 rows in JS, not SQL | First paint of `/admin` slow | Already in app code at `queries.ts:605-620`; works today; flag for SQL aggregation if scale grows | At ~50K rows |

---

## Security Mistakes (delta vs Phase 15 STRIDE)

Reference: `15-SECURITY-REVIEW.md` for existing findings. v1.3 deltas:

| Mistake | Risk | Prevention |
|---|---|---|
| `binder` column included in storefront SSR payload | I-DISC-05 (new). Public visitor sees physical inventory layout. Reconnaissance for theft (low for friend-store, medium for any wider deployment) | Public/Admin Card type split (Pitfall 6); per-route invariant test; never expose binder via any public route |
| Per-binder breakdown in stock_conflict response | I-DISC-05 amplification. Buyer's failed checkout reveals binder names. | Aggregate `available` in the conflicts CTE (Pitfall 6) |
| Audit log metadata for scoped replace exceeds bounded shape | T-02 amplification. Truncated metadata loses forensic value. | Bounded shape (Pitfall 13); audit-shape pin test |
| Import preview now does heavier work (binder grouping + maybe enrichment of all binders) without rate limit | D-DOS-01 amplification (already deferred at Medium). v1.3 makes the per-call cost higher. | Apply the deferred D-DOS-01 fix (`ADMIN_BULK` rate limit on preview route) IN v1.3. Phase 22 is the right moment. |
| New `etched` price ladder pulls Scryfall data not previously requested | No new risk; Scryfall is already a dependency. | None — verify cache key still distinguishes finishes (`src/lib/cache.ts`). |
| Binder name reflected in DB error messages (e.g., FK violation on a fictional `binders` table) | Low; would only leak via 500 response. | Don't add a separate `binders` table — keep binder as a free-text column on `cards`. |

**STRIDE summary:** No new High items. One new Medium (I-DISC-05 binder leak). One amplification of existing Medium (D-DOS-01 import preview). Phase 22 owns the STRIDE delta document.

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Buyer sees aggregated stock, then gets stock_conflict at checkout | Confusion: "but it said 8 available" | Make the buyer message after stock_conflict explicit about adjustment (Pitfall 11) |
| Operator imports without scanning the binder picker | Missing imports for new binders, deleted imports for missing-from-export binders (Pitfall 9) | Confirmation modal with per-binder action breakdown |
| Cart silently empties after v1.3 deploy because of key migration | Buyer thinks site lost their cart | One-time toast on first v1.3 visit (Pitfall 5) |
| Admin order detail shows current binder, not order-time binder | Operator pulls from wrong binder for old orders | Snapshot binder into order_items (Pitfall 17) |
| Etched cards display as "normal" | Buyer expects normal-finish card, gets etched. Refund/return friction. | Fix etched as a third finish enum (Pitfall 7). Display "Foil" / "Etched" / nothing in cart-item. |
| Picker shows ghost binders due to typo | Operator confused by 33 binders when they expected 30 | Normalize binder names + show dedup summary (Pitfall 10) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Allocator:** Concurrent-checkout proof passes for the multi-binder case (extend Phase 11 harness; not just unit tests of the CTE shape).
- [ ] **Migration:** Run on Neon branch, diff `order_items` unmatched count, confirm zero new mismatches before merging to main.
- [ ] **Cart migration:** DevTools-create a v1.2 localStorage cart, deploy v1.3 locally, verify hydration translates the keys (vs silently empties).
- [ ] **Binder leak:** Per-route invariant test for `GET /`, `GET /cart`, `POST /api/checkout` — JSON.stringify(response) has no `binder`.
- [ ] **Etched:** Parser test asserts `Foil: 'etched'` produces `finish: 'etched'` AND a distinct id from `normal`/`foil`.
- [ ] **Picker UX:** UAT with the operator running on autopilot — does the confirmation modal catch them?
- [ ] **Audit metadata:** Pin test for `ScopedImportAuditMetadata` size with 30 binders.
- [ ] **Order_items snapshot:** Insert a v1.2-shape order, run v1.3 migration, verify the order detail page renders without a 500 (the cardId text snapshot still resolves OR gracefully degrades).
- [ ] **Quantity constraint:** `CHECK (quantity >= 0)` exists on `cards` after migration; intentional over-decrement test confirms 503, not silent oversell.
- [ ] **Binder normalization:** Parser test for `'A02'` vs `'A02 '` vs `'a02'` collapses to one normalized form.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| 1. Allocator double-decrement | HIGH | Detect via `quantity < 0` row in production. Roll back via `pg_dump` backup. Re-run migration with `CHECK (quantity >= 0)` constraint. Re-deploy with the lock-by-logical_id fix. |
| 4. Migration corruption | HIGH | Pre-flight check should prevent. If it slips: restore from `pg_dump`, fix the migration script idempotency, retry on Neon branch first. |
| 5. Cart-key migration empties carts | LOW | Add the segment-count guard + reconciliation extension. Push patch deploy. Buyers re-add manually if needed (small friend-store; acceptable). |
| 6. Binder leak in production | MEDIUM | Hotfix the public response shape. The leaked names are in browser caches and may be in third-party logs (Vercel) — rotation of binder names is the only "true" fix. For a friend-store, accept the leak and add the invariant tests. |
| 7. Etched displayed as normal | MEDIUM | Fix the parser, schedule a re-import of the affected binders. Run a SQL audit: `SELECT * FROM cards WHERE id LIKE '%-normal-%' AND scryfall_id IN (SELECT id FROM scryfall_etched_printings)` to find affected rows. Manually flag with the operator before re-import. |
| 9. Operator forgets a new binder | LOW | Re-run the import with the new binder selected. Scoped replace handles it correctly. |
| 17. Admin order detail shows wrong binder | LOW | Snapshot column added to order_items in v1.3 forward; historical orders show `[unsorted]` (acceptable for friend-store). |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1. Allocator double-decrement | Phase 18 (Allocator) | Multi-binder concurrent-checkout proof; CTE shape pin in `src/db/__tests__/orders.test.ts`; `CHECK (quantity >= 0)` schema constraint |
| 2. Partial allocation contract break | Phase 18 (Allocator) | Regression test in `orders.test.ts`: aggregated `available`, no partial-fulfill branch in result type |
| 3. order_items FK survival | Phase 16 (Schema) + Phase 19 (scoped replace) | Schema invariant test (no FK on order_items.cardId); admin order detail handles missing card row |
| 4. Migration corruption | Phase 16 (Schema & Migration) | Pre-flight assertion script; Neon branch dry-run; CI runs migration twice and asserts second run is no-op |
| 5. Cart-key migration silent empty | Phase 20 (Cart Migration) | Reconciliation extension + segment-count guard; `cart-store.test.ts` localStorage round-trip |
| 6. Binder leak | Phase 20 (public type split) + Phase 22 (STRIDE delta) | Per-route JSON.stringify invariant test for every public route; email template snapshot test |
| 7. Etched silent mishandle | Phase 17 (Parser & Etched) | Parser test for `Foil: 'etched'`; schema includes `finish` enum; price ladder uses finish, not foil-bool |
| 8. Picker preview latency | Phase 19 (Import Preview) | Perf pin `parseManaboxCsvContents(12_749) < 2000ms`; Playwright test for picker render time |
| 9. Remembered selection drops new binder | Phase 19 (Import Preview) | Confirmation modal listing per-binder ADD/REPLACE/DELETE; UAT in Phase 22 |
| 10. Binder name typo | Phase 17 (Parser) | Normalization unit test; pre-import dedup summary in picker |
| 11. Stock changes mid-cart | Phase 20 (Cart Migration) | Reconciliation effect clamps quantities; `stock_conflict` message updated |
| 12. Multi-CSV merge collapses binder dimension | Phase 17 (Parser) | Parser test for two CSVs same card different binders → two rows |
| 13. Audit metadata too coarse / unbounded | Phase 19 (importer audit shape) + Phase 21 (audit page) | `ScopedImportAuditMetadata` type + size pin test under 4096 bytes |
| 14. Pick order non-deterministic | Phase 18 (Allocator) | Test asserting exact pick output for a known multi-binder input |
| 15. Zero-quantity rows persist after import | Phase 17 (Parser) | Filter `Quantity === 0` rows at parse time; SkippedRow with reason |
| 16. Dashboard byBinder breakdown | Phase 21 (Admin Visibility) | Add `byBinder` to `AdminDashboardStats`; minor — flag for completeness |
| 17. Order detail uses live `cards.binder` | Phase 18 (allocator captures binder snapshot) + Phase 21 (UI reads snapshot) | `order_items.binder` snapshot column; UI never joins to `cards` for the annotation |

---

## Sources

Internal codebase references (HIGH confidence — read directly during research):

- `src/db/orders.ts:369-517` — current `placeCheckoutOrder()` CTE with `FOR UPDATE` lock, `requested_agg`, `conflicts`, `stock_write`, `inserted_order`, `inserted_items` pipeline.
- `src/db/queries.ts:799-861` — `replaceAllCards()` using `db.batch([...])` (not interactive transactions; Neon-HTTP limitation comment).
- `src/db/queries.ts:220-288` — audit sanitization: `MAX_AUDIT_METADATA_BYTES = 4096`, `SENSITIVE_AUDIT_KEY_PATTERN`, `RAW_CONTENT_AUDIT_KEY_PATTERN`.
- `src/db/schema.ts:23-61, 175-202` — `cards` PK is text id; `order_items` has NO FK to cards (denormalized snapshot, line 184 comment).
- `src/lib/csv-parser.ts:37-106, 141-154, 256-275` — `rowToCardOrSkip` builds id as `${setCode}-${collectorNumber}-${foil ? "foil" : "normal"}-${condition}`; `mergeCards` sums by id; `parseManaboxCsvContents` runs across multi-file uploads.
- `src/lib/csv-parser.ts:87` — `const foil = row.Foil === "foil"` — etched silently becomes `false` (Pitfall 7).
- `src/lib/types.ts:10` — `Foil: "foil" | "normal"` — type missing `etched` (Pitfall 7).
- `src/lib/types.ts:91` — `usd_etched: string | null` — Scryfall already distinguishes; price ladder at `enrichment.ts:53-55` already supports the fallback.
- `src/app/cart/cart-page-client.tsx:38-47` — D-13 Phase 10 reconciliation pattern: silent strip of stale cart ids on hydration. Right place to extend for v1.3 cart-key migration.
- `src/lib/store/cart-store.ts:67-87` — Zustand persist with custom Map serializer to localStorage key `viki-cart`.
- `src/components/cart-item.tsx:191` — `card.foil ? " · Foil" : ""` — display logic that needs updating for etched.
- `src/app/api/admin/import/preview/route.ts:51-122` — NDJSON streaming with `progress`/`result`/`error` message kinds; `maxDuration = 300` for fresh-binder Scryfall enrichment.
- `src/app/admin/import/_components/import-client.tsx:101-145` — client-side NDJSON reader pattern; preserved for v1.3 picker stream extension.
- `src/app/api/checkout/route.ts:117-121` — stock_conflict logging metadata is `{conflictCount}` only — must NOT add binder breakdown for Pitfall 6.
- `src/app/api/admin/cards/route.ts:12-64` — pattern for `GET /api/admin/cards` admin-only data fetch; no public equivalent today (no `/api/cards`).
- `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` — STRIDE inventory; I-DISC-01 lookup-table redaction pattern; D-DOS-01 import preview rate-limit gap (deferred); audit append-only invariant (R-01).
- `.planning/phases/11-checkout-upgrade-order-history/11-01-SUMMARY.md:84-103` — Phase 11 concurrent-checkout proof harness pattern; `successCount: 1, conflictCount: 1, finalQuantity: 0` baseline to extend in Phase 22.
- `.planning/PROJECT.md:15-30, 100-112` — v1.3 spec (binder + etched), key decisions confirming "no FK from order_items," "post-commit notifications," "audit bounded," "rate-limit AFTER admin auth, BEFORE checkout body parse."

External references (MEDIUM confidence — general SQL/Postgres knowledge applied to the specific scenario; not re-verified during research):

- Postgres `FOR UPDATE` semantics on indexed joins.
- Neon HTTP driver `db.batch()` mapping to Neon's transaction endpoint (already documented in `src/db/queries.ts:799-808` comment).
- Shopify / BigCommerce / Stripe Checkout all-or-nothing line item commit pattern (industry-standard checkout contract).

---

*Pitfalls research for v1.3 Binder-Aware Inventory & Pick Workflow.*
*Researched: 2026-05-10. All file:line references verified against the working tree at commit `1fa57c2 docs: start milestone v1.3 Binder-Aware Inventory & Pick Workflow`.*
