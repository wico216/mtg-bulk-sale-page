---
quick_id: 260514-fz0
description: Move storefront price filter to the bottom
status: complete
date: 2026-05-14
code_commit: e4e75f6
---

# Quick Task 260514-fz0 Summary

## Result

Implemented in code commit `e4e75f6`:

- Moved the storefront `Price` filter section below `Set`, making it the last filter option.
- Preserved the existing price range slider behavior.
- Added focused filter rail coverage to assert `Price` renders after the other filter section headers.

## Verification

- `npx vitest run src/components/__tests__/filter-rail.test.tsx` - 5 passed.
- `npx tsc --noEmit` - passed.
- `npx eslint src/components/filter-rail.tsx src/components/__tests__/filter-rail.test.tsx` - passed.
- `git diff --check` - passed.
- `npm test` - 495 passed, 2 skipped.
- `npm run build` - passed; retained pre-existing Turbopack warnings for dynamic Scryfall cache file patterns.
