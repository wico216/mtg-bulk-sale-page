---
quick_id: 260514-afo
description: GitHub issues #8-#12 storefront search and card modal improvements
status: complete
date: 2026-05-14
code_commits:
  - 6227501
  - 8d4b2e7
  - 1288b58
migration_status: complete
---

# Quick Task 260514-afo Summary

## Result

Implemented in code commits `6227501`, `8d4b2e7`, and `1288b58`:

- #8: Added Card Type menu filters for Creature, Land, Instant, Sorcery, Artifact, Enchantment, and Planeswalker.
- #9: Card modal now shows Close and Go to cart actions when the card is already in the cart.
- #10: Card modal now links to the matching Scryfall card page.
- #11: Storefront search now supports a practical Scryfall-style subset: `t:`/`type:`, `o:`/`oracle:`, `n:`/`name:`, `set:`/`s:`, `r:`/`rarity:`, `f:`/`finish:`, `id:`/`identity:`/`c:`/`color:`, and `cmc:`/`mv:`/`mana:` numeric comparisons.
- #12: Desktop search input is wider and has a syntax-aware placeholder.

## Database Migration

This implementation adds nullable DB columns:

- `cards.type_line`
- `cards.mana_value`

Added migration/backfill script:

- Dry run: `npm run migrate:card-search:dry-run`
- Live run: `npm run migrate:card-search`

Migration was applied against the configured database:

- Dry-run: would add both columns, cards rows `1384 -> 1384`.
- First live run: added both columns, scanned/updated 1,384 rows, rows preserved `1384 -> 1384`, one special multi-face row still had null mana value.
- Follow-up code fix `1288b58`: derives mana value from face mana costs when Scryfall omits top-level `cmc`.
- Second live run: scanned/updated the one remaining row; missing metadata `1 -> 0`, rows preserved `1384 -> 1384`.

## Verification

- `npx vitest run src/lib/store/__tests__/filter-store.test.ts src/components/__tests__/filter-rail.test.tsx src/components/__tests__/card-modal.test.tsx src/db/__tests__/schema.test.ts src/db/__tests__/seed.test.ts src/db/__tests__/queries.test.ts src/db/__tests__/queries-aggregated.test.ts src/lib/__tests__/csv-parser-content.test.ts src/lib/__tests__/enrichment-progress.test.ts` — 96 passed before the face-mana fallback; `src/lib/__tests__/enrichment-progress.test.ts` then passed 13 tests after the fallback.
- `npm test` — 486 passed, 2 skipped.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- Scoped `npx eslint ...changed files...` — 0 errors, 1 pre-existing warning for the lightbox `<img>` in `src/components/card-grid.tsx`; scoped lint over the final fallback files passed with 0 warnings.
- `npm run build` — passed after allowing network for Google Fonts; retained pre-existing Scryfall cache dynamic-file warnings.
- Full `npm run lint` — not a useful signal in this workspace because untracked `.claude/` is linted and older unrelated repo lint debt is present.

## Next Step

Push/deploy, then close GitHub issues #8-#12 after live verification.
