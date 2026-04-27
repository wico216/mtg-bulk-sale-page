# Viki — MTG Bulk Store

## What This Is

A simple online store for selling Magic: The Gathering bulk cards to friends. Friends browse the inventory, search/filter cards, add them to a cart, and submit an order — no online payment needed. Orders are emailed to both the seller and buyer, and payment happens in person. The seller manages inventory through an admin panel with live editing, CSV import/export, and order tracking.

## Core Value

Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## Current Milestone: v1.1 Admin Panel & Inventory Management

**Goal:** Replace the static CSV rebuild workflow with a live admin panel for managing inventory, backed by a real database.

**Target features:**
- Admin panel protected by Google OAuth
- Vercel Postgres database (migrate from static JSON)
- Auto-decrement stock on checkout
- Manually remove/edit cards (price, condition, quantity)
- CSV import (full replace) and CSV export
- Bulk select & delete cards
- Order history
- Inventory stats dashboard

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
- [x] Admin can import one or more Manabox CSV files as a full inventory replacement — Validated locally in Phase 10/10.1
- [x] Admin can delete the full inventory with explicit confirmation — Validated locally in Phase 10.1

### Active

- [x] Admin panel with Google OAuth authentication — Validated in Phase 8: Authentication
- [ ] Vercel Postgres database for live inventory
- [x] Auto-decrement stock on checkout — Validated in Phase 11 Plan 01
- [ ] Edit individual card details (price, condition, quantity)
- [ ] Remove cards from inventory manually
- [x] CSV import (full replace) into database — Validated locally in Phase 10/10.1
- [ ] CSV export of current inventory
- [ ] Bulk select and delete cards
- [ ] Order history dashboard
- [ ] Inventory stats (total cards, value, breakdowns)

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
- v1.1 shifts from static JSON to Vercel Postgres for live inventory management

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
*Last updated: 2026-04-26 after Phase 10.1 local completion and admin credentials fallback*
