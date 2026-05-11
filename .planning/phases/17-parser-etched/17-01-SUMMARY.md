---
phase: 17-parser-etched
plan: 01
type: execute
status: completed
completed: 2026-05-11
---

# Phase 17 Plan 01 — SUMMARY

## CONTEXT 12-Decision Audit

| ID | Decision | Status | Satisfied by | Evidence |
|----|----------|--------|--------------|----------|
| D-01 | Manabox `Foil="etched"` literal verified against operator's CSV | satisfied | Tasks 3, 5, 7 | parser test "parses Foil='etched' as finish='etched' …"; enrichment test "etched finish prefers usd_etched …"; admin export test third row asserts `,etched$` |
| D-02 | `ManaboxRow` has optional `Binder Name` + `Binder Type`; legacy CSVs default to `unsorted` / `binder` | satisfied | Tasks 2, 3 | `src/lib/types.ts` ManaboxRow `"Binder Name"?:` / `"Binder Type"?:`; parser test #8 "legacy export … defaults binder=unsorted" |
| D-03 | `normalizeBinderName(raw)` algorithm: `String→trim→lowercase→\s+→' '→/-/→'_'`; empty → `'unsorted'` | satisfied | Task 1 | `src/lib/binder-name.ts`; 13 unit tests in `src/lib/__tests__/binder-name.test.ts` |
| D-04 | Skip `Binder Type != 'binder'` rows with `reason='non-binder row'` | satisfied | Task 3 | parser test "skips Binder Type='deck' and Binder Type='list' rows with reason 'non-binder row'" |
| D-05 | Skip `Quantity===0` rows with `reason='zero quantity'` | satisfied | Task 3 | parser test "skips Quantity=0 rows with reason 'zero quantity'" |
| D-06 | 5-segment composite id `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}` | satisfied | Tasks 2, 3, 4 | `Card.id` JSDoc updated in `src/lib/types.ts`; parser test asserts `id.split('-').length === 5` |
| D-07 | RIP OUT `card.foil` cleanly — no shim, no derived getter | satisfied | Tasks 2, 4, 6, 7 | Task 8 grep proof: zero production readers of `.foil` outside JSDoc + test-name markers + Phase 16 D-07 sentinel assertion |
| D-08 | Sweep all `.foil` consumers (parser, enrichment, queries, seed, store, 4 components, admin export, tests) | satisfied | Tasks 3–7 | 8 production files migrated: csv-parser, enrichment, queries, seed, filter-store, card-tile, card-modal, cart-item, admin/export/route; all 7 affected test files updated |
| D-09 | Etched display: pill `bg-purple-200 text-purple-900` (or inline-style equivalent) | satisfied | Task 6 | `src/components/card-tile.tsx` `FinishPill` helper renders `background:'#e9d5ff'` + `color:'#581c87'` for `finish==='etched'`; modal echoes color in Finish row; cart-item suffix renders ' · Etched' |
| D-10 | Phase 17 ships in same v1.3 PR as Phase 16 schema migration | satisfied | git history | Commits 90ee981, 13d98df, 130aad1, 86a0ff0, f8cfb2b, aeba311, 6dc2506 land on the same v1.3 release branch as Phase 16's existing commits; deployment sequence documented in cutover note below |
| D-11 | Hand-crafted small CSV fixtures only (inline strings via `makeCsv`); no checked-in 12,749-row file | satisfied | Task 3 | All 8 new fixtures use inline-CSV strings via the extended `makeCsv` helper in `src/lib/__tests__/csv-parser-content.test.ts`; no fixtures directory created |
| D-12 | Fixture coverage matrix — 8 scenarios | satisfied | Task 3 | One `it()` block per scenario in csv-parser-content.test.ts (etched-row, multi-binder-same-card, non-binder-skip, name-normalization, zero-quantity-skip, multilingual-binder, mixed-foil-values, legacy-no-binder-columns); D-12 fixture-4 wording asymmetry resolved by the test (3+1 equivalence classes) |

All 12 decisions satisfied. No gaps.

## Files Modified

### Production (10)

