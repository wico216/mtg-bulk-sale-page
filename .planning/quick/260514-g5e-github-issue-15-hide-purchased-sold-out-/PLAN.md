---
quick_id: 260514-g5e
slug: github-issue-15-hide-purchased-sold-out-
description: GitHub issue 15 hide purchased sold-out cards
status: complete
created: 2026-05-14
github_issue: 15
---

# GitHub Issue 15 Hide Purchased Sold-Out Cards

## Issue

GitHub issue #15: after purchase, the card still appears as available in the shop.

## Findings

- Checkout already decrements `cards.quantity` in the allocator SQL.
- The storefront aggregation query still returns groups where `SUM(quantity) = 0`.
- After checkout, the storefront route should be invalidated so the next visit reads fresh inventory.

## Scope

- Exclude zero-stock aggregated card groups from the public storefront/cart/checkout card query.
- Revalidate the storefront route after successful checkout.
- Add focused tests for the sold-out query guard and checkout route revalidation.

## Verification

- Focused query and checkout route tests.
- TypeScript, scoped lint, full tests, production build.
- Push and confirm Vercel deployment plus production smoke.

## Result

Completed in code commit `d41bc6f`.
