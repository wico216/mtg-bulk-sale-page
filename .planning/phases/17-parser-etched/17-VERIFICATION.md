---
phase: 17-parser-etched
type: verification
status: passed
verified: 2026-05-11
---

# Phase 17 — Verification

## Status: PASSED

All success criteria from `17-01-PLAN.md` are met. The 12 CONTEXT decisions are pinned by tests or production code, the `foil`-grep proof returns zero non-comment matches, and the whole-repo gate (tsc + vitest + build) is green.

## Success Criteria Audit

| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| CSV-05 | `ManaboxRow` has optional `Binder Name` + `Binder Type`; legacy CSVs default `binder='unsorted'` | passed | `src/lib/types.ts` ManaboxRow optional fields; csv-parser-content.test.ts test #8 ("legacy export … defaults binder=unsorted") |
| CSV-06 | Rows with `Binder Type != 'binder'` skipped with `reason='non-binder row'`; count flows through `SkippedRow[]` | passed | csv-parser-content.test.ts test #3 asserts both `'deck'` and `'list'` rows skip with the exact reason |
| CSV-07 | Binder names normalized via `normalizeBinderName()` exported from `src/lib/binder-name.ts`; algorithm is exactly `trim().toLowerCase().replace(/\s+/g, ' ').replace(/-/g, '_')`; helper consumable by Phase 19 | passed | `src/lib/binder-name.ts` (named export, no default); algorithm matches the spec; 13 unit tests; consumed by parser at line 116 |
| CSV-08 | `Foil='etched'` rows parse to `finish='etched'`; composite id distinct from normal/foil twins; v1.2 csv-parser.ts:87 bug gone | passed | csv-parser-content.test.ts test #1 asserts three distinct 5-segment ids for normal/foil/etched twins; old `const foil = row.Foil === "foil"` line is deleted |
| D-06 | 5-segment composite id format produced by parser | passed | Asserted in test #1 (`expect(id.split('-')).toHaveLength(5)`) and embedded in expected-card literals throughout |
| D-07 | No backward-compat `foil` derived getter / virtual property anywhere in src/ | passed | Task 8 grep — every match is either a JSDoc comment, a test-name marker, or the Phase 16 D-07 sentinel assertion |
| D-08 | Every grep-discovered `card.foil` reader rewritten | passed | Production: csv-parser.ts, types.ts, enrichment.ts, queries.ts, seed.ts, cart-item.tsx, card-tile.tsx, card-modal.tsx, filter-rail.tsx, filter-store.ts, admin/export/route.ts (11 files). Tests: csv-parser-content.test.ts, enrichment-progress.test.ts, seed.test.ts, queries.test.ts, replace-all-cards.test.ts, export/route.test.ts, import/preview.test.ts, import/commit.test.ts (8 files). |
| D-09 | Etched display: `Etched` label with `bg-purple-200 text-purple-900` (or inline equivalent) | passed | `src/components/card-tile.tsx` `FinishPill` renders inline `background:'#e9d5ff'` + `color:'#581c87'` (Tailwind bg-purple-200 / text-purple-900) for `finish==='etched'`; modal Finish row + cart-item suffix updated |
| Scryfall etched mispricing | `getPrice` selects `usd_etched` for `finish==='etched'`; v1.2 mispricing corrected | passed | `src/lib/enrichment.ts` 3-branch ladder; tests "etched finish prefers usd_etched over usd_foil and usd" + "etched finish falls back to usd_foil then usd when usd_etched missing" |
| Phase 16 deferred items | Card type carries `foil` — resolved; admin export `Foil` header — resolved | passed | Task 4 removed `Card.foil` and the queries/seed shims; Task 7 renamed the export header to `Finish` and removed the transitional ternary |
| Whole-repo `tsc --noEmit` + `npm test` + `npm run build` green; both `foil` greps return zero matches outside allowed exceptions | passed | tsc: 0 errors. Tests: 327/327 passing across 30 files (+27 vs Phase 16 baseline). Build: success, 25 routes. Greps: 5 total matches across the two patterns, all in the documented exception classes (JSDoc, test-name markers, schema-test removal-assertion). |

## Whole-Repo Gate (Task 8 captured)

```
npx tsc --noEmit         → exit 0, no output
npm test                 → 30 files, 327 tests passing
npm run build            → "Generating static pages using 15 workers (14/14)" + 25 routes listed
git diff --check         → clean
```

## Etched-Bug Fix End-to-End Verification

The v1.2 latent etched mispricing is verified at three layers:

1. **Parser (Task 3)** — `src/lib/__tests__/csv-parser-content.test.ts` test #1 asserts that a Manabox row with `Foil="etched"` produces a Card with `finish: 'etched'` and a 5-segment id ending `-etched-near_mint-a07` distinct from normal/foil twins.
2. **Enrichment (Task 5)** — `src/lib/__tests__/enrichment-progress.test.ts` "etched finish prefers usd_etched over usd_foil and usd" pins the price selection: a Wrath of God fixture with Scryfall response `{ usd: '1.00', usd_foil: '5.00', usd_etched: '8.00' }` produces `card.price === 8.00` (not 1.00 as in v1.2).
3. **Display (Task 6)** — card-tile shows the purple `ETCHED` pill, card-modal Finish row reads `Etched`, cart-item suffix shows ` · Etched`, filter-rail surfaces `Etched` as a discrete checkbox in the Finish facet (D-09 wired all the way through).

The 11 etched cards in the operator's collection will become correct on the next CSV import + Scryfall enrichment after the v1.3 deploy.

## Outstanding Human Items

None. The phase is structurally complete and machine-verified end-to-end. The operator's Neon-branch dry-run for the Phase 16 schema migration is a Phase 16 prerequisite (already documented in `16-01-SUMMARY.md`), not a Phase 17 item.

## Deviations from Plan

None of substance. The plan's "deviations from plan" framing was about the 4 documented divergences embedded in the plan (inline CSVs vs separate fixtures dir, etc.), which were honored exactly as written.

One minor mechanical addition not explicitly enumerated in the plan: the `Card.foil` removal triggered a tsc error in `src/db/__tests__/queries.test.ts` line 33 (the `makeRow` mock-DB-row factory had `foil: false`), which I fixed by replacing it with `finish: 'normal', binder: 'unsorted'`. The plan called this out in Task 4's behavior block ("`makeRow` factory at line 33") so this is the intended fix path; flagged here only for traceability.
