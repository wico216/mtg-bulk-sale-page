---
phase: 09-admin-inventory-management
plan: 03
subsystem: ui
tags: [react, tailwind, inline-editing, data-table, pagination, csv-export, admin]

# Dependency graph
requires:
  - phase: 09-admin-inventory-management/02
    provides: Admin API routes (GET/PATCH/DELETE /api/admin/cards, GET /api/admin/export), condition-map utility
  - phase: 08-authentication
    provides: Admin layout shell, auth() + isAdminEmail() auth pattern
provides:
  - Complete admin inventory table with inline editing (price, condition, quantity)
  - Action bar with search, set/condition filters, CSV export trigger
  - Pagination controls with page navigation
  - Low-stock highlighting (amber border + "Low" badge for qty=1)
  - Delete confirmation with inline row replacement (not modal)
  - useDebounce hook for search input
affects: [admin-inventory-management, csv-import]

# Tech tracking
tech-stack:
  added: []
  patterns: [click-to-edit cells with optimistic UI, inline delete confirmation rows, debounced search with URL query params]

key-files:
  created:
    - src/app/admin/_components/inventory-table.tsx
    - src/app/admin/_components/editable-cell.tsx
    - src/app/admin/_components/delete-confirmation.tsx
    - src/app/admin/_components/action-bar.tsx
    - src/app/admin/_components/pagination.tsx
    - src/app/admin/_components/toast.tsx
    - src/lib/use-debounce.ts
  modified:
    - src/app/admin/page.tsx

key-decisions:
  - "Inline ActionBar initially embedded in inventory-table, then extracted to standalone component in Task 2"
  - "Condition filter sends DB values (near_mint, etc.) to API; display shows abbreviations (NM, etc.)"
  - "Sort state uses null for unsorted, cycling through asc/desc/null on column header clicks"
  - "Available sets fetched once on mount with limit=200 (small store ~136 cards)"

patterns-established:
  - "Click-to-edit pattern: display mode with hover hint -> edit mode on click -> save on Enter/blur -> optimistic update with revert on error"
  - "Inline delete confirmation: row content replaced with confirmation bar, not modal or browser confirm"
  - "Admin action bar pattern: search + native select dropdowns + accent-colored export button"

requirements-completed: [INV-01, INV-02, INV-03, INV-05, INV-06, CSV-03]

# Metrics
duration: 7min
completed: 2026-04-12
---

# Phase 9 Plan 3: Admin Inventory UI Summary

**Sortable data table with click-to-edit cells, inline delete confirmation, search/filter bar, CSV export, pagination, and low-stock highlighting**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T21:54:48Z
- **Completed:** 2026-04-12T22:02:11Z
- **Tasks:** 2 of 2 auto tasks (Task 3 is human-verify checkpoint)
- **Files modified:** 8

## Accomplishments
- Full admin inventory table with 7 columns (image, name, set, price, condition, quantity, actions)
- Inline editing for price (number input), condition (select dropdown), and quantity (number input) with optimistic UI
- Delete flow with inline row confirmation, not modal or browser confirm
- Action bar with debounced search, native set/condition filter dropdowns, and CSV export button
- Pagination with page number windowing, Previous/Next buttons, and result count
- Low-stock visual treatment: amber left border + "Low" badge for quantity=1 cards
- Loading skeleton, error state, and two empty states (no inventory / no search results)

## Task Commits

Each task was committed atomically:

1. **Task 1: Inventory table, editable cells, delete confirmation, toast, and debounce hook** - `30d12f5` (feat)
2. **Task 2: Action bar with search, filters, export button, and pagination controls** - `a006b95` (feat)

## Files Created/Modified
- `src/app/admin/_components/inventory-table.tsx` - Main client component with table, state, fetch logic, sort, filter, delete handlers
- `src/app/admin/_components/editable-cell.tsx` - Click-to-edit cell for price/quantity/condition with optimistic UI and success/error feedback
- `src/app/admin/_components/delete-confirmation.tsx` - Inline delete confirmation row with Delete Card/Keep Card buttons
- `src/app/admin/_components/action-bar.tsx` - Search input with clear button, set/condition filter dropdowns, Export CSV button
- `src/app/admin/_components/pagination.tsx` - Page navigation with page number windowing and result count
- `src/app/admin/_components/toast.tsx` - Error toast notification with auto-dismiss
- `src/lib/use-debounce.ts` - Generic debounce hook for search input
- `src/app/admin/page.tsx` - Updated: replaced placeholder with InventoryTable, new metadata title, force-dynamic

## Decisions Made
- Inline ActionBar initially embedded in inventory-table for Task 1 completeness, then extracted to standalone component in Task 2
- Condition filter sends DB values (near_mint, etc.) to API rather than abbreviations, since the API route handles the mapping
- Sort state uses null for unsorted field, cycling through asc -> desc -> unsorted on column header clicks
- Available sets fetched once on mount with limit=200 since the store has ~136 cards total
- EditableCell uses optimistic UI: shows new value immediately, reverts on error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in `src/db/__tests__/` due to drizzle-orm not being installed in the worktree's node_modules (symlink issue). These tests are from Plans 09-01/09-02 and are not related to this plan's changes. All 61 tests that can run pass successfully.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Admin inventory UI is complete and wired to the API routes from Plan 02
- Ready for human verification (Task 3 checkpoint)
- After verification, Phase 9 will be complete
- Phase 10 (CSV import) can build on this admin interface

## Self-Check: PASSED

All 8 created/modified files verified on disk. Both task commits (30d12f5, a006b95) verified in git log.

---
*Phase: 09-admin-inventory-management*
*Completed: 2026-04-12*
