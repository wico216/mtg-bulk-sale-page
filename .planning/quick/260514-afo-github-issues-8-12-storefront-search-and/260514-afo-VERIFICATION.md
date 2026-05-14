---
quick_id: 260514-afo
status: passed
date: 2026-05-14
verified_commits:
  - 6227501
  - 8d4b2e7
  - 1288b58
---

# Verification: Quick Task 260514-afo

## Must-Haves

- #8 card type menu filters: PASS — `FilterRail` adds a Card Type section wired to `selectedTypes`, and tests cover selection/filtering.
- #9 close/go-to-cart after add: PASS — `CardModal` shows Close and Go to cart when `useCartStore.hasItem(card.id)` is true; test covers both actions.
- #10 Scryfall card link: PASS — `CardModal` links to `https://scryfall.com/card/{setCode}/{collectorNumber}` with a test.
- #11 Scryfall-style search: PASS — `filter-store` supports type, oracle, name, set, rarity, finish, color identity, and mana value tokens with tests.
- #12 larger desktop search: PASS — `SortBar` expands the search input to `flex: "1 1 560px"` / `maxWidth: 760`.
- Public storefront does not expose binders: PASS — changes extend `PublicCard` with search metadata only; existing public binder stripping remains unchanged.
- Production DB readiness: PASS — `cards.type_line` and `cards.mana_value` were added and backfilled; missing metadata is now 0.

## Evidence

- Focused tests: 96 passed before the face-mana fallback; fallback test file then passed 13/13.
- Full tests: `npm test` passed 486 tests, 2 skipped.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed.
- Migration dry-run: rows `1384 -> 1384`, columns would add.
- Migration live: rows preserved, backfill complete, missing metadata `1 -> 0` after fallback rerun.

## Residual Risk

- Full `npm run lint` still reports unrelated existing lint debt and untracked `.claude/` files. Scoped changed-file lint is clean except the pre-existing lightbox `<img>` warning in `src/components/card-grid.tsx`.
