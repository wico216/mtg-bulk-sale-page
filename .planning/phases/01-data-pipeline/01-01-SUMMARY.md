---
phase: 01-data-pipeline
plan: 01
subsystem: data
tags: [next.js, typescript, tailwind, papaparse, csv, fast-glob]

# Dependency graph
requires: []
provides:
  - "Next.js 16 project scaffold with TypeScript, Tailwind, App Router"
  - "Card data model types (Card, CardData, ManaboxRow, ScryfallCard)"
  - "CSV parser that reads Manabox exports and produces typed Card[] with duplicate merging"
affects: [01-02, 01-03, 02-ui-catalog]

# Tech tracking
tech-stack:
  added: [next.js 16, typescript 5, tailwind 4, papaparse, tsx, fast-glob]
  patterns: [build-time data generation, composite dedup keys, PapaParse header+dynamicTyping]

key-files:
  created:
    - src/lib/types.ts
    - src/lib/csv-parser.ts
    - data/inventory/.gitkeep
  modified:
    - package.json
    - src/app/page.tsx
    - src/app/layout.tsx
    - .gitignore

key-decisions:
  - "String-coerce collectorNumber from PapaParse dynamicTyping to avoid numeric type mismatch"
  - "Composite dedup key: setCode-collectorNumber-foil-condition for distinct card listings"

patterns-established:
  - "CSV parsing: PapaParse with header:true, dynamicTyping:true, skipEmptyLines:true"
  - "Card identity: composite key ${setCode}-${collectorNumber}-${foil}-${condition}"
  - "Enrichment fields null/empty until Scryfall fill: price=null, colorIdentity=[], imageUrl=null"

requirements-completed: [DATA-01, DATA-04]

# Metrics
duration: 4min
completed: 2026-04-02
---

# Phase 1 Plan 1: CSV Parsing and Card Model Summary

**Next.js 16 scaffold with PapaParse CSV parser producing 136 typed Card records from Manabox export with duplicate merging**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-02T19:19:13Z
- **Completed:** 2026-04-02T19:22:58Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Next.js 16 project with TypeScript, Tailwind CSS 4, ESLint, App Router scaffolded
- Four type interfaces defined (ManaboxRow, Card, CardData, ScryfallCard) covering full data pipeline
- CSV parser reads all CSVs from data/inventory/, maps Manabox fields to Card type, merges duplicates by summing quantities
- Blue Binder.csv successfully parsed into 136 Card records with correct field mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js project** - `8e2775a` (feat)
2. **Task 2: Define card data model types** - `c3ece59` (feat)
3. **Task 3: Implement CSV parser** - `5f387b5` (feat)

## Files Created/Modified
- `src/lib/types.ts` - ManaboxRow, Card, CardData, ScryfallCard interfaces
- `src/lib/csv-parser.ts` - parseAllCsvFiles with PapaParse parsing and duplicate merging
- `src/app/page.tsx` - Placeholder page loading cards.json with fallback message
- `src/app/layout.tsx` - Updated metadata title and description
- `package.json` - Next.js 16 with papaparse, tsx, fast-glob dependencies
- `.gitignore` - Added data/generated/ and data/cache/ exclusions
- `data/inventory/Blue Binder.csv` - Moved from project root

## Decisions Made
- String-coerced collectorNumber from PapaParse dynamicTyping output to ensure correct type (some collector numbers could be non-numeric like "123a")
- Used composite dedup key (setCode-collectorNumber-foil-condition) so same card in different conditions or foil status remains separate listings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed collectorNumber type coercion**
- **Found during:** Task 3 (CSV parser implementation)
- **Issue:** PapaParse dynamicTyping converted collector numbers to numeric type, but the Card interface expects string (needed for non-numeric collector numbers like "123a")
- **Fix:** Added explicit `String()` coercion when mapping collectorNumber from CSV row
- **Files modified:** src/lib/csv-parser.ts
- **Verification:** Confirmed typeof collectorNumber === "string" in parsed output
- **Committed in:** 5f387b5 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential for type correctness. No scope creep.

## Issues Encountered
- create-next-app refused to scaffold into a directory with existing files (.planning/, Blue Binder.csv). Worked around by scaffolding into a temp directory and copying files over.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Types and CSV parser ready for Plan 02 (Scryfall enrichment)
- Card[] with null enrichment fields ready to be filled by Scryfall API calls
- data/inventory/ contains Blue Binder.csv for testing the full pipeline

## Self-Check: PASSED

All 8 key files verified on disk. All 3 task commits verified in git log.

---
*Phase: 01-data-pipeline*
*Completed: 2026-04-02*
