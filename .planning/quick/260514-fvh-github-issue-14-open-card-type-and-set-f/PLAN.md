---
quick_id: 260514-fvh
slug: github-issue-14-open-card-type-and-set-f
description: GitHub issue 14 open card type and set filters by default
status: complete
created: 2026-05-14
github_issue: 14
---

# GitHub Issue 14 Open Card Type And Set Filters By Default

## Issue

GitHub issue #14: all storefront filter dropdowns are open by default except `Card Type` and `Set`.

## Scope

- Open the `Card Type` filter section by default.
- Open the `Set` filter section by default.
- Preserve the existing section toggle behavior after initial render.
- Update focused filter rail tests for the new default state.

## Verification

- Focused filter rail tests.
- TypeScript, scoped lint, full tests, production build.
- Push and confirm Vercel deployment plus production smoke.

## Result

Completed in code commit `c771512`.
