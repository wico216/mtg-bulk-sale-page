# Viki — MTG Bulk Store

## What This Is

A simple online store for selling Magic: The Gathering bulk cards to friends. Friends browse the inventory, search/filter cards, add them to a cart, and submit an order — no online payment needed. Orders are emailed to both the seller and buyer, and payment happens in person. The seller manages inventory through an admin panel with live editing, CSV import/export, and order tracking.

## Core Value

Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## Current State

**Last shipped:** v1.2 Store Operations & Hardening (2026-05-11). Live at `wikos-spellbinder.vercel.app` with rate limits, structured logs, audit trail, and admin order workflow.

**Next milestone:** TBD — start with `/gsd:new-milestone`.

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
- [x] Production hardening: rate limits, structured logs, health checks, repeatable smoke, runbook, and security review — Validated in Phase 15 + 15-HUMAN-UAT.md (3/3 passed against `wikos-spellbinder.vercel.app`)
- [x] Admin panel with Google OAuth authentication — Validated in Phase 8: Authentication

### Active

(None — define next milestone with `/gsd:new-milestone`)

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
- v1.0 shipped 2026-04-11: browse, search, filter, cart, email checkout — all static/build-time
- v1.1 shipped 2026-04-27: live database-backed storefront/admin inventory, multi-CSV import, bulk operations, dashboard, transactional checkout, and admin order history
- v1.2 shipped 2026-05-11: admin order workflow (status/search/filter/notes/cancellation), inventory audit trail (`admin_audit_log` + `import_history` + `/admin/audit`), production hardening (rate limits + structured logs + `/admin/health` + smoke script + STRIDE review). Live and human-verified on `wikos-spellbinder.vercel.app`.
- Codebase: ~19,661 LOC TypeScript across 38 files touched in v1.2 (+5,423 / −130). 28 test files, 272 tests passing.

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
| Sliding-window rate limit, not token bucket | Phase 15 — correct on serverless without distributed clock sync; "blocked attempts don't extend the window" is trivial to enforce | ✓ Good |
| Postgres-backed rate-limit store, no new vendor | Phase 15 — reuses existing Neon connection; satisfies budget constraint; verified shared cross-instance via UAT #3 | ✓ Good |
| Rate-limit BEFORE body parse on /api/checkout | Phase 15 — abuse cannot starve real users via JSON-parse cost | ✓ Good |
| Rate-limit AFTER requireAdmin() on admin routes | Phase 15 — auth bugs are not hidden behind 429; unauth always sees 401 | ✓ Good |
| Health endpoint exposes literals only ("configured"/"missing"), never env values | Phase 15 — STATUS_LABELS lookup is the only path from env-state to UI text; pinning test enforces this | ✓ Good |
| `notificationFailuresLast24h` reserved as `null` | Phase 15 — keeps API contract stable so a future log-drain phase can flip null → number without breaking consumers | ⚠️ Revisit when log drain lands |
| STRIDE security review documented in-repo with named follow-up owners | Phase 15 — 0 High-severity; 4 deferred Medium with remediation steps | ✓ Good |

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
*Last updated: 2026-05-11 after v1.2 milestone completion*
