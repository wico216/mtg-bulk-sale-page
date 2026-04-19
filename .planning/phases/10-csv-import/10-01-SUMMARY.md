---
phase: 10-csv-import
plan: 01
subsystem: database
tags: [csv, papaparse, drizzle, neon-http, vitest, tdd, batch-transaction]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    provides: parseSingleCsv row->Card mapping logic; composite ID format "setCode-collectorNumber-(foil|normal)-condition"
  - phase: 01-data-pipeline
    provides: enrichCards sequential Scryfall fetch loop and EnrichmentStats shape
  - phase: 06-database-migration
    provides: cards table schema (integer cents price, TEXT[] colorIdentity, scryfallId column)
  - phase: 06-database-migration
    provides: cardToRow dollars->cents mapper exported from src/db/seed.ts
provides:
  - parseManaboxCsvContent(content): ParseResult with per-row SkippedRow reporting (1-indexed row numbers, concrete reasons)
  - SkippedRow + ParseResult types for the admin import preview UI (D-05 zone 3)
  - enrichCards(cards, { onProgress }) -- emits (done, total) exactly cards.length times in ascending order
  - EnrichmentResult.scryfallMisses[] populated from Scryfall null returns, excluded from cards[]
  - SkippedCard + EnrichmentOptions types
  - replaceAllCards(cards) atomic bulk-replace helper using db.batch([delete, insert]) (NOT db.transaction -- throws on neon-http)
  - replaceAllCards([]) single-statement batch for empty input (defensive -- UI should still block)
  - npm test script wired to vitest run
