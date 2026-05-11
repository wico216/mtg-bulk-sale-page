---
phase: 20-storefront-aggregation-cart-migration
status: verified
date: 2026-05-11
---

# Phase 20 VERIFICATION

## Repo gate (both plans)

| Gate | Result | Notes |
|------|--------|-------|
| `npx vitest run` | 443 passed + 2 skipped (445) / 41 files | Baseline 405/36 → +40 / +5 files |
| `npx tsc --noEmit` | 0 errors | Type split makes binder leak a compile error |
| `npm run build` | success | All routes compile (Next 16 production build) |
| `git diff --check` | clean | No whitespace issues |

## Requirement coverage

| Req | Plan | Evidence |
|-----|------|----------|
| AGG-01 | 20-01 (Tasks 2 + 5) | `getCardsAggregated()` SQL GROUPs by (set_code, collector_number, finish, condition) with SUM(quantity); `app/page.tsx` consumes it |
| AGG-02 | 20-01 (Tasks 1, 5, 8/9/10, 11) | Type split removes `binder` from PublicCard / PublicOrderItem; per-route invariant tests pin `JSON.stringify(response).includes('binder') === false` on GET / · GET /cart · POST /api/checkout (success + stock_conflict); `route.ts` strips binder from CheckoutResponse.order.items; buyer-email.ts verified clean |
| AGG-03 | 20-02 (all tasks) | 5-step reconciliation pipeline migrates v1.2 cart keys forward; one-time informational toast surfaces the change |

## Decision traceability

- D-01 ✓ (20-01 Task 2, getCardsAggregated SQL verbatim)
- D-02 ✓ (no materialized view; perf rationale in CONTEXT)
- D-03 ✓ (20-01 Tasks 5/6/7 — option-b drop of getCards in cart/checkout)
- D-04 ✓ (20-01 Task 2, AVG(price)::int rounding pinned in test)
- D-05 ✓ (20-01 Task 1, type split with legacy Card removed)
- D-06 ✓ (20-01 Tasks 4 + 5, PublicCard at every public boundary)
- D-07 ✓ (20-01 Tasks 8/9/10, per-route invariants)
- D-08 ✓ (20-02 Task 3, 5-step reconciliation)
- D-09 ✓ (20-02 Task 3 STEP 4, silent-drop fallback preserved)
- D-10 ✓ (20-02 Task 3, effect-based, NOT zustand migrate hook)
- D-11 ✓ (Phase 17 binder normalization — no D-11 code change needed)
- D-12 ✓ (20-02 Task 2, message text verbatim; Task 3 wires it)
- D-13 ✓ (20-02 Task 1, sentinel + helpers; Task 3 fire-once logic)
- D-14 ✓ (20-02 — no per-item toast, only the cart-wide toast)
- D-15 ✓ (20-02 Task 3 reconciliation test 6, empty-cart fires toast)
- D-16 ✓ (20-01 Task 4 type rename — no UI/string change)
- D-17 ✓ (20-01 Task 4 filter-store unchanged)
- D-18 ✓ (20-01 Task 4 cart-item type rename — no binder display)

## Critical privacy invariants (load-bearing)

1. **Compile-time enforcement of binder leak**:
   - Legacy `Card` symbol REMOVED from `src/lib/types.ts`.
   - Any forgotten `import { Card }` is now a TS compile error.
   - `CheckoutResponse.order` is typed `PublicOrderData` — assigning the
     raw internal `OrderData` (with `OrderItem.binder`) is a compile
     error. The strip in `route.ts` is the only path that satisfies the
     type.
2. **Per-route runtime invariants** (4 tests across 3 routes):
   - `GET /` — page-invariant.test.ts (2 tests: serialized cards prop has
     no binder/binders/literal-binder-name trace; binders[] is stripped)
   - `GET /cart` — cart/page-invariant.test.ts (same shape)
   - `POST /api/checkout` success — route.test.ts (binder/binders absent)
   - `POST /api/checkout` stock_conflict — route.test.ts (binder/binders
     absent)
3. **Cart reconciliation contract** (8 tests):
   - 5-segment legacy → 4-segment aggregated, qty preserved
   - Multi-binder same-card sum
   - Sum-clamp to maxStock
   - Stale silent-drop preserved
   - Already-aggregated stale-qty clamp (Pitfall 11)
   - Empty-cart edge fires toast (D-15)
   - Sentinel '1.3' present → toast does NOT fire (one-time)
   - Reconciliation fires toast AND advances sentinel

## Open questions resolved (in-flight)

- **Q1** (drop getCards in cart/checkout?) — YES (option-b). Cart-page-
  client and checkout-client only read PublicCard fields; the legacy
  call was a no-op.
- **Q2** (binder leak in CheckoutResponse?) — YES; the success
  invariant test confirmed it. Fix shipped: `PublicOrderItem` strip via
  destructuring + `PublicOrderData` type makes future leaks compile-
  time errors. `notifyOrder` still receives the full internal
  `OrderData` so the seller email keeps operator pull-info.
- **Q3** (AVG-rounding edge tests in unit vs integration?) — Unit tests
  via fabricated mock rows passed directly to `rowToAggregatedCard`. The
  SQL integration is exercised by the existing `replace-cards-for-
  binders` and other integration tests against the real DB code path.

## Deviations honored (from planner notes)

1. `InventoryRow` introduced as a third type beyond CONTEXT D-05's two-
   type spec. Mechanical rename across all admin/import/order
   disaggregated paths; communicated as the "InventoryRow" name.
2. Cart/checkout pages dropped `getCards()` despite CONTEXT D-03 KEEP —
   no consumer in v1.3 scope; option-b shipped.
3. `PublicOrderItem`/`PublicOrderData` strip lands in this same plan
   (Task 10 anticipated this; it was confirmed needed when the success
   invariant test failed).

## Phase 20 status

**Complete.** Both plans GREEN. Verification gate clean. Ready for
STATE.md / ROADMAP.md transition to "done".
