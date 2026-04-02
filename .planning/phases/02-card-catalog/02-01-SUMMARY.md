---
phase: 02-card-catalog
plan: 01
subsystem: data
tags: [scryfall, next-image, tailwind, css-variables, oracle-text]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    provides: "Card type, enrichment pipeline, CSV parser, Scryfall API client"
provides:
  - "Card.oracleText field with double-faced card handling"
  - "next/image configured for cards.scryfall.io"
  - "Accent color CSS variables (indigo theme)"
affects: [02-02-card-grid, 02-03-detail-modal]

# Tech tracking
tech-stack:
  added: []
  patterns: ["DFC oracle text joined with ' // ' separator", "CSS custom properties for theme colors in @theme inline block"]

key-files:
  created: []
  modified:
    - src/lib/types.ts
    - src/lib/enrichment.ts
    - src/lib/csv-parser.ts
    - next.config.ts
    - src/app/globals.css

key-decisions:
  - "Oracle text for double-faced cards joined with ' // ' separator matching Scryfall convention"

patterns-established:
  - "getOracleText pattern: mirrors getImageUrl for DFC handling"
  - "Accent colors as CSS variables in @theme inline block for Tailwind access"

requirements-completed: [CATL-07]

# Metrics
duration: 1min
completed: 2026-04-02
---

# Phase 02 Plan 01: Data Model & Config Foundation Summary

**Oracle text extraction with DFC handling, next/image Scryfall config, and indigo accent theme variables**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-02T20:03:36Z
- **Completed:** 2026-04-02T20:04:58Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added oracleText to Card interface and ScryfallCard type (top-level + card_faces)
- Implemented getOracleText() with double-faced card support (joins faces with " // ")
- Configured next/image remotePatterns for cards.scryfall.io
- Added accent color CSS variables (--color-accent, --color-accent-hover, --color-accent-light)
- Regenerated cards.json: 135/136 cards have oracle text populated

## Task Commits

Each task was committed atomically:

1. **Task 1: Add oracleText to Card type, ScryfallCard type, and enrichment pipeline** - `ede1db2` (feat)
2. **Task 2: Configure next/image remotePatterns, add accent theme colors, and regenerate cards.json** - `2981065` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/lib/types.ts` - Added oracleText to Card, oracle_text to ScryfallCard (top-level and card_faces)
- `src/lib/enrichment.ts` - Added getOracleText() function with DFC handling
- `src/lib/csv-parser.ts` - Initialize oracleText as null during CSV parse
- `next.config.ts` - Added images.remotePatterns for cards.scryfall.io
- `src/app/globals.css` - Added --color-accent, --color-accent-hover, --color-accent-light variables

## Decisions Made
- Oracle text for double-faced cards joined with " // " separator (matches Scryfall display convention)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added oracleText initialization in csv-parser.ts**
- **Found during:** Task 1 (type changes)
- **Issue:** Plan did not mention csv-parser.ts but Card objects are created there without oracleText, causing type error
- **Fix:** Added `oracleText: null` to the Card object literal in csv-parser.ts
- **Files modified:** src/lib/csv-parser.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** ede1db2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for type correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Card data model is complete with oracleText for detail modal (Plan 02-03)
- next/image configured for Scryfall URLs for card grid (Plan 02-02)
- Accent colors available as Tailwind-accessible CSS variables for UI theming
- 1 card has null oracleText (expected -- some Scryfall entries lack oracle text)

## Self-Check: PASSED

All files exist, all commits verified, all content assertions confirmed.

---
*Phase: 02-card-catalog*
*Completed: 2026-04-02*
