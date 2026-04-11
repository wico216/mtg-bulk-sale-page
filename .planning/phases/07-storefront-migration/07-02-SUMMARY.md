---
phase: 07-storefront-migration
plan: 02
subsystem: api, database, testing
tags: [drizzle, neon-postgres, checkout, data-access-layer, vitest, pipeline-cleanup]

# Dependency graph
requires:
  - phase: 07-01-storefront-migration
    provides: Data access layer (src/db/queries.ts) with getCards, getCardById, getCardsMeta, rowToCard
provides:
  - "Checkout API route using live DB queries instead of static JSON"
  - "Unit tests for rowToCard (price conversion edge cases) and getCardsMeta (meta contract)"
  - "Updated seed.ts without data/generated/cards.json dependency"
  - "Cleaned build pipeline: no generate-data.ts step"
affects: [08-admin-auth, 09-admin-crud, 10-csv-import]

# Tech tracking
tech-stack:
  added: []
  patterns: [DB error handling with 503 in API routes, TDD for DAL pure functions]

key-files:
  created:
    - src/db/__tests__/queries.test.ts
  modified:
    - src/app/api/checkout/route.ts
    - src/db/seed.ts
    - package.json
  deleted:
    - src/lib/load-cards.ts
    - scripts/generate-data.ts

key-decisions:
  - "Checkout DB errors return 503 with generic message (never expose DB details per T-07-06)"
  - "seed.ts becomes DB status checker rather than full re-seed tool (original source deleted)"
  - "cardToRow kept in seed.ts for test compatibility (seed.test.ts) and potential Phase 10 reuse"
  - "data/generated/ directory already absent from this branch (no deletion needed)"

patterns-established:
  - "API route DB error pattern: inner try/catch for DB calls, 503 + console.error + generic user message"
  - "Test pattern for server-only modules: vi.mock('server-only', () => ({})) before imports"

requirements-completed: [DB-03]

# Metrics
duration: 4min
completed: 2026-04-11
---

# Phase 7 Plan 2: Checkout Migration, Query Tests, and Pipeline Cleanup Summary

**Checkout API migrated to live DB queries with 503 error handling, 12 unit tests for rowToCard/getCardsMeta, and static JSON pipeline fully removed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-11T19:13:32Z
- **Completed:** 2026-04-11T19:17:43Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 2 modified, 2 deleted)

## Accomplishments
- Migrated checkout API from loadCardData() to getCards() with DB error handling (503 + generic message)
- Created 12 unit tests: 9 for rowToCard (price conversion, timestamps, field mapping) and 3 for getCardsMeta (meta contract with totalSkipped=0, totalMissingPrices=0)
- Updated seed.ts to remove data/generated/cards.json dependency (now DB status checker)
- Deleted load-cards.ts, generate-data.ts, and simplified build script to "next build"
- Preserved csv-parser.ts and scryfall.ts for Phase 10 reuse

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unit tests for queries.ts (rowToCard + getCardsMeta)** - `6292b1d` (test)
2. **Task 2: Migrate checkout API route and update seed.ts** - `d548f2d` (feat)
3. **Task 3: Delete defunct pipeline files and update build script** - `9bdb866` (chore)

## Files Created/Modified
- `src/db/__tests__/queries.test.ts` - 12 unit tests for rowToCard price/timestamp/field conversion and getCardsMeta meta contract
- `src/app/api/checkout/route.ts` - Replaced loadCardData() with getCards() from @/db/queries, added DB error handling (503)
- `src/db/seed.ts` - Removed file-reading logic, now DB connectivity/status checker with cardToRow preserved
- `package.json` - Build script simplified from "tsx scripts/generate-data.ts && next build" to "next build", removed "generate" script
- `src/lib/load-cards.ts` - DELETED (D-15: all call sites migrated)
- `scripts/generate-data.ts` - DELETED (D-12: build-time generation removed)

## Decisions Made
- Checkout DB errors return HTTP 503 (Service Unavailable) with "Unable to process order right now, please try again" -- generic message per D-10 that never leaks DB connection details
- seed.ts converted to DB status checker rather than deleted entirely -- cardToRow is tested by seed.test.ts and may be reused in Phase 10
- Test mocking strategy: vi.mock("server-only") at top of test file, vi.mock("@/db/client") with chain-reset per test for getCardsMeta

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All storefront data access now goes through src/db/queries.ts (complete DAL migration)
- No remaining references to loadCardData or static JSON anywhere in src/
- Build pipeline simplified: "next build" only, no generate step
- 31 tests passing (schema: 12, seed: 7, queries: 12)
- Ready for Phase 8 (Admin Auth) -- no blockers

## Self-Check: PASSED

All files exist. All commits verified (6292b1d, d548f2d, 9bdb866).

---
*Phase: 07-storefront-migration*
*Completed: 2026-04-11*
