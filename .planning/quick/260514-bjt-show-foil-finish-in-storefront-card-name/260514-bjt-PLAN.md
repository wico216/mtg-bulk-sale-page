---
quick_id: 260514-bjt
description: Show foil finish in storefront card names
status: planned
mode: quick-inline
date: 2026-05-14
must_haves:
  truths:
    - "Storefront card tiles should show the finish in the visible card name for foil cards, e.g. `Card Name - Foil`."
    - "Existing finish badges should remain unchanged."
    - "No database changes are needed; finish is already present on PublicCard."
  artifacts:
    - "src/components/card-tile.tsx"
    - "src/components/__tests__/card-tile.test.tsx"
---

# Quick Task 260514-bjt: Show foil finish in storefront card names

## Plan

### Task 1: Tile display name

files:
- `src/components/card-tile.tsx`

action:
- Add a small helper that returns `card.name` for normal cards and appends ` - Foil` / ` - Etched` for non-normal finishes.
- Use the helper for the visible tile name and the `title` attribute.
- Leave image alt text and existing finish pill behavior unchanged.

verify:
- Component test covers foil suffix and normal no-suffix behavior.

done:
- Storefront tile names make foil status visible even when scanning text.
