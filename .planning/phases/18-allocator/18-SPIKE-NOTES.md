# Phase 18 Allocator — SQL CTE Design Spike

**Time-box:** 30 minutes. Goal: nail four specific Postgres / neon-http syntax questions BEFORE writing the orders.ts rewrite.

---

## Q1: `FOR UPDATE OF cards` syntax in a CTE that joins cards to a VALUES list

**Decision:** Use the literal SQL fragment `FOR UPDATE OF cards` as the LAST clause of the `locked_rows` CTE's SELECT. Place it after `ORDER BY cards.set_code, cards.collector_number, cards.finish, cards.condition, cards.binder`.

**Justification:** Per Postgres docs (https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE), `FOR UPDATE OF table_name` references the OUTPUT NAME of the table in the FROM clause. For a plain `FROM cards INNER JOIN requested USING (...)`, the table name is `cards` (no aliasing in this CTE). The `OF cards` qualifier is REQUIRED here because the inner-join target is a `requested` VALUES list — without `OF cards`, Postgres would also try to lock the (non-existent) underlying rows of the VALUES list and fail.

**Source:** ARCHITECTURE.md line 307: `FOR UPDATE OF cards         -- explicit table reference: the locks attach to cards`. Also Postgres 16 docs: "If specific tables are named in a locking clause, then only rows coming from those tables are locked."

**Reproduction:** The existing `placeCheckoutOrder` (orders.ts line 383) already uses `FOR UPDATE` (without `OF`) inside a CTE that joins `cards` to a `requested_agg` CTE, and it works in production against neon-http. The Phase 18 chain joins to a VALUES list (not a CTE), but the same row-locking semantics apply — adding `OF cards` is the safe disambiguation that ARCHITECTURE Q3 calls out explicitly.

---

## Q2: Window function semantics: `ROW_NUMBER()` and `SUM() OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` inside a CTE that has `FOR UPDATE`

**Decision:** Window functions go in the SAME `SELECT cards.*` projection as the `FOR UPDATE OF cards` clause. NO need to split into two CTEs.

**Justification:** Per Postgres semantics, `FOR UPDATE` is applied to the rows that flow OUT of the SELECT — i.e., the rows the window functions saw. Quoting the Postgres docs note: "If a locking clause is present, the table to be locked is the one named directly in the FROM clause." Window functions operate on the result-set rows; FOR UPDATE attaches locks to the source-table rows that produced those result-set rows. Both can coexist in the same SELECT.

