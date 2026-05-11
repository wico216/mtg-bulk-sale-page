---
phase: 20-storefront-aggregation-cart-migration
plan: 01
status: complete
date: 2026-05-11
---

# Plan 20-01 SUMMARY — Server-Side Aggregation & Type Split

## What landed

The legacy `Card` type is GONE. Three replacements:

- `PublicCard` — public storefront surface, 4-segment id, no `binder`/`binders`.
- `AdminCard extends PublicCard { binders: string[] }` — sorted-distinct
  binders, server-only.
- `InventoryRow` — disaggregated per-binder rows (5-segment id), used by
  admin/import/order/csv-parser/enrichment paths.

Plus `PublicOrderItem = Omit<OrderItem, "binder">` and
`PublicOrderData = Omit<OrderData, "items"> & { items: PublicOrderItem[] }`
introduced to make `CheckoutResponse.order` binder-free at the type level.

`getCardsAggregated()` lands in `src/db/queries.ts` (verbatim CONTEXT D-01
SQL) returning `AdminCard[]`. `app/page.tsx`, `app/cart/page.tsx`, and
`app/checkout/page.tsx` all swap to it and strip `binders` to `PublicCard[]`
before passing to client components. Per-route invariant tests pin the
binder-leak invariant on all three public surfaces.

## Tasks completed (12/12)

| # | Task | Commit |
|---|------|--------|
| 1 | Split Card → PublicCard + AdminCard + InventoryRow + PublicOrderItem | `7bda925` (with RED test) |
| 2 | getCardsAggregated + rowToAggregatedCard (TDD) | `e0df057` |
| 3 | Mechanical Card → InventoryRow rename (db/admin/import/order) | `5993696` |
| 4 | Mechanical Card → PublicCard rename (components/storefront/cart/checkout) | `ed3187b` |
| 5 | app/page.tsx swap to getCardsAggregated | `0995840` |
| 6 | app/cart/page.tsx — option-b drop getCards() | `0995840` |
| 7 | app/checkout/page.tsx — option-b drop getCards() | `0995840` |
| 8 | GET / invariant test | `b5ef7f7` |
| 9 | GET /cart invariant test | `b5ef7f7` |
| 10 | POST /api/checkout success + stock_conflict invariants + binder strip | `b5ef7f7` |
| 11 | buyer-email.ts verified binder-clean (no-op) | (verified) |
| 12 | Repo gate: tests + tsc + build green | (this) |

## Test results

- Baseline (after Phase 19): 403 passed + 2 skipped (405) across 36 files
- After Plan 20-01: **423 passed + 2 skipped (425)** across 38 files
- New tests: queries-aggregated (14) + page-invariant (2) + cart/page-invariant
  (2) + checkout/route AGG-02 invariants (2) = +20
- Existing tests still passing (1 success-path test updated to expect the
  binder-stripped PublicOrderItem shape)

## Verification gate

- `npx vitest run` → 423/425 pass
- `npx tsc --noEmit` → 0 errors
- `npm run build` → succeeds (Next 16 production build, all routes
  compiled including the swapped server pages)
- `git diff --check` → clean (no whitespace issues)

## Critical decision: real binder leak in CheckoutResponse — confirmed and fixed

The success invariant test caught the leak Plan 20-01 anticipated:
`OrderItem.binder` was shipping verbatim through
`CheckoutResponse.order.items` (Phase 18 D-11 snapshot).

Fix shipped in this plan:

1. New types: `PublicOrderItem = Omit<OrderItem,"binder">`,
   `PublicOrderData` with `items: PublicOrderItem[]`.
2. `CheckoutResponse.order` is now typed as `PublicOrderData` (compile-time
   enforcement).
3. `src/app/api/checkout/route.ts` projects the internal OrderData to
   PublicOrderData immediately before `Response.json(...)`, stripping
   `binder` from each item via destructuring.
4. `notifyOrder()` still receives the FULL internal `OrderData` with
   `binder` so the seller email keeps the operator pull-info per Phase
   18 D-15. Only the public response loses it.

The buyer-email template (`src/lib/email/buyer-email.ts`) was already
binder-clean — verified by inspection (no-op for Task 11).

## Deviations honored

- **InventoryRow as third type** beyond CONTEXT D-05's two-type spec.
  Renamed legacy `Card` mechanically across all admin/import/order paths.
  Communicated as "InventoryRow" matching the planner's recommended name.
- **Cart/checkout pages dropped `getCards()`** despite CONTEXT D-03's
  "KEEP" — D-03's reason (future internal/admin path needs disaggregated
  rows) doesn't hold in v1.3 scope. Cart-page-client and checkout-client
  only read PublicCard fields. Plan 20-01 Tasks 6/7 recommended option-b;
  executed.