- `src/lib/binder-name.ts` (NEW) — Shared `normalizeBinderName` helper consumed by both Phase 17 parser and Phase 19 picker UI.
- `src/lib/types.ts` — Added `Finish = 'normal' | 'foil' | 'etched'` alias; widened `ManaboxRow.Foil` to `Finish`; added optional `"Binder Name"` and `"Binder Type"` columns; replaced `Card.foil:boolean` with `Card.finish:Finish` + `Card.binder:string`; updated `Card.id` JSDoc to 5-segment.
- `src/lib/csv-parser.ts` — `rowToCardOrSkip` extended for `Quantity=0` skip, `Binder Type≠'binder'` skip, `normalizeBinderName` consumption, defensive Foil-literal guard, 5-segment id; `mergeCards` JSDoc rolls forward.
- `src/lib/enrichment.ts` — `getPrice` rewritten to take `finish:Finish` with three-branch ladder; `enrichCards` call site updated; etched fix documented.
- `src/db/queries.ts` — `rowToCard` returns `finish` + `binder` directly; Phase 16 transitional shim removed; JSDoc rewritten.
- `src/db/seed.ts` — `cardToRow` reads `card.finish` + `card.binder` directly (no derivation, no hard-coded `'unsorted'`); JSDoc rewritten.
- `src/lib/store/filter-store.ts` — `selectedFinishes:Set<Finish>` (was `Set<string>`); filter comparator reads `card.finish` directly.
- `src/components/card-tile.tsx` — Extracted `FinishPill` helper; etched gets purple inline-style pill (D-09).
- `src/components/card-modal.tsx` — Finish row renders `Etched` / `Foil` / `Nonfoil` with matching purple text color for etched.
- `src/components/cart-item.tsx` — Set-line suffix renders ` · Etched` / ` · Foil` / `''` based on `card.finish`.
- `src/components/filter-rail.tsx` — Finish facet extends from 2 checkboxes (Foil + Nonfoil) to 3 (Normal, Foil, Etched).
- `src/app/api/admin/export/route.ts` — Header column `Foil` → `Finish`; data row emits `row.finish` directly (drops Phase 16 transitional coercion).

### Tests (7)

- `src/lib/__tests__/binder-name.test.ts` (NEW) — 13 unit tests for `normalizeBinderName`.
- `src/lib/__tests__/csv-parser-content.test.ts` — Existing Tests A..F updated to 5-segment ids + `finish`/`binder` shape; `makeCsv` extended to optionally append the two binder columns; 8 new fixture tests added.
- `src/lib/__tests__/enrichment-progress.test.ts` — `makeCard` factory updated; foil-fixture ids bumped to 5-segment; renamed two existing tests for clarity; added 2 new etched-finish ladder tests.
- `src/db/__tests__/seed.test.ts` — `makeCard` factory updated; "derives finish='foil' when card.foil is true" test repurposed as "passes through card.finish='foil' to row.finish"; added new `etched` and `binder='a07'` passthrough tests.
- `src/db/__tests__/queries.test.ts` — `makeRow` factory updated; full-shape Card assertion expects `finish`+`binder`; added `binder` and `finish='etched'` passthrough tests.
- `src/db/__tests__/replace-all-cards.test.ts` — `makeCard` factory updated; delete-returning fixture ids bumped to 5-segment.
- `src/app/api/admin/export/__tests__/route.test.ts` — `testRows` extended with third `finish='etched'` row; header-row assertion expects `,Finish`; per-row test renamed and asserts three line-end patterns.
- `src/app/api/admin/import/__tests__/preview.test.ts` — `sampleCard` factory updated; ids in mock cards bumped to 5-segment.
- `src/app/api/admin/import/__tests__/commit.test.ts` — `sampleCard` factory updated.

## Test Counts

| Metric | Phase 16 baseline | Phase 17 result | Delta |
|--------|-------------------|------------------|-------|
| Test files | 29 | 30 | +1 |
| Tests passing | 300 | 327 | +27 |
| Tests failing | 0 | 0 | 0 |

### New tests added (in detail)

- `binder-name.test.ts`: 13 tests covering lowercase, trim, internal-whitespace collapse, hyphen→underscore, multilingual preservation, fixture-4 asymmetry, empty/null/undefined → 'unsorted', and PapaParse-numeric defensive coerce.
- `csv-parser-content.test.ts`: 8 new fixture tests (D-12 matrix); existing Tests A–F updated for the new card shape.
- `enrichment-progress.test.ts`: 2 new etched-finish ladder tests; renamed two foil tests for clarity.
- `seed.test.ts`: 2 new tests (`finish='etched'` passthrough; `binder='a07'` passthrough).
- `queries.test.ts`: 2 new tests (binder passthrough; `finish='etched'` passthrough).
- `route.test.ts` (admin export): expanded "renders foil…" test now asserts three rows / three values.

## `foil`-grep Proof (Task 8)

### Grep 1: `card\.foil` or `\.foil\b` readers in src/

```
src/db/__tests__/schema.test.ts:43:    expect((columns as Record<string, unknown>).foil).toBeUndefined();
src/lib/__tests__/enrichment-progress.test.ts:139:  it("foil finish prefers usd_foil over usd (Test E.foil)", async () => {
src/lib/__tests__/enrichment-progress.test.ts:155:  it("foil finish falls back to usd_etched then usd when usd_foil missing (Test E.foil-fallback)", async () => {
```

Classification (all permitted by the Task 8 verify rule):
- `src/db/__tests__/schema.test.ts:43` — Phase 16 D-07 sentinel: asserts the legacy `columns.foil` is `undefined` (this is *proof of removal*, not a residual reader).
- Two `enrichment-progress.test.ts` matches — `Test E.foil` and `Test E.foil-fallback` are test-name labels, not field accesses.

### Grep 2: `foil:\s*boolean` / `foil:\s*true` / `foil:\s*false` declarations

