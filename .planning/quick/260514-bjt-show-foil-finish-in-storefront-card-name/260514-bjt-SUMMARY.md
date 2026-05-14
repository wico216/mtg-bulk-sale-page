---
quick_id: 260514-bjt
description: Show foil finish in storefront card names
status: complete
date: 2026-05-14
code_commit: 1f7f711
---

# Quick Task 260514-bjt Summary

## Result

Implemented in code commit `1f7f711`:

- Storefront card tile visible names now append finish text for non-normal cards.
- Foil cards render as `Card Name - Foil`.
- Etched cards render as `Card Name - Etched`, matching the app's existing first-class etched finish support.
- Existing image finish pills remain unchanged.

## Verification

- `npx vitest run src/components/__tests__/card-tile.test.tsx` — 2 passed.
- `npm test` — 488 passed, 2 skipped.
- `npx tsc --noEmit` — passed.
- `npx eslint src/components/card-tile.tsx src/components/__tests__/card-tile.test.tsx` — passed.
- `npm run build` — passed; retained pre-existing Scryfall cache dynamic-file warnings.
