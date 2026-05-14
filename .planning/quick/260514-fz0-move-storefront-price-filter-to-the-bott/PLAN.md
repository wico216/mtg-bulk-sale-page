---
quick_id: 260514-fz0
slug: move-storefront-price-filter-to-the-bott
description: Move storefront price filter to the bottom
status: complete
created: 2026-05-14
---

# Move Storefront Price Filter To The Bottom

## Request

Move the storefront `Price` filter section to the bottom so it is the last filter option.

## Scope

- Reorder the storefront filter rail sections so `Price` renders after `Set`.
- Preserve the existing `Price` slider behavior.
- Add focused test coverage for the filter section order.

## Verification

- Focused filter rail tests.
- TypeScript, scoped lint, full tests, production build.
- Push and confirm Vercel deployment plus production smoke.

## Result

Completed in code commit `e4e75f6`.
