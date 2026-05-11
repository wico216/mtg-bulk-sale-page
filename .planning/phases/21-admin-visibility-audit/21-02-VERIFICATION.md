---
phase: 21-admin-visibility-audit
plan: 02
status: complete
date: 2026-05-11
---

# Plan 21-02 VERIFICATION

## Repo gates

- [x] `npx vitest run` → **460 passed + 2 skipped (462)** across 44 files
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm run build` → success (Next 16 production build)
- [x] `git diff --check` → clean
- [x] `git log` shows 6 atomic commits aligned to the 6 tasks

## Test deltas

| Suite | Before | After | Net |
|-------|--------|-------|-----|
| `src/app/admin/orders/_components/__tests__/order-detail.test.tsx` (NEW) | 0 | 5 | +5 |
| `src/app/admin/audit/_components/__tests__/audit-table.test.tsx` (NEW) | 0 | 8 | +8 |
| **Plan 21-02 total** | 0 | 13 | **+13** |
| **Repo total** | 447 + 2 sk | 460 + 2 sk | +13 |

## Files modified

```
 src/app/admin/orders/_components/order-detail.tsx                                     |  25 +++++-
 src/app/admin/orders/_components/__tests__/order-detail.test.tsx                      | 161 ++++ (NEW)
 src/app/admin/audit/_components/audit-table.tsx                                       |  10 ++-
 src/app/admin/audit/_components/import-commit-details.tsx                             | 157 +++ (NEW)
 src/app/admin/audit/_components/__tests__/audit-table.test.tsx                        | 202 +++++ (NEW)
```

## Snapshot-source proofs (grep evidence)

- `grep -n "data-binder-pill\|item.binder" src/app/admin/orders/_components/order-detail.tsx`
  → 4 hits (the pill markup, the rendered `[{item.binder}]` template, the
  React key, the explanatory comment).
- `grep -n "cards.binder\|join.*cards\|leftJoin.*cards" src/app/admin/orders/_components/order-detail.tsx`
  → 1 hit, but it's the explanatory comment that EXPLICITLY documents
  "NEVER from a join to live `cards`". No actual import or call to a
  join helper exists.
- `grep -n "item.cardId.*item.binder.*item.quantity" src/app/admin/orders/_components/order-detail.tsx`
  → 1 hit at the React key.
- `grep -nc 'inventory.import_commit\|ImportCommitDetails' src/app/admin/audit/_components/audit-table.tsx`
  → 7 hits (import + conditional + comment).
- `grep -nc '"use client"' src/app/admin/audit/_components/audit-table.tsx`
  → 0 hits (audit-table.tsx stays a server component).
- `grep -nc 'isScopedImportMetadata\|→\|Show details\|Hide details' src/app/admin/audit/_components/import-commit-details.tsx`
  → 7 hits.

## Snapshot-source confirmation (NOT a live join)

The `getOrderById()` query at `src/db/orders.ts` lines 670-736 SELECTs
`binder` directly from the `order_items` table (line 704), with NO JOIN
or sub-query into `cards`. The mapping at line 731-733 returns
`item.binder` verbatim into `OrderItem.binder`. The order-detail
component renders `{item.binder}` from this snapshot. Any future
deletion of the source `cards` row leaves the order-detail page
correctly displaying the binder name from the snapshot.

Test 4 (`renders binder from item snapshot — survives missing source
card (D-06)`) provides runtime proof: a fixture with `binder='a02'`
but a deliberately mismatched `cardId='deleted-source-card'` still
renders `[a02]`, confirming the rendering path does not depend on
the live `cards` row existing.

## Per-row toggle independence

Test 3 (`toggles back to collapsed on Hide details click`) verifies
the round-trip on a single row. React's component model guarantees
that two `<ImportCommitDetails>` instances on the same page have
independent `useState(expanded)` slots. No additional independence
test is needed (the planner's note 3 explicitly says "verified by
Task 3 test 3; add explicit independence test if desired" — declined
because the round-trip plus React's model is sufficient).

## Manual smoke (Phase 22 browser UAT)

- [ ] `/admin/orders/[id]` shows `[binder]` pill on every line item,
  styled per CONTEXT D-05
- [ ] Multi-binder orders show one row per binder allocation (D-07)
- [ ] Legacy pre-v1.3 orders render `[unsorted]` literally (D-08)
- [ ] `/admin/audit` rows for `inventory.import_commit` show
  "Replaced N binders (R rows) [Show details]" by default
- [ ] Clicking "Show details" reveals selected/new/missing/per-binder
  counts/total
- [ ] Other action types (inventory.update, order.cancel) render the
  existing metadata preview unchanged
- [ ] Two import_commit rows on the same page can be toggled
  independently (per-row state isolation)

## Decisions traceability

| Decision | Status | Where |
|----------|--------|-------|
| D-05 | ✓ | `order-detail.tsx` lines 444-447 (pill); `order-detail.test.tsx` Test 1 |
| D-06 | ✓ | `order-detail.tsx` line 446 (`{item.binder}` snapshot); `order-detail.test.tsx` Test 4 |
| D-07 | ✓ | `order-detail.tsx` line 412 (React key); `order-detail.test.tsx` Test 3 |
| D-08 | ✓ | `order-detail.tsx` same template; `order-detail.test.tsx` Test 2 |
| D-09 | ✓ | `audit-table.tsx` lines ~189-194 (conditional routing); `import-commit-details.tsx` |
| D-10 | ✓ | `import-commit-details.tsx` collapsed default + 5-section expanded; `audit-table.test.tsx` Tests 1, 2, 3, 4, 5, 6 |
| D-11 | ✓ | `audit-table.tsx` else-branch falls back to metadataPreview; `audit-table.test.tsx` Test 7 |

## Out of scope (deferred per CONTEXT)

- ADM-FUT-01 through ADM-FUT-04 (research P2 deferrals → v1.3.x)

---

*Plan 21-02 VERIFICATION — created 2026-05-11*
