---
quick_id: 260514-fvh
description: GitHub issue 14 open card type and set filters by default
status: complete
date: 2026-05-14
github_issue: 14
code_commit: c771512
---

# Quick Task 260514-fvh Summary

## Result

Implemented GitHub issue #14 in code commit `c771512`:

- The storefront `Card Type` filter section now opens by default.
- The storefront `Set` filter section now opens by default.
- Both sections still use the shared filter-section toggle behavior after initial render.
- Updated focused filter rail tests to assert the new default-open state.

## Verification

- `npx vitest run src/components/__tests__/filter-rail.test.tsx` - 4 passed.
- `npx tsc --noEmit` - passed.
- `npx eslint src/components/filter-rail.tsx src/components/__tests__/filter-rail.test.tsx` - passed.
- `git diff --check` - passed.
- `npm test` - 494 passed, 2 skipped.
- `npm run build` - passed; retained pre-existing Turbopack warnings for dynamic Scryfall cache file patterns.