```
src/lib/csv-parser.ts:47: *     `'etched'` per D-01) instead of the legacy `foil: boolean`. Defensive
src/lib/enrichment.ts:49: *     etched card was treated as `foil: false` and silently took the
```

Both are JSDoc comments documenting the historical change (allowed by the Task 8 rule for "comments documenting the historical change").

**RESULT:** zero non-comment, non-test-marker, non-assertion-of-absence matches in `src/`. The codebase is verifiably free of the legacy `card.foil` field; every reader was migrated.

## Phase 16 Deferred Items Resolved

Phase 16 SUMMARY ("Known limitations / deferred items") flagged two items as Phase 17 work:

| Phase 16 item | Resolved by Phase 17 |
|---------------|------------------------|
| Card type still carries `foil: boolean` (transitional shim in `rowToCard` / `cardToRow`) | Task 4 — `Card.foil` removed from the type; `rowToCard` returns `finish`+`binder` directly; `cardToRow` reads them directly. JSDoc rewritten. |
| CSV export `Foil` header still says `Foil` even though `etched` rows export under it (transitional ternary in `src/app/api/admin/export/route.ts`) | Task 7 — Header renamed `Foil` → `Finish`; data row emits `row.finish` literal directly. |

## Phase 17 Deferred Items

These are explicitly out of scope for Phase 17; each has a planned destination:

- **`replaceCardsForBinders` per-binder scoped delete** — currently `replaceAllCards` wipes the whole `cards` table on every import. Phase 19 (Import Preview & Picker) will rename it and scope the delete to the binders the operator selected, so a partial import doesn't blow away unrelated binders.
- **Cart-key reconciler (legacy 4-segment → 5-segment migration)** — the parser produces 5-segment ids today, but pre-v1.3 carts in localStorage may still hold 4-segment ids. Phase 20's `PublicCard`/`AdminCard` split brings the cart-page reconciler that strips/extends segments safely (D-13 pattern, EXTENDED — not via Zustand `migrate`).
- **Binder picker UI consuming `normalizeBinderName`** — the helper is exported from `src/lib/binder-name.ts` and ready to import. Phase 19 wires it into the picker's edit field.
- **"Did-you-mean" hint at import time** for binder names within edit-distance 1 of an existing binder (CONTEXT deferred section, IMP-FUT-01) — explicitly deferred to v1.3.x.

## User-Visible Improvement (CONTEXT specifics)

Pre-Phase-17, the 11 etched cards already in the operator's collection (Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, …) silently took the non-foil `usd` price. After this phase ships:

1. The next CSV import re-parses each row with `finish: 'etched'` from the `Foil="etched"` literal in the operator's Manabox export.
2. Scryfall enrichment selects `prices.usd_etched` for each etched row (Task 5 ladder).
3. The storefront tile shows a distinct purple `ETCHED` pill; the modal Finish row reads `Etched`; the cart-item set-line suffix reads ` · Etched`.
4. The Finish facet in the filter rail gets a third checkbox so buyers can find etched listings as a discrete category.

The pre-existing DB rows from Phase 16's backfill (which mapped `foil` boolean to `'normal'` or `'foil'`) become correct as soon as the next import runs.

## Cutover Note

Phase 17 ships in the same v1.3 PR / Vercel deploy as Phase 16's migration. Deployment sequence:

1. `npm run migrate:v1.3 -- --dry-run` on a Neon branch (operator).
2. `npm run migrate:v1.3` on production (operator).
3. Push the v1.3 branch (Phases 16 + 17 combined) to `main`.
4. Vercel deploys.
5. Operator runs the next CSV import to populate `finish='etched'` rows from the `Foil="etched"` literal in the Manabox export.

## Git Commit Hashes

| Commit | Task | Description |
|--------|------|-------------|
| 90ee981 | 1 | feat(17-01): add normalizeBinderName helper + 13 unit tests |
| 13d98df | 2 | refactor(17-01)!: replace Card.foil:boolean with Card.finish:Finish + Card.binder |
| 130aad1 | 3 | feat(17-01): parser ingests Binder Name/Type, emits 5-segment id, fixes etched |
| 86a0ff0 | 4 | refactor(17-01): rip out Phase 16 foil-derived shim from DB layer |
| f8cfb2b | 5 | fix(17-01): Scryfall etched price ladder — fix v1.2 latent mispricing |
| aeba311 | 6 | feat(17-01): display surfaces read card.finish; etched gets purple pill |
| 6dc2506 | 7 | feat(17-01)!: admin export emits 3-value Finish column (resolves Phase 16 deferred) |

(Tasks 8 and 9 are verify/document-only — no source commits.)

## Verification Status

All quality gates green:

- `npx tsc --noEmit` — 0 errors
- `npm test` — 327/327 passing across 30 files (was 300/29 baseline; +27 net new tests)
- `npm run build` — Next.js build succeeds; all 25 routes generated
- `git diff --check` — clean
- `foil`-grep Pass 1 (`.foil`) — 3 matches, all in the allowed-exception list
- `foil`-grep Pass 2 (`foil:\s*boolean|true|false`) — 2 matches, both JSDoc historical comments
