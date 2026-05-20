---
status: partial
phase: 23-import-ux-price-refresh
source: [23-VERIFICATION.md]
started: 2026-05-20T21:18:28Z
updated: 2026-05-20T21:18:28Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Refresh now button updates Last Price Refresh tile
expected: Tile shows current timestamp after successful POST to /api/admin/prices/refresh; router.refresh() causes re-render without full page reload
result: [pending]

### 2. /admin/health surfaces missing CRON_SECRET
expected: With CRON_SECRET unset in Vercel env, top-level banner shows "Attention required"; Cron secret row shows "Missing" badge with openssl hint; JSON reports `ok: false` and `cronSecret: "missing"`
result: [pending]

### 3. Multi-binder CSV import opens picker unchecked
expected: Drop a real multi-binder Manabox CSV. Every binder checkbox starts unchecked. One Select all click transitions counter to "N of N". Continue button activates. Will-delete amber panel still default-checks missing prior binders.
result: [pending]

### 4. Keyboard-only walkthrough of import picker
expected: Tab from file summary → Select all → Deselect all → first checkbox → Continue. Focus progresses through those exact elements in order. No role="button" shims intercept focus. Select all and Deselect all are focusable with Enter activation. Screen reader announces aria-describedby helper text on disabled Continue.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
