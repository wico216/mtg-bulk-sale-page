# Phase 17: Parser & Etched - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `src/lib/csv-parser.ts` to ingest Manabox's `Binder Name` and `Binder Type` columns; normalize binder names safely against the Phase 20 cart-key segment-strip migration; emit `finish: 'normal' | 'foil' | 'etched'` (replacing the `foil: boolean` field that silently misclassified etched cards as `normal` in v1.2); update every `card.foil` consumer in the codebase to read `card.finish` instead; produce hand-crafted test fixtures covering the new edge cases.

Phase 17 ships in the same deploy as Phase 16 (the schema migration). Manual `npm run migrate:v1.3` runs first, then Vercel deploys v1.3 code that reads the new schema.

</domain>

<decisions>
## Implementation Decisions

### Manabox CSV literal verification (resolved during discuss)
- **D-01:** Manabox `Foil` column literal value for etched-foil cards is exactly `"etched"` (lowercase). Verified against the operator's actual 12,749-row export in `~/Downloads/ManaBox_Collection.csv`. Distribution: `normal=9357`, `foil=1837`, `etched=11`. Sample etched cards: Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven. The MEDIUM-confidence research flag is now resolved HIGH; parser test fixtures use the literal string.

### Parser type and shape (locked by research; reaffirmed)
- **D-02:** `ManaboxRow` interface gains optional fields `"Binder Name"?: string` and `"Binder Type"?: string`. Optional because older Manabox exports may lack these columns; parser must degrade gracefully (default `Binder Name` to `'unsorted'` and `Binder Type` to `'binder'` when missing).
- **D-03:** Parser normalizes binder names at parse time: `binderName.trim().toLowerCase().replace(/\s+/g, ' ').replace(/-/g, '_')`. Whitespace collapse + lowercase eliminates typo-driven splits ("A02" vs "A02 " vs "a02" all collapse to `a02`). Hyphen-to-underscore preserves the cart-key segment-strip migration in Phase 20 (cart keys are hyphen-separated; binder names with hyphens would break the segment-strip; replacing hyphens with underscores at parse time avoids the conflict).
- **D-04:** Parser skips rows where `Binder Type` is anything other than `'binder'` (case-sensitive after Manabox emits lowercase). Adds new `SkippedRow.reason = 'non-binder row'`. Import preview surfaces the count alongside existing skip reasons.
- **D-05:** Parser skips rows where `Quantity === 0`. Adds new `SkippedRow.reason = 'zero quantity'`. A 0-stock row has no buyer-side purpose and would clutter the storefront. Operators tracking empty slots in Manabox can keep them there; they just don't sync to the store DB.
- **D-06:** Composite id construction: `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}` (5 segments). The `finish` segment replaces the position previously held by `(foil ? 'foil' : 'normal')`. Per Phase 16 D-05.

### `finish` enum migration (decided in discussion)
- **D-07:** All consumers of `card.foil: boolean` are updated in Phase 17 to read `card.finish: 'normal' | 'foil' | 'etched'` directly. No backward-compat shim, no derived getter. Single-owner codebase; deprecation paths add permanent tech debt for no gain.
- **D-08:** Files to update (full sweep — anything reading `.foil` becomes `.finish`):
  - `src/lib/csv-parser.ts` — parser output type
  - `src/lib/types.ts` — `Card` interface
  - `src/lib/enrichment.ts` — Scryfall price selection (`finish === 'etched' ? prices.usd_etched : finish === 'foil' ? prices.usd_foil : prices.usd`)
  - `src/components/cart-item.tsx` — display badge (`Normal` / `Foil` / `Etched`)
  - `src/components/card-modal.tsx` — same
  - `src/app/admin/_components/inventory-table.tsx` — admin display column + filter
  - `src/app/page.tsx` — server-side `getCards()` consumer (if any reads .foil)
  - Any other grep-discovered reader of `.foil` (planner does the grep sweep)
