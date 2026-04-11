---
phase: 07-storefront-migration
plan: 01
subsystem: database, api
tags: [drizzle, neon-postgres, server-components, data-access-layer]

# Dependency graph
requires:
  - phase: 06-database-foundation
    provides: Drizzle schema (cards, orders, orderItems), db client, seed script
provides:
  - "Data access layer (src/db/queries.ts) with getCards, getCardById, getCardsMeta, rowToCard"
  - "Async server components on home, cart, checkout pages querying Postgres directly"
  - "DB error handling with user-friendly error messages on all pages"
  - "Extended Card interface with scryfallId, createdAt, updatedAt"
affects: [07-02-storefront-migration, 08-admin-auth, 09-admin-crud, 10-csv-import]

# Tech tracking
tech-stack:
  added: [server-only]
  patterns: [force-dynamic server components, try/catch DB error handling, cents-to-dollars conversion in DAL]

key-files:
  created:
    - src/db/queries.ts
  modified:
    - src/lib/types.ts
    - src/app/page.tsx
    - src/app/cart/page.tsx
    - src/app/checkout/page.tsx
    - src/components/card-grid.tsx

key-decisions:
  - "server-only import enforces server boundary at build time (T-07-01)"
  - "Price conversion (cents to dollars) centralized in rowToCard, single place in DAL"
  - "getCards orders by name ASC for deterministic client-side filtering"
  - "getCardsMeta hardcodes totalSkipped: 0, totalMissingPrices: 0 for CardData meta type contract"

patterns-established:
  - "DAL pattern: all page/API data access through src/db/queries.ts"
  - "Error shell pattern: try/catch in server component renders Header + centered error message"
  - "force-dynamic export on all pages querying DB (defense-in-depth against prerendering)"

requirements-completed: [DB-03]

# Metrics
duration: 3min
completed: 2026-04-11
---

# Phase 7 Plan 1: Queries DAL and Page Migration Summary

**Drizzle-based data access layer with cents-to-dollars conversion, plus 3 pages migrated from static JSON to async Postgres queries with error handling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-11T19:07:13Z
- **Completed:** 2026-04-11T19:10:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created src/db/queries.ts as the single data access layer with getCards, getCardById, getCardsMeta, rowToCard
- Migrated home, cart, and checkout pages from synchronous loadCardData() to async DB queries
- Added DB error handling with "Store temporarily unavailable" message on all 3 pages
- Updated CardGrid empty state from "Run npm run generate" to "No cards available yet."

## Task Commits

Each task was committed atomically:

1. **Task 1: Create queries.ts data access layer and extend Card type** - `bc264b0` (feat)
2. **Task 2: Migrate home, cart, and checkout pages to async DB queries** - `9d5ba4c` (feat)

## Files Created/Modified
- `src/db/queries.ts` - Data access layer with getCards, getCardById, getCardsMeta, rowToCard (server-only enforced)
- `src/lib/types.ts` - Extended Card interface with scryfallId, createdAt, updatedAt optional fields
- `src/app/page.tsx` - Async server component querying DB via getCards + getCardsMeta
- `src/app/cart/page.tsx` - Async server component querying DB via getCards
- `src/app/checkout/page.tsx` - Async server component querying DB via getCards
- `src/components/card-grid.tsx` - Updated empty state copy to "No cards available yet."
- `package.json` / `package-lock.json` - Added server-only dependency

## Decisions Made
- Used `server-only` import to enforce server boundary at build time (prevents accidental client import of DB code)
- Centralized price conversion (cents to dollars) in rowToCard -- single conversion point in the DAL
- getCards orders by name ASC for deterministic results supporting client-side filtering
- getCardsMeta hardcodes totalSkipped: 0 and totalMissingPrices: 0 to satisfy CardData["meta"] type contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed server-only package**
- **Found during:** Task 1 (queries.ts creation)
- **Issue:** server-only package was not installed (plan noted it "must already be available via Next.js" but it was not)
- **Fix:** Ran `npm install server-only`
- **Files modified:** package.json, package-lock.json
- **Verification:** Import resolves, TypeScript compiles cleanly
- **Committed in:** bc264b0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for server boundary enforcement. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data access layer is ready for Plan 02 (checkout API migration to DB queries)
- All 3 storefront pages now query Postgres directly
- Existing tests still pass (19/19) -- no regressions

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 07-storefront-migration*
*Completed: 2026-04-11*
