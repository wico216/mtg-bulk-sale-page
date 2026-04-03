# Viki — MTG Bulk Store

## What This Is

A simple online store for selling Magic: The Gathering bulk cards to friends. Friends browse the inventory, search/filter cards, add them to a cart, and submit an order — no online payment needed. Orders are emailed to both the seller and buyer, and payment happens in person.

## Core Value

Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## Requirements

### Validated

- [x] CSV import from Manabox app to populate inventory — Validated in Phase 1: Data Pipeline
- [x] Card display with auto-fetched images (Scryfall), price, condition, quantity — Validated in Phase 2: Card Catalog
- [x] Search cards by name — Validated in Phase 3: Search and Filters
- [x] Filter cards by mana color — Validated in Phase 3: Search and Filters
- [x] Shopping cart to collect desired cards — Validated in Phase 4: Shopping Cart

### Active

- [ ] Checkout sends order email to seller (you)
- [ ] Checkout sends confirmation email to buyer (friend)
- [ ] Confirmation page shown to friend after checkout
- [ ] Friend provides name/email at checkout (no account needed)

### Out of Scope

- Payment processing — friends pay in person
- User accounts/authentication — not needed for friend circle
- Admin dashboard — CSV upload is sufficient for inventory management
- Real-time inventory sync — manual CSV re-upload when stock changes
- Card grading beyond standard conditions (NM/LP/MP/HP/DMG)

## Context

- Inventory sourced from Manabox app CSV exports
- Card images and metadata available via Scryfall API (free, no auth required)
- Target audience is a small friend group, so scale is not a concern
- No payment gateway needed — all transactions settled in person
- Public access (no password) — anyone with the link can browse and order

## Constraints

- **Budget**: Free or minimal hosting costs preferred
- **Complexity**: Keep it simple — this is a personal tool, not a business platform
- **Data source**: Must work with Manabox CSV export format

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No payment processing | Friends pay in person, avoids payment gateway complexity | — Pending |
| No user accounts | Small friend circle, unnecessary friction | — Pending |
| Manabox CSV as data source | Already using Manabox to catalog collection | — Pending |
| Scryfall API for card images | Free, comprehensive, no auth required | — Pending |
| Public access | No need to gate access for a friend store | — Pending |

---
*Last updated: 2026-04-02 after Phase 4 completion — cart fully verified*
