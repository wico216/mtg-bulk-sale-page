# Phase 18: Allocator - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `placeCheckoutOrder` CTE chain in `src/db/orders.ts` (Phase 11) to deterministically allocate each buyer line across binder source rows inside one SQL CTE — never overselling, never silently partial-fulfilling, producing one `order_items` row per binder source so admin order detail (Phase 21) can render the operator's pick path.

This is the highest-risk phase in the milestone per research (PITFALLS Pitfall 1 is the load-bearing correctness invariant). The allocator MUST live in SQL because `neon-http` has no interactive transactions; pre-computing a pick plan in JavaScript and then locking by `id IN (...)` is the load-bearing concurrency bug.

</domain>

<decisions>
## Implementation Decisions

### Allocator algorithm (locked by research)
- **D-01:** Pick order: **smallest-quantity-first** with **lexicographic binder-name tiebreaker** (`ORDER BY quantity ASC, binder ASC`). Smallest-first depletes weak binders, freeing them for consolidation — matches the operator's "consolidate A02 into A07" mental model and the SortSwift / SAP / Extensiv WMS literature finding from FEATURES research.
- **D-02:** Allocator is a **single SQL CTE chain** inside `placeCheckoutOrder`'s existing `db.execute(sql\`...\`)` statement. NO JavaScript-side pre-allocation. NO `SELECT FOR UPDATE → app logic → UPDATE` round-trip pattern. neon-http has no interactive transactions; locks released between SELECT and UPDATE = double-decrement window.
- **D-03:** CTE shape (extends Phase 11's existing chain):
  ```
  requested      -- buyer line items (existing, unchanged)
    ↓
  locked_rows    -- SELECT cards JOIN requested ON aggregated_key
                    FOR UPDATE OF cards
                    ORDER BY binder ASC  (deterministic; no deadlock under concurrent calls)
                    -- ROW_NUMBER() over aggregated_key for ordering
                    -- SUM(quantity) OVER (...) for prior_running_supply
    ↓
  conflicts      -- aggregated SUM(quantity) per logical card vs requested
    ↓
  can_fulfill    -- ALL conflicts.available >= conflicts.requested → ok=true; else ok=false + reason
    ↓
  allocations    -- LEAST(row.quantity, GREATEST(0, requested - prior_running_supply)) per locked_row
                    -- only when can_fulfill.ok = true
    ↓
  stock_write    -- UPDATE cards SET quantity = quantity - take_qty WHERE id = allocations.id AND take_qty > 0
                    -- depends on can_fulfill.ok
    ↓
  inserted_order -- INSERT INTO orders (existing, unchanged)
    ↓
  inserted_items -- INSERT INTO order_items, ONE row per allocation with take_qty > 0
                    -- captures binder snapshot from cards.binder
  ```
  All in one statement; one network round-trip; one transaction.
- **D-04:** Lock target is `cards FOR UPDATE` (explicit `OF cards` if the planner finds that's required when multiple tables join). The lock is acquired on EVERY row matching the aggregated key `(setCode, collectorNumber, finish, condition)` — not just the rows the allocator will pre-pick. This is the load-bearing pitfall prevention from PITFALLS Pitfall 1.

### Fulfillment semantics (decided in discussion)
- **D-05:** **Strict all-or-nothing.** If any line in the buyer's cart can't be fulfilled across all available binder rows for its aggregated key, the entire order fails with `StockConflict`. No partial fulfillment, no "we shipped what we could" UX. Preserves Phase 11's invariant; matches existing `StockConflict` shape; matches the buyer's expectation that the cart is a coherent transaction.
- **D-06:** `StockConflict.cardId` is the **aggregated id** (the buyer-facing 4-segment composite that storefront/cart use, NOT the new 5-segment per-binder id). `StockConflict.available` is the **SUM across all binders** for that aggregated key. **Never** reveals per-binder breakdown to the buyer — binder is admin-only (PITFALLS Pitfall 6 / I-DISC-05).

### Concurrency invariant (locked by research; reaffirmed)
- **D-07:** The Phase 11 concurrent-checkout proof (two simultaneous orders for the last copy = one success + one stock_conflict, never overselling) MUST extend to the multi-binder case. Test scenario: seed `(X,A02,2)` + `(X,A05,2)`, fire two `placeCheckoutOrder({ X: 3 })` calls in parallel, assert exactly one succeeds, the other returns `StockConflict { cardId: X, requested: 3, available: 1 }`, and `SUM(cards.quantity WHERE aggregated_key = X) = 0` afterward.
- **D-08:** `CHECK (quantity >= 0)` (from Phase 16) is the SCHEMA-LEVEL safety net. If a logic bug ever leads to over-decrement, the constraint trips and Postgres returns an error; the route's catch path translates to **HTTP 503** (transient/retry-safe; never a silent oversell).
- **D-09:** No `SERIALIZABLE` isolation level. `READ COMMITTED` (Postgres default) is sufficient because the FOR UPDATE row locks serialize the conflict window. Adding `SERIALIZABLE` would just add serialization-failure retries that the existing pattern doesn't need.

### `order_items` shape (extends Phase 11; integrates Phase 16's snapshot column)
- **D-10:** Each allocation produces ONE `order_items` row with `take_qty > 0`. Buyer line "Lightning Bolt × 3" split across A02:2 + A05:1 → TWO order_items rows, both with `name='Lightning Bolt'`, `price=card.price` (snapshotted from the source row at time of order — matches existing pattern), and `binder` = the source binder name from the snapshot.
- **D-11:** Existing `order_items` columns (`orderId`, `cardId`, `name`, `quantity`, `price`) keep their semantics. New `binder` column (added in Phase 16) gets populated from `cards.binder` of the allocator's source row. `cardId` snapshot is the 5-segment per-binder id (so the historical record is unambiguous about which binder row supplied this allocation).

### Audit + observability (decided in discussion)
- **D-12:** Audit log entry for `order.placed` includes the existing fields (orderId, totalItems, totalPrice). **No per-binder breakdown in audit metadata** — would bloat the 4KB cap on multi-line multi-binder orders. The per-line binder is in `order_items.binder` snapshot; Phase 21's admin order detail page reads from there.
- **D-13:** Structured log event `checkout.order_committed` keeps its existing shape. Add NEW field `binderSourceCount` (count of distinct `(orderId, binder)` pairs) so log aggregation can spot orders with high binder spread (operator pull-friction signal). Cheap; bounded; no PII.

### `stock_conflict` shape (preserves Phase 11 invariant)
- **D-14:** When `can_fulfill.ok = false`, the response is HTTP 409 (or whatever Phase 11 currently returns — planner verifies; likely 409 Conflict) with body shape `{ success: false, code: 'stock_conflict', conflicts: Array<{ cardId, name, requested, available }> }`. Same shape as v1.2; only the semantics shift (cardId is aggregated, available is SUM).

### Claude's Discretion
- Exact CTE syntax (Drizzle `sql\`...\`` template literal idioms; planner verifies the existing `placeCheckoutOrder` style)
- Whether `FOR UPDATE OF cards` is necessary vs implicit (planner verifies during implementation; some Postgres versions need explicit `OF` when multiple tables are in the FROM clause)
- Specific name for the `binderSourceCount` field on the structured log (could be `numBinders`, `pickComplexity`, etc. — planner picks)
- Test fixture matrix beyond the required scenarios — planner adds edge cases (single-binder, all-zero, exact-match boundaries, condition-mixed)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/PITFALLS.md` — **Pitfall 1 (load-bearing): lock by logical_id not chosen rows**; Pitfall 2 (all-or-nothing semantics); Pitfall 14 (deterministic pick order pinned)
- `.planning/research/ARCHITECTURE.md` — Allocator integration with the existing CTE-chain checkout (Q3 walk-through); concurrency story (T1+T2 example with `(A=2, B=2, C=2)`)
- `.planning/research/FEATURES.md` — Allocator strategy comparison (smallest-first vs largest-first); SortSwift / SAP / Extensiv WMS validation
- `.planning/research/SUMMARY.md` — Phase 18 section; "Allocator MUST be SQL not JS" load-bearing claim

### Prior phase context
- `.planning/phases/16-schema-migration/16-CONTEXT.md` — Schema shape Phase 18 consumes (CHECK constraint D-08, binder column D-06, finish enum D-07, order_items.binder D-09)
- `.planning/phases/17-parser-etched/17-CONTEXT.md` — `finish` enum values Phase 18's aggregated key uses

### Existing codebase patterns to mirror / extend
- `src/db/orders.ts` `placeCheckoutOrder` — The existing single-statement CTE-chain checkout this phase EXTENDS. Phase 11 SUMMARY at `.planning/phases/11-checkout-upgrade-order-history/11-01-SUMMARY.md` describes the original concurrent-proof harness.
- `src/db/orders.ts` `cancelOrder` — Existing CTE-chain pattern with FOR UPDATE + CTE-gated restore (similar shape, simpler — useful reference for the allocator's CTE shape)
- `src/db/__tests__/orders.test.ts` — Existing concurrent-proof harness for Phase 11. Phase 18 EXTENDS this with multi-binder scenarios.
- `src/lib/types.ts` `StockConflict` — Existing shape; preserved in v1.3 (D-14)
- `src/app/api/checkout/route.ts` — The route handler that calls `placeCheckoutOrder`; catches stock_conflict; emits structured logs. v1.3 needs no changes here EXCEPT adding the new `binderSourceCount` field on `checkout.order_committed` log event.
- `src/lib/logger.ts` — Structured logger (Phase 15). Add the new field via existing `logEvent` API; redaction guards already handle nested objects.

### Reference docs
- [Postgres Row Locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) — `FOR UPDATE` semantics on JOIN'd CTEs
- [Postgres Window Functions](https://www.postgresql.org/docs/current/tutorial-window.html) — for the running-supply calculation in `locked_rows`
- [Drizzle Custom SQL](https://orm.drizzle.team/docs/sql) — for the `sql\`...\`` template literal idioms used in `placeCheckoutOrder`

### Project docs
- `.planning/REQUIREMENTS.md` — ALLOC-01..04 are this phase's requirements
- `.planning/PROJECT.md` — "Server-side binder allocator at checkout commit picks which binder(s) to decrement when a buyer's quantity is split across binders" — Current Milestone target feature
- `.planning/STATE.md` — Cross-Cutting Constraints: "Phase 18 allocator MUST be one SQL CTE in one db.execute(). No JS-side pre-allocation. Lock by aggregated key, NOT by chosen rows."

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `placeCheckoutOrder` CTE chain in `src/db/orders.ts` — the exact extension point. Adds new CTEs (`locked_rows`, `conflicts`, `can_fulfill`, `allocations`) between `requested` and `stock_write`. Existing `inserted_order` and `inserted_items` adapt to consume `allocations` instead of `requested` directly.
- `cancelOrder` CTE pattern in `src/db/orders.ts` — has `FOR UPDATE` + CTE-gated conditional updates. Useful template for the new `can_fulfill`-gated `stock_write` and `inserted_items` steps.
- `logEvent` from `src/lib/logger.ts` — for the new `binderSourceCount` structured field
- Phase 11 concurrent-proof harness in `src/db/__tests__/orders.test.ts` — the seed-and-fire-parallel pattern to extend

### Established Patterns
- **Single-statement CTE-chain atomic checkout** — the existing pattern that ensures concurrent checkouts can't oversell. Phase 18 keeps this pattern; just makes the decrement step row-selecting instead of fixed.
- **Snapshot at order time** — `order_items.name`, `order_items.price` snapshot the card state at order time so historical orders survive subsequent inventory edits. Phase 16 D-09 added `order_items.binder` to this snapshot list. Phase 18 populates it.
- **`StockConflict` is the all-or-nothing failure mode** — preserved unchanged at the buyer-facing API layer; only allocator-internal shape changes.

### Integration Points
- **Phase 16** (already discussed) — provides `cards.binder`, `cards.finish`, CHECK constraint, `order_items.binder` column
- **Phase 17** (already discussed) — provides `finish` enum-typed values used in the aggregated grouping key
- **Phase 19** (Import Preview & Picker) — independent of allocator; both write/decrement on the same `cards.binder` rows but Phase 19 wraps with admin auth + ADMIN_BULK rate limit
- **Phase 20** (Storefront Aggregation & Cart Migration) — provides the aggregated read shape that mirrors what the allocator's `requested` CTE expects (cart sends aggregated keys; allocator splits across binders)
- **Phase 21** (Admin Visibility & Audit) — reads `order_items.binder` from the snapshot column populated by D-11; does NOT join to live `cards`

</code_context>

<specifics>
## Specific Ideas

- The "consolidate A02 into A07" workflow the operator described originally is exactly what smallest-first allocator behavior produces over time: each checkout depletes A02 faster than larger binders, so A02 trends toward zero and can eventually be eliminated by an inventory edit. No special tooling needed — the allocator's pick order does the consolidation passively.
- The multi-binder concurrent-proof test (D-07) is the single most important test in the milestone. It MUST be in `src/db/__tests__/orders.test.ts` and MUST be wired into the default `npm test` run. If it's flaky, it's catastrophic — the whole milestone's correctness story rests on it.
- The new `binderSourceCount` log field gives operators (or future analytics) a "pick complexity" signal. An order spanning 5 binders is harder to fulfill than one spanning 1 binder; if it ever matters operationally, that signal is in the logs without retroactive computation.
- HTTP 503 for the CHECK constraint trip (D-08) signals to clients (and to the load-balancer) that this is a transient/retry-safe state. Combined with the existing Phase 15 rate limiter, an attacker can't trip the CHECK constraint repeatedly to map the system because the rate limit will catch them first.

</specifics>

<deferred>
## Deferred Ideas

- **Configurable allocator strategy** (largest-first, FIFO by import date, etc.) — research P3; v1.4+
- **Allocator preview in admin order detail** showing `[binder × qty]` BEFORE order workflow status change — research P2 (ADM-FUT-01); v1.3.x
- **Audit log per-line binder breakdown** — research P2 (ADM-FUT-04); v1.3.x; explicitly rejected here per D-12 (4KB cap concern + Phase 21 already exposes the same data via order_items.binder reads)
- **`SERIALIZABLE` isolation level for paranoid serialization** — explicitly rejected per D-09; READ COMMITTED + FOR UPDATE row locks are sufficient

</deferred>

---

*Phase: 18-Allocator*
*Context gathered: 2026-05-11*