- **D-09:** Display strings: `finish === 'normal'` shows blank or "Normal"; `finish === 'foil'` shows "Foil"; `finish === 'etched'` shows "Etched". Match existing styling (where v1.2 currently shows a "Foil" pill, v1.3 also shows "Etched" pill in the same style). Color: keep the existing foil pill color; etched gets a distinct color (planner picks; suggest `bg-purple-200` to differentiate from foil's `bg-yellow-200`).
- **D-10:** Phase 17 ships in the same git PR / Vercel deploy as Phase 16's migration. The deployment sequence is: (1) `npm run migrate:v1.3 -- --dry-run` on Neon branch, (2) `npm run migrate:v1.3` on prod, (3) push v1.3 code to main, (4) Vercel deploys v1.3 code that uses the new schema. There is a small window between step 2 and step 4 where the v1.2 code is running against v1.3 schema — code reads `card.foil` (which no longer exists in DB) and breaks. **Mitigation:** the operator runs migration immediately before triggering the deploy; total exposure is the time between migration completion and Vercel build finishing (typically <2 min). Acceptable for a friend store; if downtime ever matters, future Operations phase can introduce a feature flag.

### Test fixture strategy (decided in discussion)
- **D-11:** Hand-crafted small CSV fixtures only. Located at `src/lib/__tests__/fixtures/` (or wherever existing fixtures live — planner verifies the convention). Real 12,749-row file stays in the operator's Downloads for one-off manual smoke; not checked into git.
- **D-12:** Fixture coverage matrix (planner refines exact count):
  1. `etched-row.csv` — proves `Foil="etched"` produces `finish='etched'` distinct from `normal`/`foil` printings
  2. `multi-binder-same-card.csv` — same setCode+collectorNumber+finish+condition in two different binders → two distinct rows in output
  3. `non-binder-skip.csv` — rows with `Binder Type` of `deck` and `list` are skipped with reason='non-binder row'
  4. `name-normalization.csv` — `"A02"`, `"A02 "`, `"a02"`, and `"A-02"` all collapse to canonical binder `a_02`
  5. `zero-quantity-skip.csv` — `Quantity=0` row skipped with reason='zero quantity'
  6. `multilingual-binder.csv` — Spanish binder name with accented characters preserved through normalization (`"compré titán"` stays as `"compré titán"` after lowercase + trim)
  7. `mixed-foil-values.csv` — mix of normal/foil/etched in one CSV; verifies all three enum values produce correct rows
  8. `legacy-no-binder-columns.csv` — old Manabox export without `Binder Name`/`Binder Type` columns; parser defaults to `binder='unsorted'` and `binderType='binder'` (graceful degradation)

### Claude's Discretion
- Exact file location for test fixtures (planner verifies existing convention — likely `src/lib/__tests__/fixtures/` based on the Phase 10 pattern)
- Whether to inline the binder-normalization helper (`normalizeBinderName(raw: string): string`) as a separate exported function or keep it inline in `rowToCardOrSkip`. Planner picks based on testability + reuse needs (Phase 19 picker UI may also call this when displaying binder names — so a shared helper is likely the right call)
- Display CSS class names for the etched badge — pick what fits the existing Tailwind palette
- Whether to keep `card.foil` as a derived virtual property anywhere (recommendation: NO; rip it out cleanly per D-07)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/STACK.md` — `etched` finish gotcha at csv-parser.ts:87; no Manabox npm package; reuse existing PapaParse-based parser
- `.planning/research/ARCHITECTURE.md` — Parser change touchpoints; Phase 17 build-order rationale
- `.planning/research/PITFALLS.md` — Pitfall 7 (etched silent mishandle); Pitfall 10 (binder name typo / normalization); Pitfall 12 (multi-CSV merge collapsing binder dimension); Pitfall 15 (zero-quantity rows)
- `.planning/research/SUMMARY.md` — Phase 17 section + cross-phase dependencies

### Prior phase context
- `.planning/phases/16-schema-migration/16-CONTEXT.md` — Schema shape Phase 17 must produce values for: 5-segment id format (D-05), `pgEnum('finish', ['normal','foil','etched'])` (D-07), `cards.binder text NOT NULL DEFAULT 'unsorted'` (D-06), `order_items.binder` (D-09)

### Existing codebase patterns to mirror
- `src/lib/csv-parser.ts` — Current parser; `rowToCardOrSkip` is the function to extend; line 87 has the `const foil = row.Foil === "foil"` bug to fix
- `src/lib/types.ts` — `ManaboxRow`, `Card`, `Finish` (currently doesn't exist as a type); add `Finish = 'normal' | 'foil' | 'etched'`. `ScryfallCard.prices.usd_etched` is already at line 91 — fully wired in the type
- `src/lib/enrichment.ts` — Price ladder for Scryfall data; line 53-55 already references `usd_etched`. Selection logic to update: pick `etched` price when `finish==='etched'`
- `src/lib/import-contract.ts` — NDJSON message contract for import; SkippedRow shape (likely declared here); add new reasons `non-binder row` and `zero quantity`
- `src/lib/__tests__/csv-parser.test.ts` (or wherever existing parser tests live; planner finds it) — established test pattern for parser; extend with new fixtures

### Real-world reference
- `~/Downloads/ManaBox_Collection.csv` — 12,749-row real export from operator's Manabox. Used during discuss for etched-literal verification (D-01). Available for manual one-off smoke after Phase 17 implementation; NOT checked into git.

### Project docs
- `.planning/REQUIREMENTS.md` — CSV-05..08 are this phase's requirements
- `.planning/PROJECT.md` — Current Milestone section; "skip non-binder rows" decision

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/csv-parser.ts` `rowToCardOrSkip` function — the extension point; just adds new code paths, doesn't restructure
- `src/lib/csv-parser.ts` `mergeCards` function (per STACK research) — automatically does the right thing once `binder` is part of composite id (no change needed)
- `src/lib/types.ts` `ScryfallCard.prices.usd_etched` field — already exists; price ladder selection just needs to consume it
- `src/lib/import-contract.ts` `SkippedRow.reason` enum — extend with two new variants

### Established Patterns
- **Parser failure modes are SkippedRow with a reason** — never throws on a single bad row; collects skip reasons for the import preview to surface. Phase 17 follows this pattern for the new skip cases (`non-binder row`, `zero quantity`).
- **Type changes ripple to display layer** — Phase 8/13 added new fields to `Card`/`AdminOrderDetail` and the display components were updated in lockstep. Phase 17 follows this for `foil → finish`.
- **Test fixtures live alongside parser tests** — Phase 10 added CSV fixtures; Phase 17 extends the same fixture directory.

### Integration Points
- **Phase 16** (already discussed) — provides the `pgEnum('finish')` and `cards.binder` column that Phase 17 writes values into
- **Phase 18** (Allocator) — consumes the `finish` enum + binder column for the aggregated-key grouping (`(setCode, collectorNumber, finish, condition)`)
- **Phase 19** (Import Preview & Picker) — consumes `Binder Type`-skip count for the preview; consumes the `normalizeBinderName()` helper if separated (D-12 Discretion); consumes the parsed `cards[]` with binder field populated
- **Phase 20** (Storefront Aggregation) — consumes the `finish` enum field for `GROUP BY` queries; cart-key segment-strip migration depends on hyphen-to-underscore normalization in D-03
- **Phase 21** (Admin Visibility) — admin inventory display reads `finish` not `foil`; admin filter dropdown reads `binder` column

</code_context>

<specifics>
## Specific Ideas

- The 11 etched cards already in the operator's collection (Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, etc.) are concrete evidence the v1.2 bug matters in production. After Phase 17 ships, these cards will display correctly with their `usd_etched` prices instead of being silently lumped with the normal printings. Phase 17 SUMMARY.md should call this out explicitly as a user-visible improvement.
- Etched badge color suggestion: `bg-purple-200 text-purple-900` to visually distinguish from foil's existing yellow tint. Subtle, not a marketing gimmick.
- The binder-normalization helper (`normalizeBinderName`) is likely shared between parser (Phase 17) and picker UI (Phase 19). Plan to export it from a new file `src/lib/binder-name.ts` or extend `csv-parser.ts` exports — planner picks.

</specifics>

<deferred>
## Deferred Ideas

- **Did-you-mean hint at import time** for binder names within edit-distance 1 of an existing binder (Pitfall 10 prevention; research P2 differentiator IMP-FUT-01) — deferred to v1.3.x.
- **Backward-compat `foil` derived getter** — explicitly rejected per D-07; not deferred, just noted that the option exists if a future need arises.
- **Real 12,749-row file as a checked-in fixture** — explicitly rejected per D-11; privacy concern (operator's actual collection labels) outweighs scale-test value.
- **Binder name "display label" column** for preserving original casing — explicitly rejected; lowercase normalized form is canonical AND displayed.

</deferred>

---

*Phase: 17-Parser & Etched*
*Context gathered: 2026-05-11*