affects: [10-02-route-handlers, 10-03-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - rowToCardOrSkip shared helper -- single source of truth for row validation, reused by parseSingleCsv (silent skip) and parseManaboxCsvContent (recorded skip)
    - db.batch([...]) as the atomicity primitive for destructive bulk operations on neon-http
    - cardToRow imported across module boundaries from @/db/seed rather than duplicated
    - Test files mock "server-only" to {} to permit import in vitest node environment

key-files:
  created:
    - src/lib/__tests__/csv-parser-content.test.ts
    - src/lib/__tests__/enrichment-progress.test.ts
    - src/db/__tests__/replace-all-cards.test.ts
    - .planning/phases/10-csv-import/10-01-SUMMARY.md
  modified:
    - src/lib/csv-parser.ts
    - src/lib/enrichment.ts
    - src/db/queries.ts
    - package.json

key-decisions:
  - "db.batch([delete, insert]) chosen over db.transaction() because drizzle-orm/neon-http throws 'No transactions support in neon-http driver' -- Neon routes batch through its HTTP transaction endpoint so atomicity is preserved"
  - "parseManaboxCsvContent is a NEW function alongside parseAllCsvFiles; the original silent-skip file path is preserved for the Phase 6 seed script (backward compat)"
  - "cardToRow reused from @/db/seed rather than extracted to a new shared module -- avoids a larger refactor and keeps seed.test.ts coverage valid"
  - "onProgress fires for both success AND skip paths -- UI progress counter advances once per card regardless of Scryfall outcome"
  - "Empty array short-circuit in replaceAllCards runs a single-statement batch([delete]) -- defensive behavior even though UI should block the case (Pitfall 7)"
  - "Row numbers are 1-indexed with header=1, first data row=2 -- matches what users see in their spreadsheet app"

patterns-established:
  - "Row validation helper returns discriminated union { card } | { skipped } so callers pick which to record vs. silently drop"
  - "Optional callback pattern (opts: EnrichmentOptions = {}) for backward-compatible API extension"
  - "Test mocks for drizzle layer: mock @/db/client with batch/delete/insert stubs, assert batch argument shape directly (no real SQL)"

requirements-completed: [CSV-01, CSV-02]

# Metrics
duration: 4min
completed: 2026-04-19
---

# Phase 10 Plan 01: Library Primitives Summary

**CSV parsing with per-row skip reporting, enrichment progress callback with Scryfall-miss detail, and atomic bulk-replace via db.batch() -- the three building blocks Phase 10 Route Handlers and Admin UI will consume verbatim.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-19T06:02:32Z
- **Completed:** 2026-04-19T06:06:40Z
- **Tasks:** 3 (all TDD: RED -> GREEN)
- **Files created:** 3 (test files + summary)
- **Files modified:** 4 (2 lib + 1 db + package.json)

## Accomplishments

- `parseManaboxCsvContent(content): ParseResult` records every skipped row with a 1-indexed row number and concrete reason ("missing Name", "missing Set code", "missing Collector number") -- admin preview UI can surface these directly without re-parsing
- `enrichCards(cards, opts)` emits `onProgress(done, total)` exactly `cards.length` times in strict ascending order, covering both successful and skipped Scryfall lookups -- progress bar accuracy guaranteed
- `EnrichmentResult.scryfallMisses[]` surfaces the set/collector/name/reason for every card Scryfall couldn't resolve, separate from successful cards
- `replaceAllCards(cards)` issues a single `db.batch([delete, insert])` call, atomic under neon-http. `replaceAllCards([])` runs a defensive single-statement batch. No call site of `db.transaction()` exists in production code.
- `cardToRow` imported from `@/db/seed` -- no duplication, existing seed.test.ts coverage remains authoritative
- `npm test` now runs `vitest run` (18 new tests added; full suite 110/110 GREEN, up from 92)

## Task Commits

Each task was committed atomically following TDD (failing test first, then implementation):

1. **Task 1: Failing test stubs for csv-parser, enrichment, replaceAllCards (RED)** -- `97058b8` (test)
2. **Task 2: parseManaboxCsvContent + enrichCards onProgress/scryfallMisses (GREEN)** -- `ae94b06` (feat)
3. **Task 3: replaceAllCards via db.batch (GREEN)** -- `8303043` (feat)

## Exact Signatures (for Plans 10-02 and 10-03 to import verbatim)

**`src/lib/csv-parser.ts`** (new exports):

```typescript
export interface SkippedRow {
  rowNumber: number;           // 1-indexed (header=1, first data row=2)
  reason: string;              // "missing Name" | "missing Set code" | "missing Collector number" | `parse error: ${...}`
  name?: string;
  setCode?: string;
  collectorNumber?: string;
}

export interface ParseResult {
  cards: Card[];
  skippedRows: SkippedRow[];
}

export function parseManaboxCsvContent(content: string): ParseResult;
```

**`src/lib/enrichment.ts`** (new + updated exports):

```typescript
export interface SkippedCard {
  setCode: string;
  collectorNumber: string;
  name: string;
  reason: string;            // "not found on Scryfall" this phase
}

export interface EnrichmentOptions {
  onProgress?: (done: number, total: number) => void;
}

export interface EnrichmentResult {
  cards: Card[];
  stats: EnrichmentStats;           // unchanged
  scryfallMisses: SkippedCard[];    // NEW
}

export async function enrichCards(
  cards: Card[],
  opts?: EnrichmentOptions,
): Promise<EnrichmentResult>;
```

**`src/db/queries.ts`** (new export):

```typescript
export async function replaceAllCards(
  newCards: Card[],
): Promise<{ inserted: number }>;
```

## Test Counts and Commands

All three new test files are GREEN; existing suite is unchanged.

| File                                                  | Tests | Run                                                                          |
| ----------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `src/lib/__tests__/csv-parser-content.test.ts`        | 6     | `npx vitest run src/lib/__tests__/csv-parser-content.test.ts`                |
| `src/lib/__tests__/enrichment-progress.test.ts`       | 6     | `npx vitest run src/lib/__tests__/enrichment-progress.test.ts`               |
| `src/db/__tests__/replace-all-cards.test.ts`          | 6     | `npx vitest run src/db/__tests__/replace-all-cards.test.ts`                  |
| **Full suite**                                        | **110** | `npm test` (or `npx vitest run`)                                          |

Pre-existing totals: 8 files / 92 tests. Post-Plan-01: **11 files / 110 tests passing**. Delta: +3 files, +18 tests, 0 regressions.

## Files Created/Modified

- **`src/lib/csv-parser.ts`** (modified) -- Added `SkippedRow`, `ParseResult` exports; extracted shared `rowToCardOrSkip` helper; appended `parseManaboxCsvContent`. Existing `mergeCards`, `parseSingleCsv`, `parseAllCsvFiles` preserved (backward-compat for Phase 6 seed path).
- **`src/lib/enrichment.ts`** (modified) -- Added `SkippedCard`, `EnrichmentOptions` exports; extended `EnrichmentResult` with `scryfallMisses`; `enrichCards` now accepts `opts` and invokes `onProgress` once per card (both success and skip paths).
- **`src/db/queries.ts`** (modified) -- Imported `cardToRow` from `@/db/seed`; appended `replaceAllCards` using `db.batch([...])`.
- **`package.json`** (modified) -- Added `"test": "vitest run"` between `"start"` and `"lint"`. No dependency changes.
- **`src/lib/__tests__/csv-parser-content.test.ts`** (created) -- 6 tests covering valid CSV, missing Name/Set code/Collector number, mixed CSV row-numbering, and alphanumeric collector preservation.
- **`src/lib/__tests__/enrichment-progress.test.ts`** (created) -- 6 tests covering onProgress invocation count/order, backward-compat (no opts), scryfallMisses population, stats parity, USD price fallback, and onProgress on skip path.
- **`src/db/__tests__/replace-all-cards.test.ts`** (created) -- 6 tests covering batch arity (2 for populated, 1 for empty), no-transaction guarantee, rejection rethrow, dollars->cents proof, and double-check on batch count.

## Decisions Made

None beyond what the plan explicitly prescribed. The key pre-made choices (documented above in frontmatter) were all plan-specified:

- Use `db.batch([...])` not `db.transaction()` (neon-http constraint, RESEARCH Pitfall 1)
- Reuse `cardToRow` from `@/db/seed` rather than extract
- 1-indexed row numbers with header=1
- `onProgress` fires on both success and skip paths

## Deviations from Plan

None -- plan executed exactly as written. All three TDD tasks followed the prescribed RED->GREEN flow, every acceptance criterion was verified, and no Rule 1-3 auto-fixes were needed (no bugs discovered, no missing critical functionality, no blocking issues).

## Issues Encountered

None.

## Confirmations (plan output spec)

- **`db.transaction(` is NOT invoked in `src/db/queries.ts`** -- the string appears once, but only inside a documentation comment at line 199 explaining why `db.batch([...])` is used instead. The plan's own verification step (line 537: `grep -RF "db.transaction(" src/` returns no matches outside of documentation comments) anticipates this.
- **`cardToRow` is imported from `@/db/seed`, not duplicated** -- exact line in `src/db/queries.ts`: `import { cardToRow } from "@/db/seed";`. `src/db/seed.ts` diff shows zero changes.
- **Full vitest suite is GREEN**: 11 test files / 110 tests passing. Pre-existing `src/db/__tests__/queries.test.ts`, `seed.test.ts`, `admin-queries.test.ts`, `schema.test.ts` all still pass.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- **10-02 (Route Handlers)** can import `parseManaboxCsvContent`, `enrichCards` (with `onProgress`), and `replaceAllCards` verbatim -- no signature surprises, no scavenging required.
- **10-03 (Admin UI)** can rely on `SkippedRow[]` from parse and `scryfallMisses[]` from enrichment to drive the preview panel (D-05 zone 3).
- No blockers; no concerns.

## Self-Check: PASSED

All 4 created files verified on disk. All 4 modified files exist. All 3 task commits (`97058b8`, `ae94b06`, `8303043`) verified in git log.

---
*Phase: 10-csv-import*
*Completed: 2026-04-19*
