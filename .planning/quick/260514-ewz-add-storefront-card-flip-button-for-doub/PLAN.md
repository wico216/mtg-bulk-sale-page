---
quick_id: 260514-ewz
slug: add-storefront-card-flip-button-for-doub
description: Add storefront card flip button for double-faced cards
status: complete
created: 2026-05-14
---

# Add Storefront Card Flip Button For Double-Faced Cards

## Goal

Customers can view both sides of double-faced cards from the storefront card modal, then flip back to the front face.

## Scope

- Persist a nullable `cards.back_image_url` value from Scryfall card faces.
- Backfill existing production inventory rows with second-face image URLs where available.
- Surface `backImageUrl` on public card query results.
- Add a modal flip control that toggles front/back images and passes the active image to the lightbox.
- Cover data mapping, enrichment, and modal behavior with focused tests.

## Verification

- Run focused tests for modal, enrichment, schema, seed, and query mapping.
- Run `npx tsc --noEmit`, full `npm test`, `npm run build`, and production smoke after deploy.
- Run dry-run and live card-face migration before deploying app code that reads `back_image_url`.
