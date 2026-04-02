---
phase: 03-search-and-filters
plan: 03
subsystem: ui
tags: [react, zustand, tailwind, bottom-sheet, mobile, responsive, filtering]

# Dependency graph
requires:
  - phase: 03-02
    provides: ManaColorPills, MultiSelect, SortDropdown components and integrated desktop filter bar
provides:
  - FilterBottomSheet component with mobile-optimized filter controls
  - Mobile filter icon with active indicator dot in filter bar
  - Set picker sub-sheet with search and clear functionality
  - Inline rarity and sort toggle pills for mobile
  - Complete responsive search and filter experience across all viewports
affects: [04-cart-and-checkout]

# Tech tracking
tech-stack:
  added: []
  patterns: [bottom-sheet-with-sub-sheet, inline-toggle-pills, zustand-usememo-ssr-safe]

key-files:
  created:
    - src/components/filter-bottom-sheet.tsx
  modified:
    - src/components/filter-bar.tsx
    - src/components/card-grid.tsx
    - src/components/multi-select.tsx
    - src/components/sort-dropdown.tsx

key-decisions:
  - "Set picker opens as its own bottom sheet (z-50) with search input and clear button, not a dropdown"
  - "Rarity filter uses inline toggle pills (only 4 options, no dropdown needed on mobile)"
  - "Sort uses inline toggle pills in bottom sheet, native select on desktop"
  - "Selected sets sort to top of set picker list for quick access"
  - "getFilteredCards() must not be called inside Zustand selectors (causes SSR infinite loop), use useMemo with individual state subscriptions"

patterns-established:
  - "Bottom sheet pattern: fixed overlay with translate-y transition, max-h-[70vh], scroll lock via body overflow"
  - "Sub-sheet pattern: nested bottom sheet at higher z-index for complex pickers (sets)"
  - "Inline toggle pills pattern: button array with ring/bg states for small option sets"
  - "SSR-safe Zustand pattern: select primitive values in useFilterStore, derive computed values in useMemo"

requirements-completed: [CATL-02, CATL-03, CATL-04, CATL-05, CATL-06]

# Metrics
duration: 21min
completed: 2026-04-02
---

# Phase 3 Plan 3: Mobile Filter Bottom Sheet Summary

**Mobile bottom sheet with WUBRG pills, set picker sub-sheet, inline rarity/sort toggle pills, and SSR-safe Zustand selectors for complete responsive filter experience**

## Performance

- **Duration:** 21 min
- **Started:** 2026-04-02T21:46:12Z
- **Completed:** 2026-04-02T22:07:29Z
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments
- Built FilterBottomSheet component with mobile-optimized filter controls including mana color pills, set picker, rarity pills, sort pills, and clear all
- Set picker implemented as its own sub-sheet (z-50) with search input, clear button, and selected-sets-first sorting
- Fixed SSR infinite loop caused by Zustand selector calling getFilteredCards() -- switched to useMemo with individual state subscriptions
- Improved mobile filter UX: rarity and sort use inline toggle pills instead of dropdowns, matching mobile interaction patterns

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mobile bottom sheet and integrate with filter bar** - `598a44a` (feat)
2. **Checkpoint fix: Resolve getServerSnapshot infinite loop** - `2f60744` (fix)
3. **Checkpoint fix: Improve mobile filter UX** - `0f8ba02` (feat)

## Files Created/Modified
- `src/components/filter-bottom-sheet.tsx` - Mobile bottom sheet with mana pills, set picker sub-sheet with search, rarity toggle pills, sort toggle pills, clear all button, scroll lock
- `src/components/filter-bar.tsx` - Added mobile filter icon with active indicator dot, compact result count (X/Y), bottom sheet toggle
- `src/components/card-grid.tsx` - Fixed SSR infinite loop by selecting individual Zustand state values and using useMemo for filtered/sorted cards
- `src/components/multi-select.tsx` - Added dropUp prop for upward-opening panels
- `src/components/sort-dropdown.tsx` - Added w-full class for proper sizing in bottom sheet

## Decisions Made
- Set picker is its own bottom sheet (z-50) with search input and clear button, rather than a dropdown inside the main sheet -- dropdowns inside a scrolling sheet create UX problems on mobile
- Rarity filter uses inline toggle pills since there are only 4 options (mythic/rare/uncommon/common) -- no need for a dropdown on mobile
- Sort uses inline toggle pills in bottom sheet for direct selection, keeps native select on desktop
- Selected sets sort to top of set picker list so users can see and manage their active filters immediately
- getFilteredCards() must not be called inside Zustand selectors because it creates a new array reference on every call, causing getServerSnapshot to see a different value each time and triggering an infinite re-render loop in SSR

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getServerSnapshot infinite loop in card-grid**
- **Found during:** Task 2 (checkpoint verification)
- **Issue:** Zustand selector was calling `getFilteredCards()` which creates a new array reference every call, causing React SSR hydration to infinite-loop because `getServerSnapshot` never returns a stable value
- **Fix:** Changed card-grid to select individual primitive state values from useFilterStore and derive filtered/sorted cards via useMemo
- **Files modified:** src/components/card-grid.tsx
- **Verification:** Build succeeds, no hydration errors, page loads without infinite loop
- **Committed in:** `2f60744`

**2. [Rule 1 - Bug/UX] Improved mobile filter UX for touch interactions**
- **Found during:** Task 2 (checkpoint verification)
- **Issue:** Dropdown menus inside a scrolling bottom sheet were awkward on mobile -- set picker had no search for 25+ options, rarity/sort dropdowns unnecessary for small option sets
- **Fix:** Set picker opens as its own sub-sheet with search and clear; rarity/sort use inline toggle pills instead of dropdowns
- **Files modified:** src/components/filter-bottom-sheet.tsx
- **Verification:** Human verified all filters work correctly on mobile viewport
- **Committed in:** `0f8ba02`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correct operation and good UX. The SSR fix was critical (app wouldn't load without it). The UX improvements were identified during human verification. No scope creep.

## Issues Encountered
- Zustand `getFilteredCards()` returning new array references on every call caused React SSR infinite loop. Root cause was calling derived state functions inside selectors instead of selecting primitive values. Resolved by selecting individual state values and computing derived state in useMemo.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete search, filter, and sort experience works on all viewports
- Desktop: sticky filter bar with inline search, WUBRG+C mana pills, set/rarity multi-select dropdowns, sort dropdown, result count, clear filters
- Mobile: search field with filter icon that opens bottom sheet with all controls in mobile-optimized layouts
- All filter state managed by Zustand store, ready for cart/checkout phase to consume
- z-index hierarchy established: filter bar (z-30) < bottom sheet (z-40) < sub-sheet/modal (z-50) < lightbox (z-[60])

## Self-Check: PASSED

All 5 files verified on disk. All 3 commits verified in git history.

---
*Phase: 03-search-and-filters*
*Completed: 2026-04-02*
