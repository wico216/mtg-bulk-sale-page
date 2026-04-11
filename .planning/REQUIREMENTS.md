# Requirements: Viki — MTG Bulk Store

**Defined:** 2026-04-02 (v1.0), updated 2026-04-11 (v1.1)
**Core Value:** Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## v1.0 Requirements (Complete)

### Data Pipeline

- [x] **DATA-01**: CSV import parses Manabox export into structured card inventory
- [x] **DATA-02**: Scryfall API enriches cards with images at build time
- [x] **DATA-03**: Scryfall API enriches cards with TCGPlayer market prices at build time
- [x] **DATA-04**: Card data model includes: name, set, collector number, price, condition, quantity, color identity, image URL, rarity

### Card Catalog

- [x] **CATL-01**: User can browse cards in a responsive grid showing image, name, set, price, condition, and quantity
- [x] **CATL-02**: User can search cards by name with real-time filtering
- [x] **CATL-03**: User can filter cards by mana color (WUBRG multi-select)
- [x] **CATL-04**: User can filter cards by set/expansion
- [x] **CATL-05**: User can filter cards by rarity
- [x] **CATL-06**: User can sort cards by price (low-high, high-low) and by name (A-Z)
- [x] **CATL-07**: User can tap/click a card to see detail modal with oracle text and full metadata
- [x] **CATL-08**: Card catalog is mobile-responsive

### Shopping Cart

- [x] **CART-01**: User can add cards to cart from the catalog
- [x] **CART-02**: User can adjust quantity of items in cart (up to available stock)
- [x] **CART-03**: User can remove items from cart
- [x] **CART-04**: Cart persists across page refreshes (localStorage)
- [x] **CART-05**: Cart displays running total of items and price

### Checkout

- [x] **CHKT-01**: User can enter name and email to place an order (no account required)
- [x] **CHKT-02**: User sees order review/summary before final submission
- [x] **CHKT-03**: Checkout sends order details email to seller
- [x] **CHKT-04**: Checkout sends confirmation email to buyer
- [x] **CHKT-05**: User sees confirmation page after successful order with "pay in person" note

## v1.1 Requirements

Requirements for Admin Panel & Inventory Management milestone. Each maps to roadmap phases.

### Database

- [ ] **DB-01**: Vercel Postgres database with cards and orders schema
- [ ] **DB-02**: Existing card inventory migrated from static JSON to database
- [ ] **DB-03**: Storefront reads card data from database instead of static JSON
- [ ] **DB-04**: Stock auto-decrements atomically when a friend checks out

### Authentication

- [ ] **AUTH-01**: Admin panel protected by Google OAuth (Auth.js v5)
- [ ] **AUTH-02**: Only the seller's Google account has admin access
- [ ] **AUTH-03**: Admin API routes reject unauthenticated requests

### Admin Inventory

- [ ] **INV-01**: Admin can view all cards in a sortable, searchable table
- [ ] **INV-02**: Admin can edit a card's price, condition, and quantity inline
- [ ] **INV-03**: Admin can delete individual cards from inventory
- [ ] **INV-04**: Admin can select multiple cards and delete them in bulk
- [ ] **INV-05**: Admin can search cards by name and filter by set/condition in admin table
- [ ] **INV-06**: Cards with quantity 1 are visually highlighted as low stock

### CSV Operations

- [ ] **CSV-01**: Admin can import a Manabox CSV to replace full inventory
- [ ] **CSV-02**: Import shows a preview (cards to add, rows skipped) before committing
- [ ] **CSV-03**: Admin can export current inventory as CSV

### Orders

- [ ] **ORD-01**: Checkout stores order in database (buyer, items, totals, timestamp)
- [ ] **ORD-02**: Admin can view order history in a table (buyer, date, total)
- [ ] **ORD-03**: Admin can click into an order to see full line items and buyer info

### Dashboard

- [ ] **DASH-01**: Admin sees inventory stats at a glance (total cards, total value, unique count)
- [ ] **DASH-02**: Admin sees inventory breakdown by set, color, and rarity

## Future Requirements

### Buyer Accounts

- **BUYER-01**: Friends can sign in with Google to view their own order history
- **BUYER-02**: Checkout auto-fills name/email from Google profile

### Visual Polish

- **VISP-01**: Visual WUBRG mana icons on filter buttons
- **VISP-02**: Cart count badge in header/nav
- **VISP-03**: Inventory freshness indicator ("Last updated" date)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Payment processing | Friends pay in person — no Stripe/payment complexity |
| Multiple admin accounts | Single admin (seller) is sufficient |
| Real-time price sync from Scryfall | Rate limits, seller sets own prices |
| Incremental/merge CSV import | Merge logic too complex; full replace with Manabox as source of truth |
| Mobile-optimized admin panel | Admin tasks are desktop workflows; storefront is already mobile-responsive |
| Drag-and-drop card reordering | Sort options (name, price, set, qty) are sufficient |
| Undo / version history | CSV export before destructive operations is sufficient |
| Real-time collaborative editing | Single admin user |
| Wishlists / saved items | Cart with localStorage is sufficient |
| Reviews / ratings | Friend store, not a marketplace |
| Multi-seller support | Single seller store |
| Deck builder integration | Separate app, massive scope creep |
| Shipping / logistics | Friends pick up in person |
| Internationalization | Friend circle shares a language |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | — | Pending |
| DB-02 | — | Pending |
| DB-03 | — | Pending |
| DB-04 | — | Pending |
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| INV-01 | — | Pending |
| INV-02 | — | Pending |
| INV-03 | — | Pending |
| INV-04 | — | Pending |
| INV-05 | — | Pending |
| INV-06 | — | Pending |
| CSV-01 | — | Pending |
| CSV-02 | — | Pending |
| CSV-03 | — | Pending |
| ORD-01 | — | Pending |
| ORD-02 | — | Pending |
| ORD-03 | — | Pending |
| DASH-01 | — | Pending |
| DASH-02 | — | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-04-02 (v1.0)*
*Last updated: 2026-04-11 after v1.1 requirements definition*
