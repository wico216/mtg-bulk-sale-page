---
status: partial
phase: 18-allocator
source: [.planning/phases/18-allocator/18-01-SUMMARY.md, .planning/phases/18-allocator/18-VERIFICATION.md]
started: 2026-05-14T06:30:11-04:00
updated: 2026-05-14T06:31:56-04:00
---

# Phase 18 — UAT

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing paused - 4 items outstanding]

## Tests

### 1. D-07 real-Postgres concurrent-proof
expected: Provision a non-production TEST_DATABASE_URL, apply the v1.3 schema to that test database, then run src/db/__tests__/orders.concurrent.test.ts once and five times in a row. Each run should execute the two D-07 variants instead of skipping them, both variants should pass, and the five-run flake check should finish with zero failures.
result: [pending]

### 2. Multi-binder happy-path checkout
expected: A buyer can submit a checkout for a card whose requested quantity must split across multiple binders. Checkout succeeds, the buyer reaches confirmation, seller notification is sent, and order_items contains one row per binder source with correct binder snapshots.
result: [pending]

### 3. Stock conflict UX preservation
expected: A buyer who submits quantity greater than total available across all binders sees the existing stock-conflict message, receives no order, and keeps cart and checkout form state intact.
result: [pending]

### 4. Binder source count logging
expected: A successful checkout emits checkout.order_committed metadata with binderSourceCount set to the number of binder sources used, without logging individual binder names.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

[none yet]
