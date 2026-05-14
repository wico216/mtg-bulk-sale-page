---
quick_id: 260514-fib
slug: github-issue-13-page-refresh-behavior
description: GitHub issue 13 page refresh behavior
status: complete
created: 2026-05-14
github_issue: 13
---

# GitHub Issue 13 Page Refresh Behavior

## Issue

GitHub issue #13: the storefront logo looks clickable, but clicking it while already on the storefront appears to do nothing. Expected behavior: clicking the logo should refresh the page.

## Scope

- Keep the logo as a `/` link for normal navigation from other pages.
- When already on `/`, intercept the same-route click and perform a browser reload.
- Add focused header test coverage for the same-route reload behavior.

## Verification

- Focused header tests.
- TypeScript, scoped lint, full tests, production build.
- Push and confirm Vercel deployment plus production smoke.

## Result

Completed in code commit `25f63a2`.
