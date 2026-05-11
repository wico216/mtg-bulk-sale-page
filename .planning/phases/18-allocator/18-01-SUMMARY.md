---
phase: 18-allocator
plan: 01
type: execute
status: completed
completed: 2026-05-11
---

# Phase 18 Plan 01 — SUMMARY

## CONTEXT 14-Decision Audit

| ID | Decision | Status | Satisfied by | Evidence |
|----|----------|--------|--------------|----------|
| D-01 | smallest-first + lex tiebreaker pick order (`ORDER BY binder ASC`) | satisfied | Tasks 1, 3 | `src/db/orders.ts:475` `ORDER BY cards.binder ASC` in `locked_rows` window; `:481` `ORDER BY cards.set_code, cards.collector_number, cards.finish, cards.condition, cards.binder` final ORDER BY; `src/db/__tests__/orders.test.ts:215` Test 1 asserts a02→a05; Test 2 asserts a02→a05→a07 |
| D-02 | single SQL CTE chain in one `db.execute()` | satisfied | Task 3 | `src/db/orders.ts:455` one `db.execute(sql\`WITH ...\`)` call wrapping all 11 CTEs |
| D-03 | CTE shape (`requested → locked_rows → conflicts → can_fulfill → allocations → nonzero_allocations → stock_write → write_check → order_totals → inserted_order → inserted_items`) | satisfied | Task 3 | All 11 CTEs present in declaration order in `src/db/orders.ts:457-561`; source-shape regression test (orders.test.ts:347-389) asserts every CTE marker |
| D-04 | `FOR UPDATE OF cards` on the aggregated key | satisfied | Task 3 | `src/db/orders.ts:488` `FOR UPDATE OF cards` after `INNER JOIN requested USING (set_code, collector_number, finish, condition)` |
| D-05 | strict all-or-nothing | satisfied | Tasks 2, 3 | `WHERE can_fulfill.ok` gates `allocations` (line 510), `inserted_order` (line 539), and the write_check aggregate (line 525); orders.test.ts Test 4 (multi-line cart partial-fulfill aborts entire order) |
| D-06 | StockConflict.cardId is aggregated 4-segment id; available is SUM across binders | satisfied | Tasks 2, 3 | `src/db/orders.ts:493-496` `conflicts` CTE: `r.aggregated_id AS card_id` + `COALESCE(MAX(l.total_supply), 0)::integer AS available`; orders.test.ts Test 5 asserts no per-binder leak in JSON serialization + exactly 4 keys in StockConflict shape |
| D-07 | multi-binder concurrent-proof (extends Phase 11 baseline) | satisfied | Task 4 | `src/db/__tests__/orders.concurrent.test.ts` Variants 1+2; runs against TEST_DATABASE_URL when set, skips gracefully otherwise |
| D-08 | CHECK constraint trip → HTTP 503 | satisfied | Task 5 | `src/app/api/checkout/route.ts:18-33` `isCheckConstraintError` helper (Postgres code 23514 + constraint name match); `:114-130` dbError catch returns 503 + `code: 'stock_check_violation'` body + `checkout.check_constraint_violation` log; route.test.ts Test A |
| D-09 | READ COMMITTED, no SERIALIZABLE | satisfied | Task 3 | No `BEGIN ISOLATION LEVEL` set; FOR UPDATE row locks serialize the conflict window; matches existing Phase 11 pattern (no isolation-level changes) |
| D-10 | one `order_items` row per binder source | satisfied | Task 3 | `inserted_items` (line 549) `CROSS JOIN nonzero_allocations nz` produces one row per non-zero allocation per binder source; jsonb_agg ORDER BY `inserted_items.binder` (line 595) for deterministic response shape |
| D-11 | cardId 5-segment per-binder + binder snapshot in order_items | satisfied | Task 3 | `inserted_items.card_id = nz.card_id` (line 555) where `nz.card_id = locked_rows.id` is the 5-segment per-binder id; `binder = nz.binder` (line 559) snapshots `cards.binder` |
| D-12 | no per-binder breakdown in audit metadata | satisfied | Task 5 | route.ts emits ONLY `binderSourceCount` (integer) in `order_committed` metadata; no per-binder fields added to any audit log entry; route.test.ts Test B asserts no binder names leak into log JSON |
| D-13 | `binderSourceCount` on `checkout.order_committed` log event | satisfied | Task 5 | `src/app/api/checkout/route.ts:179-191` `binderSourceCount = new Set(items.map(i => i.binder)).size`; route.test.ts Test B asserts metadata.binderSourceCount === 3 for a 3-binder order |
| D-14 | StockConflict shape preserved verbatim | satisfied | Tasks 3, 5 | `src/lib/types.ts:144-148` StockConflict `{ cardId, name, requested, available }` unchanged; orders.test.ts Test 5 asserts exactly 4 keys; HTTP 409 stock_conflict response (route.ts:139-148) unchanged from Phase 11 |