**Source:** Postgres window function tutorial (https://www.postgresql.org/docs/current/tutorial-window.html); ARCHITECTURE.md line 290-308 demonstrates the pattern.

**Edge case:** Window functions cannot appear in `WHERE` (only in `SELECT` and `ORDER BY`). The `locked_rows` CTE only references the windowed columns (`bucket_rank`, `running_supply`, `total_supply`) in DOWNSTREAM CTEs (`conflicts`, `allocations`), not in its own WHERE — so this is fine.

---

## Q3: `prior_running_supply` arithmetic: derive from `running_supply - l.quantity` in the allocations CTE

**Decision:** Inline the arithmetic inside `allocations`: `take_qty = LEAST(l.quantity, GREATEST(0, r.requested_qty - (l.running_supply - l.quantity)))`. NO need for a separate `prior_running_supply` CTE.

**Validation:** Hand-traced against the ARCHITECTURE Q3 confidence-MEDIUM fixture matrix `(2, 2, 2)` × N (three binder rows, each with quantity 2):

### Fixture 1: requested = 3 → expected `[2, 1, 0]`
| binder | quantity | running_supply | prior = running - qty | requested - prior | LEAST(qty, GREATEST(0, ...)) | take_qty |
|--------|----------|----------------|----------------------|-------------------|------------------------------|----------|
| A      | 2        | 2              | 0                    | 3 - 0 = 3         | LEAST(2, GREATEST(0, 3)) = 2 | **2**    |
| B      | 2        | 4              | 2                    | 3 - 2 = 1         | LEAST(2, GREATEST(0, 1)) = 1 | **1**    |
| C      | 2        | 6              | 4                    | 3 - 4 = -1        | LEAST(2, GREATEST(0, -1)) = 0 | **0**   |
**Sum = 3 ✓**

### Fixture 2: requested = 5 → expected `[2, 2, 1]`
| binder | quantity | running | prior | requested - prior | take_qty |
|--------|----------|---------|-------|-------------------|----------|
| A      | 2        | 2       | 0     | 5                 | LEAST(2, 5) = **2** |
| B      | 2        | 4       | 2     | 3                 | LEAST(2, 3) = **2** |
| C      | 2        | 6       | 4     | 1                 | LEAST(2, 1) = **1** |
**Sum = 5 ✓**

### Fixture 3: requested = 6 → expected `[2, 2, 2]`
| binder | quantity | running | prior | requested - prior | take_qty |
|--------|----------|---------|-------|-------------------|----------|
| A      | 2        | 2       | 0     | 6                 | LEAST(2, 6) = **2** |
| B      | 2        | 4       | 2     | 4                 | LEAST(2, 4) = **2** |
| C      | 2        | 6       | 4     | 2                 | LEAST(2, 2) = **2** |
**Sum = 6 ✓**

### Fixture 4: requested = 7 → expected `conflict` (total_supply=6 < requested=7)
- `conflicts` CTE: `MAX(l.total_supply) = 6 < r.requested_qty = 7` → conflict row produced.
- `can_fulfill.ok = false` (since `EXISTS (SELECT 1 FROM conflicts)` is true → `NOT EXISTS` is false).
- `allocations` CTE: gated by `WHERE can_fulfill.ok` → no rows produced.
- `nonzero_allocations`: empty.
- `stock_write`: empty.
- `inserted_order`: empty (gated by `write_check.ok` which is false because `can_fulfill.ok` is false).
- Result: `{ ok: false, conflicts: [{ cardId: 'X', requested: 7, available: 6 }], order: null }`. ✓

**Verdict:** The arithmetic is mathematically correct. Inline in `allocations`; no separate CTE needed.

---

## Q4: `db.execute(sql\`...\`)` parameterization with multi-segment aggregated keys

**Decision:** **Option (B)** — Aggregate in the JS caller. Add a `parseAggregatedCardId(cardId: string): { setCode, collectorNumber, finish, condition }` helper at the top of `orders.ts` that splits on `-`, validates the 4-segment shape (throws on malformed input — same defensive-fail as the existing `aggregateCheckoutLines`), validates `finish` is one of the three Finish enum values (throws on unknown), and returns the 4 named fields.

**Justification:**
- Option (A) — `regexp_split_to_array(card_id, '-')` in SQL — is brittle on binder names with unusual chars. Phase 17 D-03 already normalizes binder names (lowercase + underscores; hyphens replaced), so the cart key segments shouldn't contain hyphens within them. BUT the cart key itself is constructed by Phase 20 client code, and JS-side validation is more legible and gives clearer error messages.
- Option (B) is more explicit, less brittle, and gives compile-time type safety for the four field names. The VALUES literal becomes:
  `(${item.setCode}::text, ${item.collectorNumber}::text, ${item.finish}::finish, ${item.condition}::text, ${item.quantity}::integer, ${item.aggregatedId}::text)`
  with `aggregatedId` as a 6th column carried through so the conflicts CTE can RETURN it directly to the buyer.
- The `finish` cast to the `finish` enum type is necessary so `USING (finish)` join matches enum-typed `cards.finish`.

**Source:** Plan task 1 Q4 specifies option (B); ARCHITECTURE Q3 line 305 uses `USING (set_code, collector_number, foil, condition)` (now `finish` post-Phase 17).

**parseAggregatedCardId throw rules:**
- Throws on segment count != 4 (e.g., 5-segment per-binder ids).
- Throws on unknown `finish` value (not in `["normal", "foil", "etched"]`).
- Throws on empty string segments.
- Empty/null cardId throws via the existing `aggregateCheckoutLines` guard (already in place).

**Phase 20 contract:** Phase 20's silent-reconciliation in `cart-page-client.tsx` is the upstream gate that ensures all cart submissions use 4-segment ids. The throw here is a defense-in-depth — surfaces stale carts as `checkout.unexpected_error` (HTTP 500) at the route layer, prompting the buyer to refresh.

---

## Candidate SQL string

The full CTE chain to drop into `placeCheckoutOrder`'s `db.execute(sql\`...\`)` call. Style matches existing `placeCheckoutOrder` (uppercase keywords for SELECT/FROM/WHERE/UPDATE/INSERT INTO/RETURNING; lowercase elsewhere).

```sql
WITH requested(set_code, collector_number, finish, condition, requested_qty, aggregated_id) AS (
  VALUES ${requestedValues}
),
locked_rows AS (
  SELECT cards.*,
         requested.aggregated_id AS aggregated_id,
         ROW_NUMBER() OVER (
           PARTITION BY cards.set_code, cards.collector_number, cards.finish, cards.condition
           ORDER BY cards.binder ASC
         ) AS bucket_rank,
         SUM(cards.quantity) OVER (
           PARTITION BY cards.set_code, cards.collector_number, cards.finish, cards.condition
           ORDER BY cards.binder ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_supply,
         SUM(cards.quantity) OVER (
           PARTITION BY cards.set_code, cards.collector_number, cards.finish, cards.condition
         ) AS total_supply
  FROM cards
  INNER JOIN requested USING (set_code, collector_number, finish, condition)
  ORDER BY cards.set_code, cards.collector_number, cards.finish, cards.condition, cards.binder
  FOR UPDATE OF cards
),
conflicts AS (
  SELECT
    r.aggregated_id AS card_id,
    COALESCE(MAX(l.name), r.aggregated_id) AS name,
    r.requested_qty AS requested,
    COALESCE(MAX(l.total_supply), 0)::integer AS available
  FROM requested r
  LEFT JOIN locked_rows l USING (set_code, collector_number, finish, condition)
  GROUP BY r.aggregated_id, r.requested_qty
  HAVING COALESCE(MAX(l.total_supply), 0) < r.requested_qty
),
can_fulfill AS (
  SELECT NOT EXISTS (SELECT 1 FROM conflicts) AS ok
),
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
         )::integer AS take_qty
  FROM locked_rows l
  INNER JOIN requested r USING (set_code, collector_number, finish, condition)
  CROSS JOIN can_fulfill
  WHERE can_fulfill.ok
),
nonzero_allocations AS (
  SELECT * FROM allocations WHERE take_qty > 0
),
stock_write AS (
  UPDATE cards
     SET quantity = cards.quantity - nz.take_qty,
         updated_at = now()
    FROM nonzero_allocations nz
   WHERE cards.id = nz.card_id
   RETURNING cards.id
),
write_check AS (
  SELECT
    (SELECT ok FROM can_fulfill)
    AND (SELECT COUNT(*) FROM stock_write) = (SELECT COUNT(*) FROM nonzero_allocations)
    AS ok
),
order_totals AS (
  SELECT SUM(nz.take_qty)::integer AS total_items,
         COALESCE(SUM(COALESCE(nz.price, 0) * nz.take_qty), 0)::integer AS total_price
    FROM nonzero_allocations nz
),
inserted_order AS (
  INSERT INTO orders (id, buyer_name, buyer_email, message, total_items, total_price, status)
  SELECT ${input.orderRef}, ${input.buyerName}, ${input.buyerEmail}, ${input.message ?? null},
         order_totals.total_items, order_totals.total_price, 'pending'::order_status
    FROM order_totals, write_check
   WHERE write_check.ok
  RETURNING id, buyer_name, buyer_email, message, total_items, total_price, status, created_at
),
inserted_items AS (
  INSERT INTO order_items (
    order_id, card_id, name, set_name, set_code, collector_number,
    condition, price, quantity, line_total, image_url, binder
  )
  SELECT
    inserted_order.id,
    nz.card_id,
    nz.name, nz.set_name, nz.set_code, nz.collector_number, nz.condition,
    nz.price, nz.take_qty,
    CASE WHEN nz.price IS NULL THEN NULL ELSE nz.price * nz.take_qty END,
    nz.image_url,
    nz.binder
  FROM inserted_order
  CROSS JOIN nonzero_allocations nz
  RETURNING id, card_id, name, set_name, set_code, collector_number, condition, price, quantity, line_total, image_url, binder
)
SELECT jsonb_build_object(
  'ok', (SELECT ok FROM write_check),
  'conflicts', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'cardId', conflicts.card_id,
      'name', conflicts.name,
      'requested', conflicts.requested,
      'available', conflicts.available
    ) ORDER BY conflicts.card_id)
    FROM conflicts
  ), '[]'::jsonb),
  'order', (
    SELECT jsonb_build_object(
      'orderRef', inserted_order.id,
      'buyerName', inserted_order.buyer_name,
      'buyerEmail', inserted_order.buyer_email,
      'message', inserted_order.message,
      'totalItems', inserted_order.total_items,
      'totalPrice', inserted_order.total_price,
      'createdAt', inserted_order.created_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'cardId', inserted_items.card_id,
          'name', inserted_items.name,
          'setName', inserted_items.set_name,
          'setCode', inserted_items.set_code,
          'collectorNumber', inserted_items.collector_number,
          'condition', inserted_items.condition,
          'price', inserted_items.price,
          'quantity', inserted_items.quantity,
          'lineTotal', inserted_items.line_total,
          'imageUrl', inserted_items.image_url,
          'binder', inserted_items.binder
        ) ORDER BY inserted_items.binder)
        FROM inserted_items
      ), '[]'::jsonb)
    )
    FROM inserted_order
  )
) AS result;
```

**Notes:**
- All 9 named CTEs present in declaration order: `requested → locked_rows → conflicts → can_fulfill → allocations → nonzero_allocations → stock_write → write_check → order_totals → inserted_order → inserted_items` (11 total CTEs, all matching ARCHITECTURE Q3 walk-through).
- `FOR UPDATE OF cards` attaches locks to the underlying `cards` rows (not the VALUES list).
- Three window functions: `ROW_NUMBER()` (bucket_rank), `SUM() OVER (... ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` (running_supply), `SUM() OVER (PARTITION BY ...)` (total_supply).
- `LEAST(l.quantity, GREATEST(0, r.requested_qty - (l.running_supply - l.quantity)))` is the inline `prior_running_supply` arithmetic from Q3.
- `inserted_items.binder` snapshots `cards.binder` at order time (D-11).
- `conflicts.card_id` returns `r.aggregated_id` (the 4-segment composite from the cart) — never per-binder breakdowns (D-06).
- `available` returned to the buyer is `MAX(l.total_supply)` = SUM across binders for the aggregated key (D-06).
- `cards.id` (the per-binder 5-segment id) is what `inserted_items.card_id` snapshots — the historical record knows exactly which binder row supplied each allocation (D-11).

---

## Spike outputs

- `parseAggregatedCardId` helper signature locked.
- 9-CTE chain locked.
- `prior_running_supply` arithmetic hand-validated for fixtures `(2,2,2)×{3,5,6,7}`.
- All four Q1-Q4 syntax / neon-http compatibility questions resolved.
- Task 2 (RED tests) and Task 3 (GREEN implementation) can proceed with the candidate SQL string above as the drop-in target.
