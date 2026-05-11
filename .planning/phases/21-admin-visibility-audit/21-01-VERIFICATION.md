---
phase: 21-admin-visibility-audit
plan: 01
status: complete
date: 2026-05-11
---

# Plan 21-01 VERIFICATION

## Repo gates

- [x] `npx vitest run` → **447 passed + 2 skipped (449)** across 42 files
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm run build` → success (Next 16 production build)
- [x] `git diff --check` → clean (no whitespace/conflict markers)
- [x] `git log` shows atomic per-task commits (8 commits across 7 tasks
      including the RED+GREEN split for Tasks 1 and 2)

## Test deltas

| Suite | Before | After | Net |
|-------|--------|-------|-----|
| `src/db/__tests__/admin-cards-binder-filter.test.ts` (NEW) | 0 | 4 | +4 |
| `src/db/__tests__/dashboard-stats.test.ts` (extended) | 2 | 2 | 0 (assertions extended in place) |
| `src/app/api/admin/cards/__tests__/route.test.ts` (extended) | 26 | 26 | 0 (one assertion extended in place) |
| **Repo total** | 443 + 2 sk | 447 + 2 sk | **+4** |

## Files modified

```
 src/db/queries.ts                                                        |  9 +++++--
 src/db/__tests__/dashboard-stats.test.ts                                 | 12 ++++++++++
 src/db/__tests__/admin-cards-binder-filter.test.ts                       | 126 ++++++++++ (NEW)
 src/app/api/admin/cards/route.ts                                         |  4 ++--
 src/app/api/admin/cards/__tests__/route.test.ts                          |  2 ++
 src/app/admin/_components/action-bar.tsx                                 | 22 +++++++++++
 src/app/admin/_components/inventory-table.tsx                            | 47 +++++--
 src/app/admin/_components/dashboard-summary.tsx                          | 14 +++++-
```

## Snapshot-source proofs (grep evidence)

- `grep -n "if (binder)" src/db/queries.ts` → 1 hit at line 787 inside
  `getAdminCards`, pushing `eq(cards.binder, binder)` into conditions.
- `grep -nc "byBinder" src/db/queries.ts` → 4 hits (type, accumulator,
  for-loop call, mapBreakdown return).
- `grep -n 'searchParams.get("binder")' src/app/api/admin/cards/route.ts`
  → 1 hit at line 22.
- `grep -nc "binderFilter" src/app/admin/_components/action-bar.tsx` → 3 hits
  (interface field, destructure, select binding).
- `grep -n "All binders" src/app/admin/_components/action-bar.tsx` → 1 hit.

## Live cards join sanity

The binder filter targets the column identity `cards.binder` directly via
drizzle's `eq()` — not a name string. Tests walk the SQL queryChunks and
assert the column object reference. No left/inner join was introduced; the
filter is a single `WHERE cards.binder = $1` predicate composed via `and()`
with the other filters when present.

## Manual smoke (deferred to Plan 21-02 + browser UAT in Phase 22)

- [ ] `/admin` dashboard renders four breakdown tiles in one row on lg
  screens
- [ ] `/admin/inventory` (table view) shows the Binder column between
  Cond and Qty
- [ ] The binder filter dropdown above the table populates from distinct
  binders
- [ ] Selecting a binder appends `?binder=...` to the URL and filters
  the table; clearing returns to "All binders"

## Decisions traceability

| Decision | Status | Where |
|----------|--------|-------|
| D-01 (column placement after Cond before Qty; lowercase) | ✓ | `inventory-table.tsx` lines ~647 + ~744 |
| D-02 (single-select dropdown; distinct binders sample) | ✓ | `action-bar.tsx` lines 99-110; `inventory-table.tsx` lines ~183-190 |
| D-03 (server-side eq() filter + URL search param) | ✓ | `queries.ts:787`; `route.ts:22`; `inventory-table.tsx:134` |
| D-04 (bulk-edit-binder out of scope) | ✓ | Deferred per CONTEXT |
| D-12 (dashboard binder breakdown) | ✓ | `queries.ts` byBinder; `dashboard-summary.tsx` lines ~144-156 |
| D-13 (chaos-sort fulfillment visible at-a-glance) | ✓ | ~50-line addition across 8 files |

## Out of scope (covered by other plans)

- Plan 21-02: D-05 through D-11 (order detail [binder] pill + audit page)
- v1.3.x deferred: D-04 bulk-edit-binder; ADM-FUT-01..04

---

*Plan 21-01 VERIFICATION — created 2026-05-11*