- **`PublicOrderItem` strip** for the real CheckoutResponse leak — Task
  10's anticipated server-side projection was confirmed needed and
  shipped.

## Open question resolutions

- **Q1** (drop getCards in cart/checkout pages?) — YES (option-b).
- **Q2** (binder leak in CheckoutResponse?) — YES; PublicOrderItem strip
  shipped.
- **Q3** (AVG-rounding edge in unit tests vs Drizzle integration?) — Unit
  tests via fabricated mock rows passed directly to `rowToAggregatedCard`.
  The SQL itself is structurally pinned via the Truth list and verified by
  the integration suite (`replace-cards-for-binders` etc) which exercises
  the real DB code path.

## Type-split confirmation

- Legacy `Card` symbol REMOVED from `src/lib/types.ts`.
- `grep "import type.*\\bCard\\b" src/` excluding new types: 0 hits.
- Any forgotten `import { Card }` or `Card[]` reference is now a TypeScript
  compile error — the load-bearing privacy guarantee per D-05/D-06.
- `binder`/`binders` substring leak in any of GET / · GET /cart · POST
  /api/checkout (success + stock_conflict) is now a test failure.

## Files modified (final)

| File | Change |
|------|--------|
| src/lib/types.ts | + PublicCard, AdminCard, InventoryRow, PublicOrderItem, PublicOrderData; removed legacy Card |
| src/db/queries.ts | + getCardsAggregated, rowToAggregatedCard, AggregatedCardRow; rowToCard returns InventoryRow |
| src/db/__tests__/queries-aggregated.test.ts | NEW — 14 tests for rowToAggregatedCard |
| src/db/seed.ts | Card → InventoryRow on cardToRow |
| src/db/__tests__/seed.test.ts | Card → InventoryRow on test fixture |
| src/db/__tests__/replace-cards-for-binders.test.ts | Card → InventoryRow on test fixture |
| src/lib/csv-parser.ts | Card → InventoryRow throughout |
| src/lib/enrichment.ts | Card → InventoryRow throughout |
| src/lib/order.ts | Card → InventoryRow on buildOrderData |
| src/lib/import-contract.ts | Card → InventoryRow on PreviewPayload + CommitRequest |
| src/lib/__tests__/enrichment-progress.test.ts | Card → InventoryRow on fixture |
| src/app/admin/_components/inventory-table.tsx | Card → InventoryRow useState + inline cast |
| src/app/api/admin/import/preview/route.ts | Card → InventoryRow on buildBindersFromParsed |
| src/app/api/admin/import/__tests__/preview.test.ts | Card → InventoryRow on fixture |
| src/app/api/admin/import/__tests__/commit.test.ts | Card → InventoryRow on fixture |
| src/components/storefront-shell.tsx | Card → PublicCard prop |
| src/components/card-grid.tsx | Card → PublicCard prop + selectedCard state |
| src/components/card-tile.tsx | Card → PublicCard prop |
| src/components/card-modal.tsx | Card → PublicCard prop |
| src/components/cart-item.tsx | Card → PublicCard prop |
| src/lib/store/filter-store.ts | Card → PublicCard on allCards/setAllCards/getFilteredCards |
| src/app/page.tsx | Swap getCards → getCardsAggregated; strip binders to PublicCard[] |
| src/app/cart/page.tsx | Drop getCards; use getCardsAggregated; strip binders |
| src/app/checkout/page.tsx | Drop getCards; use getCardsAggregated; strip binders |
| src/app/cart/cart-page-client.tsx | Card → PublicCard prop type only (logic untouched in 20-01) |
| src/app/checkout/checkout-client.tsx | Card → PublicCard prop |
| src/app/api/checkout/route.ts | Strip OrderItem.binder before public response; notifyOrderAfterCommit takes OrderData |
| src/app/api/checkout/__tests__/route.test.ts | + 2 AGG-02 invariant tests; updated existing success-path expectation |
| src/app/__tests__/page-invariant.test.ts | NEW — GET / invariant (2 tests) |
| src/app/cart/__tests__/page-invariant.test.ts | NEW — GET /cart invariant (2 tests) |

## Next: Plan 20-02 — Cart Reconciliation & Migration Toast

Server-side aggregation is locked in; client-side cart now consumes
PublicCard[] keyed on 4-segment aggregated ids. Plan 20-02 extends the
existing reconciliation `useEffect` in cart-page-client with the v1.2 →
v1.3 forward migration pipeline (segment-strip + transfer-and-clamp +
silent-drop fallback), wires the version sentinel to the persisted cart
store, and ships the one-time `CartMigrationToast`.
