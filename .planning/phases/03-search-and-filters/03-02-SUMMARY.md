---
phase: 03-search-and-filters
plan: 02
subsystem: ui
tags: [react, zustand, tailwind, scryfall, filtering, mana-colors, multi-select, sort]

# Dependency graph
requires:
  - phase: 03-01
    provides: Zustand filter store with toggle actions, FilterBar shell with placeholder, store-driven CardGrid
provides:
  - ManaColorPills component with WUBRG+C Scryfall SVG toggle pills
  - Reusable MultiSelect dropdown component with checkbox list and outside-click close
  - SortDropdown component with native select for price/name sort
  - Fully integrated desktop filter bar with all controls
affects: [03-03-mobile-filter-sheet, 04-cart-and-checkout]

# Tech tracking
tech-stack:
  added: []
  patterns: [reusable-multi-select-with-backdrop-close, scryfall-svg-mana-pills, usememo-derived-options]

key-files:
  created:
    - src/components/mana-color-pills.tsx
    - src/components/multi-select.tsx
    - src/components/sort-dropdown.tsx
  modified:
    - src/components/filter-bar.tsx

key-decisions:
  - "Rarity dropdown uses MTG conventional order (mythic/rare/uncommon/common) not alphabetical"
  - "MultiSelect uses invisible backdrop div for outside-click close, preventing two-open-at-once pitfall"
  - "SortDropdown uses native <select> instead of custom dropdown for simplicity with 3 options"

patterns-established:
  - "MultiSelect reusable pattern: label + options + selected Set + onToggle callback + optional formatOption"
  - "Backdrop close pattern: fixed inset-0 z-20 div behind z-30 dropdown panel"

requirements-completed: [CATL-03, CATL-04, CATL-05, CATL-06]

# Metrics
duration: 1min
completed: 2026-04-02
---

# Phase 3 Plan 2: Desktop Filter Controls Summary

**WUBRG+C mana color pills, reusable multi-select dropdowns for set/rarity, and native sort dropdown integrated into sticky filter bar**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-02T21:41:24Z
- **Completed:** 2026-04-02T21:42:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Built ManaColorPills component with 6 Scryfall SVG icons, active/inactive visual states, and aria-pressed accessibility
- Created reusable MultiSelect dropdown with checkbox list, count badge, and outside-click close via backdrop pattern
- Added SortDropdown as native select element with three sort options from store
- Integrated all controls into filter-bar.tsx with desktop-only visibility (hidden md:flex/block)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mana color pills, multi-select dropdown, and sort dropdown components** - `24fce0f` (feat)
2. **Task 2: Integrate all filter controls into the filter bar** - `134f2c1` (feat)

## Files Created/Modified
- `src/components/mana-color-pills.tsx` - WUBRG+C toggle pills using Scryfall SVG CDN, active ring highlight, inactive opacity
- `src/components/multi-select.tsx` - Reusable dropdown with checkboxes, selected count badge, backdrop close
- `src/components/sort-dropdown.tsx` - Native select for Price High-Low, Price Low-High, Name A-Z
- `src/components/filter-bar.tsx` - Updated with all imports, useMemo for uniqueSets/uniqueRarities, all controls rendered desktop-only

## Decisions Made
- Rarity dropdown uses MTG conventional order (mythic, rare, uncommon, common) rather than alphabetical, matching player expectations
- MultiSelect uses invisible backdrop div pattern for outside-click close, which also prevents two dropdowns from being open simultaneously
- SortDropdown uses a native `<select>` element instead of a custom dropdown since there are only 3 fixed options
- uniqueSets computed via useMemo sorted alphabetically; uniqueRarities filtered from RARITY_ORDER constant against actual card data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All desktop filter controls are complete and working together
- Mobile viewport hides all controls behind `hidden md:flex/block` classes
- Plan 03-03 adds mobile bottom sheet with filter icon to expose these same controls on small screens
- MultiSelect component is reusable and ready for mobile filter sheet integration

## Self-Check: PASSED

All files exist, all commits verified, build succeeds.

---
*Phase: 03-search-and-filters*
*Completed: 2026-04-02*
