---
quick_id: 260514-fb1
slug: refine-double-faced-card-flip-controls-o
description: Refine double-faced card flip controls on storefront tiles and modal
status: complete
created: 2026-05-14
---

# Refine Double-Faced Card Flip Controls

## Goal

Make double-faced card flipping feel closer to Scryfall and let customers inspect the back face from the storefront grid before opening the card modal.

## Findings

Scryfall renders double-faced card pages with separate `card-image-front` / `card-image-back` containers and a side action button with a two-arrow icon labeled `Transform`, rather than a large overlay button on the image.

## Scope

- Replace the modal overlay `Back side` / `Front side` button with a Scryfall-like `Transform` action below the card image.
- Add a compact transform control on double-faced storefront tiles.
- Ensure the tile transform button toggles the tile image without opening the modal.
- Keep single-faced cards unchanged.

## Verification

- Focused component tests for tile and modal flipping.
- TypeScript, full test suite, production build, deploy, and live smoke.
