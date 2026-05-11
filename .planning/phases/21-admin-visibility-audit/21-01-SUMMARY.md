---
phase: 21-admin-visibility-audit
plan: 01
status: complete
date: 2026-05-11
---

# Plan 21-01 SUMMARY — Inventory Binder Column + Filter + Dashboard Breakdown

## What landed

Five admin-visibility extensions for v1.3 binder awareness:

1. **`getAdminCards()` binder filter** — `AdminCardsParams` gains
   `binder?: string`; conditions push `eq(cards.binder, binder)` after
   the existing `condition` filter. Empty/undefined skip. Composes with
   search/set/condition (search → set → condition → binder AND order).
2. **`getAdminDashboardStats()` byBinder** — single SELECT pass; new
   `byBinder` Map accumulator; `mapBreakdown(byBinder, "binder")` returns
   sorted array via the established `(quantity desc, label asc)` contract.
   Type adds `breakdowns.byBinder: Array<AdminDashboardBreakdown & { binder }>`.
3. **GET /api/admin/cards binder param** — handler reads
   `url.searchParams.get("binder") ?? ""` and passes through to the query.
   Logger metadata includes binder.
4. **ActionBar binder dropdown** — third `<select>` between Set and
   Condition; options derived client-side from
   `/api/admin/cards?limit=200` distinct binders sample (planner deviation
   #1: no new `/api/admin/binders` endpoint).
5. **InventoryTable Binder column + filter wiring** — new `binderFilter`
   state, URL param persistence, fetchSets effect derives distinct binders
   alongside sets, all 3 ActionBar JSX call sites updated, new column
   header (w-24, lowercase verbatim render), new cell, deletingId colSpan
   bumped 8 → 9. Filter-reset deps include binderFilter (changing binder
   resets to page 1 + clears selection).
6. **DashboardSummary 'Breakdown by binder' tile** — fourth
   BreakdownSection alongside set/color/rarity; grid bumped
   `lg:grid-cols-3` → `lg:grid-cols-4`; lowercase verbatim row.binder
   label (no `.toUpperCase()` like set codes). Not collapsible (planner
   deviation #2).

## Tasks completed (7/7)

| # | Task | Commit |
|---|------|--------|
| 1 | RED: admin-cards-binder-filter.test.ts (4 tests; SQL builder spy) | `bbfbe62` |
| 1 | GREEN: getAdminCards binder filter | `5a55a5f` |
| 2 | RED: dashboard-stats byBinder fixture + assertions | `30af853` |
| 2 | GREEN: getAdminDashboardStats byBinder breakdown | `3910c87` |
| 3 | Wire binder query param through GET /api/admin/cards | `aef529b` |
| 4 | ActionBar binder filter dropdown (D-02) | `a302424` |
| 5 | InventoryTable binder column + filter wiring (D-01/D-02/D-03) | `5d7b998` |
| 6 | DashboardSummary 'Breakdown by binder' tile (D-12) | `91474d5` |
| 7 | Repo gate: tests + tsc + build green | (this) |

## Test results

- Baseline (after Phase 20): 443 passed + 2 skipped (445) across 41 files
- After Plan 21-01: **447 passed + 2 skipped (449)** across 42 files
- Net delta: +4 tests (the 4 new admin-cards-binder-filter.test.ts cases).
  The dashboard-stats and route extensions modified existing it() blocks
  in place (no new it() blocks); same for the +1 query param assertion.
- No previously-passing test was broken or skipped.

## Verification gate

- `npx vitest run` → 447/449 pass, 0 fail
- `npx tsc --noEmit` → 0 errors
- `npm run build` → succeeds (Next 16 production build; admin dashboard
  + inventory routes include the new tile + column + filter)
- `git diff --check` → clean

## Planner deviations honored

1. **Filter dropdown derives from `/api/admin/cards?limit=200` response
   client-side** — no new `/api/admin/binders` endpoint. The fetchSets
   effect re-purposes the existing distinct-set sample. Acceptable for
   v1.3's ~136-12,749 row inventory.
2. **Dashboard 'By binder' tile NOT collapsible** — matches the existing
   bySet/byColor/byRarity tiles. v1.3 minimum viable scope.
3. **Plan 21-01 Task 1 SQL-builder spy approach** — mocked
   `@/db/client` with chainable select builder; spied on `where()`
   invocations; walked SQL queryChunks to find the `cards.binder` column
   identity reference. No integration test fallback needed.

## Critical decisions (no deviation)

- `binder` reads from `cards.binder` column identity (not name string) —
  confirmed by walking SQL chunks in the test.
- Single SELECT pass for byBinder; the existing dashboard scan now
  accumulates one extra Map entry per row.
- Lowercase verbatim binder labels in the dashboard tile and inventory
  cell (Phase 17 D-04); diverges from set-code uppercase rendering.
- `colSpan=9` for the deletingId row (was 8) after binder column added.
- Existing trust model preserved: route GET passes binder unvalidated
  (drizzle parameterizes via `eq()`).

## Requirements satisfied

- **ADM-02**: admin inventory binder column + dropdown ✓ (Tasks 1, 4, 5)
- **ADM-02**: admin dashboard binder breakdown ✓ (Tasks 2, 6)

## Decisions traceability

- D-01 ✓ (Task 5 column placement after Cond before Qty; lowercase)
- D-02 ✓ (Task 4 single-select dropdown; Task 5 derives from same sample)
- D-03 ✓ (Tasks 1 + 3 + 5: server eq() filter + URL param)
- D-12 ✓ (Tasks 2 + 6: byBinder breakdown alongside existing tiles)
- D-13 ✓ (~50-line addition; chaos-sort fulfillment workflow visible)

## Next

Plan 21-02 (order detail `[binder]` pill + audit page metadata
expander) executes against this baseline.

---

*Plan 21-01 SUMMARY — created 2026-05-11*
