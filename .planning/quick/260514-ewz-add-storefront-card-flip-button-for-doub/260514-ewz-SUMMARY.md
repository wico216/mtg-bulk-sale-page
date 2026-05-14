---
quick_id: 260514-ewz
description: Add storefront card flip button for double-faced cards
status: complete
date: 2026-05-14
code_commit: a207739
migration_status: complete
---

# Quick Task 260514-ewz Summary

## Result

Implemented in code commit `a207739`:

- Added nullable `cards.back_image_url` support across schema, seed mapping, storefront aggregation, and public card types.
- Enrichment now stores Scryfall `card_faces[1].image_uris.normal` as the reverse-face image for double-faced cards.
- Added `npm run migrate:card-faces` and `npm run migrate:card-faces:dry-run`.
- Card modal now shows a front/back flip button when `backImageUrl` exists.
- Lightbox opens the currently visible side, not always the front image.

## Database Migration

Migration was applied against the configured database:

- Dry-run: would add `cards.back_image_url`; cards rows `1384 -> 1384`.
- Live run: added the column, scanned 30 candidate rows, updated 18 rows with second-face image URLs, preserved cards rows `1384 -> 1384`.
- Remaining 12 candidates did not expose a second-face image from Scryfall and will render without a flip button.

## Verification

- `npx vitest run src/components/__tests__/card-modal.test.tsx src/lib/__tests__/enrichment-progress.test.ts src/db/__tests__/schema.test.ts src/db/__tests__/queries.test.ts src/db/__tests__/queries-aggregated.test.ts src/db/__tests__/seed.test.ts` — 78 passed.
- `npm test` — 491 passed, 2 skipped.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- Scoped `npx eslint ...changed production files and focused tests...` — passed.
- `npm run build` — passed after allowing network for Google Fonts; retained pre-existing Turbopack warnings for dynamic Scryfall cache file patterns.
