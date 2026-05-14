---
quick_id: 260514-afo
description: GitHub issues #8-#12 storefront search and card modal improvements
status: planned
mode: quick-validate-inline
date: 2026-05-14
must_haves:
  truths:
    - "Issues covered: #8 card type menu filters, #9 close/go-to-cart after add, #10 Scryfall card link, #11 Scryfall-style search tokens, #12 larger desktop search bar."
    - "Project has no .github issue templates, so GitHub issue bodies are the source requirements."
    - "Next.js 16 docs were read before touching client components: use-client and next/link."
    - "Public storefront data must not expose binder names."
    - "Scryfall type/cmc search requires additive card metadata; existing production rows need a manual migration/backfill before code depending on those columns is deployed."
  artifacts:
    - "src/lib/store/filter-store.ts"
    - "src/components/filter-rail.tsx"
    - "src/components/sort-bar.tsx"
    - "src/components/card-grid.tsx"
    - "src/components/card-modal.tsx"
    - "src/db/schema.ts"
    - "src/db/queries.ts"
    - "src/lib/enrichment.ts"
    - "scripts/migrate-v1.3.x-card-search-metadata.ts"
  key_links:
    - "https://github.com/wico216/mtg-bulk-sale-page/issues/8"
    - "https://github.com/wico216/mtg-bulk-sale-page/issues/9"
    - "https://github.com/wico216/mtg-bulk-sale-page/issues/10"
    - "https://github.com/wico216/mtg-bulk-sale-page/issues/11"
    - "https://github.com/wico216/mtg-bulk-sale-page/issues/12"
---

# Quick Task 260514-afo: GitHub issues #8-#12 storefront search and card modal improvements

## Intake

- #8: add card type filter options to the menu, including land and creature.
- #9: when a customer opens a card already added to cart, show both close and go-to-cart actions.
- #10: add a Scryfall link on the card modal so customers can explore the card.
- #11: support useful Scryfall-style search syntax such as `t:goblin`, `cmc`, and `id`.
- #12: make the desktop search bar wider for long searches.

## Plan

### Task 1: Storefront search/filter model

files:
- `src/lib/types.ts`
- `src/db/schema.ts`
- `src/db/queries.ts`
- `src/db/seed.ts`
- `src/lib/csv-parser.ts`
- `src/lib/enrichment.ts`
- `src/lib/store/filter-store.ts`

action:
- Add nullable `typeLine` and `manaValue` fields to card data sourced from Scryfall.
- Return those fields through public aggregated storefront rows without adding binder provenance.
- Extend filter-store search to support plain text plus a practical subset of Scryfall syntax: `t:`/`type:`, `o:`/`oracle:`, `n:`/`name:`, `set:`/`s:`, `r:`/`rarity:`, `f:`/`finish:`, `id:`/`c:`/`color:`, and `cmc:`/`mv:`/`mana:` with numeric comparisons.
- Add card type filter state and clear/reset behavior.

verify:
- Unit tests cover Scryfall-style tokens, card type filtering, and reset behavior.
- TypeScript accepts the added metadata fields.

done:
- Search can narrow by type, oracle text, color identity, rarity, finish, set, and mana value.
- Menu card type filters participate in active-filter state and grid memoization.

### Task 2: Storefront UI changes

files:
- `src/components/filter-rail.tsx`
- `src/components/sort-bar.tsx`
- `src/components/card-grid.tsx`
- `src/components/card-modal.tsx`

action:
- Add a Card Type section to the filter rail using existing checkbox styling.
- Make the search box wider on desktop while keeping mobile wrapping behavior.
- Add a Scryfall external link to the card modal.
- When the selected card is in cart, show quantity controls plus Close and Go to cart actions.

verify:
- Component tests assert card type menu behavior and modal actions/links.
- Existing set-search behavior remains intact.

done:
- Customer can filter by card type, use longer search syntax, leave the modal, or go directly to cart.

### Task 3: Migration, GSD docs, and verification

files:
- `scripts/migrate-v1.3.x-card-search-metadata.ts`
- `package.json`
- `.planning/STATE.md`
- `.planning/quick/260514-afo-github-issues-8-12-storefront-search-and/260514-afo-SUMMARY.md`
- `.planning/quick/260514-afo-github-issues-8-12-storefront-search-and/260514-afo-VERIFICATION.md`

action:
- Add an idempotent migration/backfill script for `cards.type_line` and `cards.mana_value`.
- Add npm scripts for dry-run and live migration.
- Run focused tests, TypeScript, lint, and build if the environment allows.
- Commit source changes atomically, then commit GSD artifacts.

verify:
- Migration dry-run is available and does not mutate.
- Verification artifact checks must-haves against the final diff.

done:
- Code is committed with GSD artifacts and production migration instructions are explicit before push/deploy.
