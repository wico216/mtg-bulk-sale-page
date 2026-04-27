---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Store Operations & Hardening
status: planning
stopped_at: Phase 13-15 planning drafted; no implementation started
last_updated: "2026-04-27T00:00:00.000Z"
last_activity: 2026-04-27
progress:
  total_phases: 15
  completed_phases: 12
  total_plans: 34
  completed_plans: 28
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Friends can easily find and order cards from the bulk collection without friction.
**Current focus:** Plan the next operational phases after Phase 12 shipped: order workflow, audit trail, and production hardening.

## Current Position

Phase: 13 (admin-order-workflow) — PLANNED
Plan: 0 of 2 — NOT STARTED
Status: Phase 13/14/15 planning artifacts are drafted. No implementation branch or code changes have started for these phases.
Last activity: 2026-04-27

## Recently Completed

- Phase 11 was merged into `main` and deployed: transactional checkout, stock-safe order persistence, admin order list/detail.
- Phase 12 was merged into `main` and deployed: inventory dashboard stats, breakdowns, selected-row bulk delete.
- Full local browser/DB system test passed after Phase 12 merge:
  - storefront add-to-cart and checkout
  - persisted order and order item
  - admin order list/detail
  - inventory stock decrement
  - dashboard refresh
  - selected-row bulk delete
  - cleanup back to empty sentinel state
- Production smoke passed on the Phase 12 production deployment:
  - app shell loads
  - Google admin sign-in visible
  - local password login hidden in production
  - unauthenticated `/admin` redirects
  - unauthenticated bulk-delete API returns 401

## Planned Next Phases

### Phase 13: Admin Order Workflow

Goal: The seller can process orders end-to-end after checkout.

Plans:
- 13-01: Order search/filter, status updates, and internal notes
- 13-02: Cancel order workflow with optional inventory restore

Key rule: cancellation preserves order history. Inventory restore is explicit and only increments existing card rows by order item `cardId`; missing inventory rows are reported, not recreated from partial snapshots.

### Phase 14: Inventory Audit Trail

Goal: High-impact admin changes leave a durable, admin-visible history.

Plans:
- 14-01: Audit schema/helper and mutation coverage
- 14-02: Import history and admin audit/history page

Key rule: audit metadata must be safe and bounded. Do not store secrets, raw CSV bodies, or unbounded card payloads.

### Phase 15: Production Hardening

Goal: The store has production guardrails, diagnostics, and repeatable verification before wider sharing.

Plans:
- 15-01: Rate limits and structured operational logs
- 15-02: Health page, production smoke script, runbook docs, and security review

Key rule: production smoke defaults to read-only/guard-focused checks unless a future command explicitly enables authenticated mutation.

## Blockers/Concerns

- Phase 13 requires a safe database schema update for order workflow changes, especially adding a `cancelled` status if the existing PostgreSQL enum remains in use.
- Phase 14 should avoid noisy or fragile audit logging. Prefer centralized helper-level integration where practical.
- Phase 15 rate limiting must be production-compatible with Vercel/serverless; in-memory counters are not sufficient for production correctness.

## Session Continuity

Working tree should remain on `main`. Planning-only changes are expected under `.planning/` until the user approves execution for Phase 13.
