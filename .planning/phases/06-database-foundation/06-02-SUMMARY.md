---
phase: 06-database-foundation
plan: 02
subsystem: database
tags: [drizzle, neon, postgres, seed, vitest, migration]

# Dependency graph
requires:
  - phase: 06-database-foundation-01
    provides: "Drizzle schema (cards, orders, orderItems tables) and Neon Postgres connection"
provides:
  - "Idempotent seed script (src/db/seed.ts) with cardToRow export"
  - "Vitest test infrastructure (vitest.config.ts, schema + seed tests)"
  - "136 cards seeded into Neon Postgres with ID-level verification"
  - "npm test script for running vitest"
affects: [07-storefront-migration, 09-admin-crud, 10-csv-import]

# Tech tracking
tech-stack:
  added: [vitest]
  patterns: [cardToRow pure function export for testability, chunked upsert with BATCH_SIZE, ID-level data integrity verification, dotenv for CLI scripts]

key-files:
  created:
    - src/db/seed.ts
    - src/db/__tests__/schema.test.ts
    - src/db/__tests__/seed.test.ts
    - vitest.config.ts
  modified:
    - package.json

key-decisions:
  - "cardToRow exported as pure function for unit testability"
  - "BATCH_SIZE=1000 stays under PostgreSQL 65535 parameter limit"
  - "ID-level verification fails hard (exit 1) on missing IDs, not just row count"
  - "scryfallId set to null -- populated by Phase 10 CSV import"

patterns-established:
  - "Pure function export pattern: business logic exported separately from side-effectful main"
  - "Vitest with @/ alias for path resolution matching tsconfig"
  - "Schema tests validate structure without database connection"
  - "Seed prerequisite check with clear error message"

requirements-completed: [DB-02]

# Metrics
duration: 22min
completed: 2026-04-11
---

# Phase 6 Plan 02: Seed Script & Test Infrastructure Summary

**Idempotent seed script migrating 136 cards from static JSON to Neon Postgres with vitest test suite, ID-level data integrity verification, and Math.round price conversion (dollars to cents)**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-11T16:54:38Z
- **Completed:** 2026-04-11T17:17:02Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Vitest installed and configured with 19 tests covering schema structure and seed logic
- Seed script with chunked upsert (BATCH_SIZE=1000) and onConflictDoUpdate for idempotency
- ID-level data integrity verification: every source card ID verified present in database
- 136 cards successfully migrated from static JSON to Neon Postgres (confirmed twice for idempotency)
- Existing build pipeline (`npm run build`) verified unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest and create test infrastructure** - `36fdaa3` (test)
2. **Task 2: Create idempotent seed script with ID-level verification** - `692dc17` (feat)
3. **Task 3: Generate cards.json, execute seed, verify migration** - no commit (verification-only task, no source changes)

## Files Created/Modified
- `vitest.config.ts` - Vitest configuration with @/ path alias and node environment
- `src/db/seed.ts` - Idempotent seed script with cardToRow export, chunked upsert, ID-level verification
- `src/db/__tests__/schema.test.ts` - 12 tests validating schema structure (columns, types, nullability)
- `src/db/__tests__/seed.test.ts` - 7 tests validating cardToRow price conversion and field mapping
- `package.json` - Added vitest devDependency and npm test script

## Decisions Made
- cardToRow exported as named pure function for unit testability (not an internal helper)
- BATCH_SIZE=1000 chosen to stay under PostgreSQL's 65535 parameter limit (17 cols * 1000 = 17000 params)
- ID-level verification uses Set comparison (not row count) per all 3 cross-AI reviewers
- scryfallId explicitly set to null in seed -- cards.json does not contain Scryfall IDs; Phase 10 CSV import will populate this column
- Seed uses dotenv loading from .env.local (runs outside Next.js runtime)
- Direct execution guard prevents seed() from running when imported by tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict index access in schema tests**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** `columns[col]` with string iterator on typed Drizzle column objects caused TS7053 error
- **Fix:** Cast columns to `Record<string, unknown>` before dynamic property access in loop
- **Files modified:** src/db/__tests__/schema.test.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 692dc17 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript type safety fix, no scope change.

## Issues Encountered
- .env.local not present in worktree (gitignored) -- copied from main repo to enable seed execution against live database
- cards.json not pre-existing -- generated via `npm run generate` before seed (as documented in plan prerequisites)

## User Setup Required

None - database already provisioned in Plan 01. Seed runs with existing .env.local DATABASE_URL.

## Next Phase Readiness
- All 136 cards from static JSON verified in Neon Postgres database
- Seed script idempotent and safe to re-run
- Test infrastructure ready for future phases (vitest configured, pattern established)
- Phase 7 (storefront migration) can read cards from database instead of static JSON
- Phase 10 CSV import can populate scryfallId column

## Self-Check: PASSED

- All 5 created/modified files verified on disk
- Both task commits (36fdaa3, 692dc17) verified in git log
- 19/19 vitest tests pass
- TypeScript compiles cleanly (tsc --noEmit)
- Seed verified idempotent (2 runs, same 136 rows)
- Build pipeline unaffected (npm run build succeeds)

---
*Phase: 06-database-foundation*
*Completed: 2026-04-11*
