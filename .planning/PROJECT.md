# Viki — MTG Bulk Store

## What This Is

A simple online store for selling Magic: The Gathering bulk cards to friends. Friends browse the inventory, search/filter cards, add them to a cart, and submit an order — no online payment needed. Orders are emailed to both the seller and buyer, and payment happens in person. The seller manages inventory through an admin panel with live editing, CSV import/export, and order tracking.

## Core Value

Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## Current Milestone: v1.2 Store Operations & Hardening

**Goal:** Help the seller operate the live store after checkout, preserve a clear history of high-impact changes, and harden production before wider sharing.

**Target features:**
- Admin order workflow with status updates, search/filter, notes, and cancellation
- Audit log for high-impact admin mutations
- Import history for full-replace CSV commits
- Admin-visible audit/history page
- Production-compatible rate limits and operational logs
- Health checks, repeatable production smoke, runbook docs, and security review

## Requirements

### Validated

- [x] CSV import from Manabox app to populate inventory — Validated in Phase 1: Data Pipeline
- [x] Card display with auto-fetched images (Scryfall), price, condition, quantity — Validated in Phase 2: Card Catalog
- [x] Search cards by name — Validated in Phase 3: Search and Filters
- [x] Filter cards by mana color — Validated in Phase 3: Search and Filters
- [x] Shopping cart to collect desired cards — Validated in Phase 4: Shopping Cart
- [x] Checkout sends order email to seller — Validated in Phase 5: Checkout and Deploy
- [x] Checkout sends confirmation email to buyer — Validated in Phase 5: Checkout and Deploy
- [x] Confirmation page shown after checkout — Validated in Phase 5: Checkout and Deploy
- [x] Friend provides name/email at checkout (no account needed) — Validated in Phase 5: Checkout and Deploy
- [x] Auto-decrement stock on checkout — Validated in Phase 11 Plan 01 with concurrent checkout proof
- [x] Checkout stores order records in the database — Validated in Phase 11 Plan 01
- [x] Admin can view order history and order details — Validated in Phase 11 Plan 02 browser proof
- [x] Admin can import one or more Manabox CSV files as a full inventory replacement — Validated locally in Phase 10/10.1
- [x] Admin can delete the full inventory with explicit confirmation — Validated locally in Phase 10.1
- [x] Admin can update order status, private notes, and cancellation state — Validated in Phase 13
- [x] High-impact admin mutations create durable audit log entries — Validated locally in Phase 14
- [x] Import commits create durable import history — Validated locally in Phase 14
- [x] Admin can view audit and import history from `/admin/audit` — Validated locally in Phase 14
- [x] Production hardening: rate limits, structured logs, health checks, repeatable smoke, runbook, and security review — Validated in Phase 15 (3 live-deploy UAT items pending in `15-HUMAN-UAT.md`)

### Active

- [x] Admin panel with Google OAuth authentication — Validated in Phase 8: Authentication

### Out of Scope

- Payment processing — friends pay in person
- Multiple admin accounts — single admin (seller), public storefront. Google OAuth chosen for future buyer order tracking.
- Real-time collaborative editing — single admin user
- Card grading beyond standard conditions (NM/LP/MP/HP/DMG)
- Mobile app — web-only

## Context

- Inventory sourced from Manabox app CSV exports
- Card images and metadata available via Scryfall API (free, no auth required)
- Target audience is a small friend group, so scale is not a concern
- No payment gateway needed — all transactions settled in person
- Public storefront (no password) — admin panel is Google OAuth protected
- v1.0 shipped: browse, search, filter, cart, email checkout — all static/build-time
- v1.1 shipped: live database-backed storefront/admin inventory, multi-CSV import, bulk operations, dashboard, transactional checkout, and admin order history
- v1.2 in progress: order workflow, audit trail, and production hardening complete in code (Phase 15); deployed to Vercel for live human verification

## Constraints

- **Budget**: Free or minimal hosting costs preferred (Vercel free tier for Postgres + hosting)
- **Complexity**: Keep it simple — this is a personal tool, not a business platform
- **Data source**: Must work with Manabox CSV export format
- **Auth**: Google OAuth for admin only — storefront stays public (Google chosen so friends can reuse accounts for future order tracking)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No payment processing | Friends pay in person, avoids payment gateway complexity | ✓ Good |
| No user accounts for buyers | Small friend circle, unnecessary friction | ✓ Good |
| Manabox CSV as data source | Already using Manabox to catalog collection | ✓ Good |
| Scryfall API for card images | Free, comprehensive, no auth required | ✓ Good |
| Public storefront access | No need to gate access for a friend store | ✓ Good |
| Vercel Postgres | Free tier, same platform as hosting, managed | — Pending |
| Google OAuth for admin | Friends already have Google accounts — enables future buyer order tracking | ✓ Good |
| Username/password admin fallback | Google OAuth can reject local automation/browser contexts; credentials provider is enabled only outside production while ADMIN_EMAIL remains the authorization gate | ✓ Good |
| Auto-decrement on checkout | Keeps inventory accurate without manual work | — Pending |
| CSV import replaces inventory | Simple mental model — Manabox export is source of truth | ✓ Good |
| Multi-CSV import still full-replaces inventory | Multiple Manabox exports are merged into one preview batch before replacing DB rows; no incremental merge semantics | ✓ Good |
| Checkout database commit is source of truth | Phase 11 treats the atomic stock decrement + order insert as the placed order; notification emails are post-commit side effects so email failure does not erase persisted inventory/order state | ✓ Good |
| Audit metadata is safe and bounded | Phase 14 records operational context without secrets, raw CSV bodies, or unbounded payloads | ✓ Good |
| Import history is first-class | Full-replace CSV commits create dedicated import-history rows in addition to audit entries | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-10 after Phase 15 completion + Vercel deploy*
