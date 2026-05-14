---
quick_id: 260514-fb1
description: Refine double-faced card flip controls on storefront tiles and modal
status: complete
date: 2026-05-14
code_commit: dfddefe
---

# Quick Task 260514-fb1 Summary

## Result

Implemented in code commit `dfddefe`:

- Replaced the modal's floating `Back side` / `Front side` image overlay with a Scryfall-like `Transform` action below the card image.
- Added a compact `Transform` control to double-faced storefront tiles, so customers can inspect the back face before opening the modal.
- Tile transform clicks stop propagation, so they do not open the modal.
- Single-faced cards remain unchanged.

## Scryfall Reference

Checked a current Scryfall double-faced card page. Scryfall renders separate front/back image containers and a card action button labeled `Transform` with a two-arrow icon, rather than a large overlay control on the card art.

## Verification

- `npx vitest run src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-modal.test.tsx` — 7 passed.
- `npm test` — 492 passed, 2 skipped.
- `npx tsc --noEmit` — passed.
- `npx eslint src/components/card-tile.tsx src/components/card-modal.tsx src/components/__tests__/card-tile.test.tsx src/components/__tests__/card-modal.test.tsx` — passed.
- `git diff --check` — passed.
- `npm run build` — passed; retained pre-existing Turbopack warnings for dynamic Scryfall cache file patterns.