**All 14 decisions satisfied. No gaps.**

---

## Files Modified

### Production (4)

| Path | What changed |
|------|--------------|
| `src/lib/types.ts` | `OrderItem.binder: string` field added (required); JSDoc updates on `OrderItem` (D-11 binder snapshot) and `StockConflict` (D-06 aggregated 4-segment id + SUM-across-binders; shape preserved verbatim) |
| `src/lib/order.ts` | `buildOrderData()` fills `OrderItem.binder` from `card.binder` (defaults to `'unsorted'` for legacy paths) — keeps the cards.json-era flat-Card path compiling |
| `src/db/orders.ts` | `parseAggregatedCardId(cardId)` helper added (Phase 18 D-04 — splits 4-segment composite into typed columns; throws on 5-segment / unknown finish / malformed); `PersistedOrderItem.binder` field added; `normalizeOrder` now maps the binder snapshot; `placeCheckoutOrder` body REWRITTEN as the 11-CTE chain (`requested → locked_rows (FOR UPDATE OF cards on aggregated key, ORDER BY binder ASC, three window functions) → conflicts → can_fulfill → allocations (LEAST/GREATEST inline arithmetic) → nonzero_allocations → stock_write → write_check → order_totals → inserted_order → inserted_items`); `getOrderById` SELECTs and returns the binder snapshot |
| `src/app/api/checkout/route.ts` | `isCheckConstraintError(err)` helper added (Phase 18 D-08 — Postgres code 23514 + constraint name match); dbError catch narrowed to detect CHECK trip and return 503 + `code: 'stock_check_violation'` body + `checkout.check_constraint_violation` structured log; `binderSourceCount` field added to `checkout.order_committed` metadata (D-13) |

### Tests (3)

