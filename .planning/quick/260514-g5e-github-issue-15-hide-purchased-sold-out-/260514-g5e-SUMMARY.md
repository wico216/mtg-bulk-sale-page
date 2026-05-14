---
quick_id: 260514-g5e
description: GitHub issue 15 hide purchased sold-out cards
status: complete
date: 2026-05-14
github_issue: 15
code_commit: d41bc6f
---

# Quick Task 260514-g5e Summary

## Result

Implemented GitHub issue #15 in code commit `d41bc6f`:

- Storefront aggregation now excludes grouped cards whose total stock is zero.
- Successful checkout now revalidates the storefront path so the next shop visit reads fresh inventory.
- Storefront revalidation is best-effort and cannot turn a committed order into a checkout failure.
- Added focused tests for the sold-out query guard and checkout revalidation behavior.

## Verification

- `npx vitest run src/db/__tests__/queries-aggregated.test.ts src/app/api/checkout/__tests__/route.test.ts src/app/api/checkout/__tests__/rate-limit-integration.test.ts` - 41 passed.
- `npx tsc --noEmit` - passed.
- `npx eslint src/db/queries.ts src/db/__tests__/queries-aggregated.test.ts src/app/api/checkout/route.ts src/app/api/checkout/__tests__/route.test.ts src/app/api/checkout/__tests__/rate-limit-integration.test.ts` - passed.
- `git diff --check` - passed.
- `npm test` - 496 passed, 2 skipped.
- `npm run build` - passed; retained pre-existing Turbopack warnings for dynamic Scryfall cache file patterns.