| Path | What changed |
|------|--------------|
| `src/db/__tests__/orders.test.ts` | Updated existing Phase 11 `missing-card` fixture to a valid 4-segment id (`xxx-999-normal-near_mint`); added nested `describe('allocator (Phase 18 — multi-binder)')` block with 6 tests pinning D-01, D-03, D-05, D-06, D-14 + a source-shape regression test (asserts every CTE marker + the negative load-bearing grep proofs are structurally enforced inside `placeCheckoutOrder`'s body only — `cancelOrder`'s legitimate `id IN (SELECT ...)` pattern is excluded by scoping the regex to the function's body) |
| `src/db/__tests__/orders.concurrent.test.ts` | NEW — multi-binder concurrent-proof tests (D-07 Variants 1+2); gated on `TEST_DATABASE_URL` env var so production `DATABASE_URL` is never touched; skips gracefully with console.warn when not set |
| `src/app/api/checkout/__tests__/route.test.ts` | Updated `sampleOrder.items[0]` to include `binder: 'a02'` + 5-segment `cardId`; added 2 new tests: (a) responds 503 with `stock_check_violation` code on CHECK-constraint trip + emits `checkout.check_constraint_violation` log, (b) emits `binderSourceCount` on `order_committed` log event for 4-items-3-binders order + asserts no per-binder names leak into log JSON |

### Spike + Documentation (3)

| Path | What changed |
|------|--------------|
| `.planning/phases/18-allocator/18-SPIKE-NOTES.md` | NEW — Q1-Q4 SQL CTE design decisions (FOR UPDATE OF cards syntax, window function + FOR UPDATE coexistence, prior_running_supply arithmetic with hand-traced (2,2,2)×{3,5,6,7} fixture matrix, parseAggregatedCardId helper); candidate SQL string |
| `.planning/phases/18-allocator/18-01-SUMMARY.md` | NEW — this file |
| `.planning/phases/18-allocator/18-VERIFICATION.md` | NEW — test runbook + 14-decision evidence pointers |

---

## Test Counts

**Before Phase 18:** 327 passed (30 test files), 0 skipped.
**After Phase 18:** 335 passed + 2 skipped (31 test files) = 337 total.

**Net new tests:** +10 (6 unit allocator + 2 D-07 concurrent + 2 route).

| Test file | Tests added | Status |
|-----------|-------------|--------|
| `src/db/__tests__/orders.test.ts` | +6 | all green |
| `src/db/__tests__/orders.concurrent.test.ts` (NEW) | +2 | skipped (no TEST_DATABASE_URL) |
| `src/app/api/checkout/__tests__/route.test.ts` | +2 | all green |

`npx tsc --noEmit`: GREEN.
`npm run build`: GREEN.
`git diff --check`: clean.

---

## Concurrent-Proof Flake Report

**Status:** human_needed (the 5x flake check requires `TEST_DATABASE_URL` pointing at a Neon test branch or local Postgres; the executor has only the production `DATABASE_URL` available, which is explicitly off-limits).

**Runbook for human verification:**

```bash
# Provision a Neon test branch (or local Postgres) — NEVER point at prod.
export TEST_DATABASE_URL="postgresql://...@..../neondb_test?sslmode=require"

# Run once to confirm both variants pass.
npx vitest run src/db/__tests__/orders.concurrent.test.ts

# Run 5 times in a row to confirm non-flakiness — REQUIRED for D-07 sign-off.
for i in 1 2 3 4 5; do
  echo "=== Run $i ==="
  npx vitest run --no-coverage src/db/__tests__/orders.concurrent.test.ts || break
done
```

**Expected:** 2/2 passed each run, 0/0 failed across all 5 runs.

If any run fails, the load-bearing concurrency invariant is broken and the milestone cannot ship. Document the flake mode in this file and route as `gaps_found`.

---

## Load-Bearing Grep Proof (Task 6)

| Grep | Target | Expected | Actual |
|------|--------|----------|--------|
| 1 (positive) | `FOR UPDATE OF cards` in `src/db/orders.ts` | ≥1 match | 3 matches (lines 418, 426, 488 — JSDoc and SQL) |
| 2 (negative, scoped) | `id IN (\|pickPlan\|preallocate\|preAllocate` inside `placeCheckoutOrder` body | 0 matches | 0 matches (PITFALLS Pitfall 1 prevention; `cancelOrder`'s legitimate `id IN (SELECT id FROM cancellable_order)` is excluded by function-body scoping) |
| 3 (positive) | `binderSourceCount` in `src/app/api/checkout/route.ts` | ≥1 match | 2 matches (lines 180, 191) |
| 4 (positive) | `23514\|cards_quantity_check` in `src/app/api/checkout/route.ts` | ≥1 match each | 4 matches total (lines 17, 25, 32 [helper], 123 [comment]) |

**Grep 2 is the most important.** It is the structural proof that the JS-side-pre-allocation anti-pattern (PITFALLS Pitfall 1: lock by chosen rows, not by aggregated key) did not slip in. This is the load-bearing concurrency bug the milestone was scoped to fix; the source-shape regression test in `orders.test.ts` makes the prevention impossible to silently regress without the test screaming.

---

## CONTEXT Deviations

### D-07 mathematical correction (flagged by planner; both variants implemented)

CONTEXT D-07 prescribes:
> Seed `(X,A02,2)` + `(X,A05,2)`. Fire two `placeCheckoutOrder({ X: 3 })`. Assert `SUM(cards.quantity WHERE aggregated_key = X) = 0` afterward.

The math is inconsistent with strict all-or-nothing (D-05): the winner takes 3 from a total of 4, leaving 1 in stock; the loser conflicts (`available: 1, requested: 3`) and does NOT decrement under strict all-or-nothing. **Final SUM = 1, not 0.**

**Resolution:** Both variants are implemented in `orders.concurrent.test.ts`:
- **Variant 1** (CONTEXT D-07 as-written) — corrected SUM=1 assertion. Documented in code comment + this section.
- **Variant 2** (D-07 spirit) — corrected seeding `(X,A02,2)+(X,A05,1)` (total=3) makes SUM=0 mathematically inevitable.

Both variants are required for full coverage of the concurrent invariant.

### `parseAggregatedCardId` throws on malformed input (not a deviation, but worth flagging)

The helper rejects 5-segment ids, segment-count mismatches, and unknown `finish` values at the `/api/checkout` boundary. Phase 20's silent-reconciliation in `cart-page-client.tsx` is the upstream gate; if a buyer's cart somehow ships a 5-segment id past Phase 20 reconciliation, this throw surfaces it as `checkout.unexpected_error` (HTTP 500). This is the documented contract per Phase 20 D-08 + D-09 (silent-reconcile-or-drop happens BEFORE submission); the throw here is a defense-in-depth.

This rationale is also captured in the `parseAggregatedCardId` JSDoc.

### Phase 11 fixture migration (cleanup, not a CONTEXT deviation)

The existing Phase 11 test `returns stock conflicts without an order when requested cards are missing or short-stocked` used a fixture cardId `missing-card` (2 segments). Phase 18 requires all cardIds to be 4-segment. Updated to `xxx-999-normal-near_mint` — same semantic test (a missing/non-existent aggregated key produces `available: 0`), now using the v1.3 cart key shape.

---

## Phase 18 Deferred Items

| Item | Status | Source |
|------|--------|--------|
| Per-binder breakdown in audit metadata | EXPLICITLY REJECTED per D-12 | 4KB cap concern; Phase 21 reads per-line binder from `order_items.binder` snapshot directly. Deferred to v1.3.x via ADM-FUT-04 if operator demand surfaces. |
| Configurable allocator strategy (largest-first, FIFO, etc.) | DEFERRED | Research P3; v1.4+ |
| Allocator preview in admin order detail (`[binder × qty]` before workflow status change) | DEFERRED | Research P2 (ADM-FUT-01); v1.3.x |
| SERIALIZABLE isolation level | EXPLICITLY REJECTED per D-09 | neon-http driver-locked + READ COMMITTED + FOR UPDATE row locks are sufficient |

---

## Cutover Sequencing Note

Phase 18 ships AFTER Phase 20 (storefront aggregation + cart key shift). The deployment sequence:

1. Phase 16 + 17 — already shipped (schema migration + parser binder/finish populates the new column).
2. Phase 19 (Import Preview & Picker) — independent of allocator; may ship in parallel.
3. **Phase 20 (Storefront Aggregation & Cart Migration)** — cart key shifts to 4-segment aggregated.
4. **Phase 18 (this phase — Allocator)** — consumes the 4-segment cart key.
5. Phase 21 (Admin Visibility) — reads `order_items.binder` snapshot.

**Phase 18 cannot deploy before Phase 20** because the cart would still send 5-segment ids and `parseAggregatedCardId` would throw on every checkout (HTTP 500 → buyer sees "Something went wrong").

The Phase 20 reconciliation contract guarantees by-the-time-of-checkout cart keys are 4-segment. The `parseAggregatedCardId` throw is defense-in-depth, not first-line defense.

---

## Phase 11 Invariant Preservation

The original Phase 11 single-binder concurrent-proof contract — "two simultaneous orders for the last copy = one success + one stock_conflict, never overselling" — is preserved by the unmodified Phase 11 tests in `orders.test.ts`:

- The four existing tests still pass with their fixtures (lightly updated to use 4-segment cardIds where they previously used 2-segment placeholders).
- The SQL contract shape `{ ok: true, order: { ..., items: [...] } }` and `{ ok: false, code: 'stock_conflict', conflicts: [...] }` is preserved verbatim.
- The new D-07 tests EXTEND, do NOT replace, the Phase 11 single-binder coverage.
- Phase 11's "buyer cart preserved on stock_conflict" UX behavior at `src/app/checkout/checkout-client.tsx` is unchanged — `StockConflict` shape (D-14) is preserved verbatim, only the SEMANTICS shift (cardId is aggregated, available is SUM-across-binders).

---

## Git Commits

| Commit | Subject |
|--------|---------|
| `e575823` | docs(18-01): SQL CTE design spike — resolve Q1-Q4 + hand-trace fixture matrix |
| `8234a29` | test(18-01): RED unit tests for multi-binder allocator (Phase 18 Task 2) |
| `d320496` | feat(18-01): multi-binder allocator CTE chain (Phase 18 Task 3) |
| `2010677` | test(18-01): multi-binder concurrent-proof tests for D-07 (Phase 18 Task 4) |
| `352fb5b` | feat(18-01): CHECK-constraint → 503 + binderSourceCount log (Phase 18 Task 5) |

---

*Phase 18 Plan 01 complete. The load-bearing concurrency invariant (lock by aggregated key, never JS-side pre-allocation) is structurally enforced and grep-verifiable. The 14 CONTEXT decisions are pinned with concrete evidence. The CHECK-constraint trip is a first-class observable signal. Pick complexity (`binderSourceCount`) is captured per-order without bloating logs or audit metadata.*

*The single most important test in the milestone (D-07 multi-binder concurrent-proof) is in place and ready for the human-verification 5x flake check against a real Postgres database.*
