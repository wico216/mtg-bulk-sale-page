# Roadmap: Viki -- MTG Bulk Store

## Milestones

- v1.0 MVP - Phases 1-5 (shipped 2026-04-11)
- v1.1 Admin Panel & Inventory Management - Phases 6-12 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-04-11</summary>

- [x] **Phase 1: Data Pipeline** - CSV import, Scryfall enrichment, and card data model (completed 2026-04-02)
- [x] **Phase 2: Card Catalog** - Browsable card grid with detail view and mobile layout
- [x] **Phase 3: Search and Filters** - Find cards by name, color, set, rarity, and sort order
- [x] **Phase 4: Shopping Cart** - Add, adjust, remove cards with persistent totals
- [x] **Phase 5: Checkout and Deploy** - Order form, email notifications, confirmation, and production deployment

### Phase 1: Data Pipeline
**Goal**: A Manabox CSV export is transformed into structured, enriched card data ready for the frontend
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04
**Success Criteria** (what must be TRUE):
  1. A Manabox CSV file can be parsed and its cards extracted with correct field mapping
  2. Each card is enriched with a Scryfall image URL matched by set code and collector number
  3. Each card is enriched with a TCGPlayer market price from Scryfall
  4. The resulting card data includes all model fields: name, set, collector number, price, condition, quantity, color identity, image URL, and rarity
  5. The Next.js project builds successfully and serves a page using the generated card data
**Plans**: 3 plans

Plans:
- [x] 01-01: Next.js scaffolding, card data model types, and CSV parsing with PapaParse
- [x] 01-02: Scryfall API client with caching, rate limiting, and card enrichment pipeline
- [x] 01-03: Build-time data generation script and Next.js integration

### Phase 2: Card Catalog
**Goal**: Users can browse the full card inventory in a visual grid and inspect individual cards
**Depends on**: Phase 1
**Requirements**: CATL-01, CATL-07, CATL-08
**Success Criteria** (what must be TRUE):
  1. User sees a responsive grid of cards showing image, name, set, price, condition, and quantity
  2. User can tap or click any card to open a detail modal with oracle text and full metadata
  3. The catalog layout works on phone screens without horizontal scrolling or broken elements
**Plans**: 3 plans

Plans:
- [x] 02-01: Data model extension (oracleText), next/image config, accent theme colors
- [x] 02-02: Card grid with header, image-dominant tiles, responsive layout
- [x] 02-03: Card detail modal with oracle text, metadata, and mobile full-screen

### Phase 3: Search and Filters
**Goal**: Users can quickly find specific cards using search, filters, and sorting
**Depends on**: Phase 2
**Requirements**: CATL-02, CATL-03, CATL-04, CATL-05, CATL-06
**Success Criteria** (what must be TRUE):
  1. User can type a card name and see the catalog filter in real time as they type
  2. User can select one or more mana colors (WUBRG) and see only cards matching those colors
  3. User can filter by set/expansion and by rarity independently or in combination
  4. User can sort the visible cards by price (low-high, high-low) and by name (A-Z)
  5. All filters and sort work together without conflicts or clearing each other
**Plans**: 3 plans

Plans:
- [x] 03-01: Zustand filter store, card-grid integration, sticky filter bar with search input
- [x] 03-02: Mana color pills (WUBRG+C), set/rarity multi-select dropdowns, sort dropdown
- [x] 03-03: Mobile bottom sheet for filter controls and responsive verification

### Phase 4: Shopping Cart
**Goal**: Users can collect desired cards into a persistent cart and manage their selections
**Depends on**: Phase 2
**Requirements**: CART-01, CART-02, CART-03, CART-04, CART-05
**Success Criteria** (what must be TRUE):
  1. User can add a card to the cart from the catalog view
  2. User can increase or decrease the quantity of any cart item (capped at available stock)
  3. User can remove an item from the cart entirely
  4. Cart contents survive a full page refresh (localStorage persistence)
  5. Cart displays a running total showing number of items and total price
**Plans**: 3 plans

Plans:
- [x] 04-01: Cart state management with Zustand and localStorage persistence
- [x] 04-02: Add-to-cart integration on catalog cards
- [x] 04-03: Cart view with quantity controls, remove, and running totals

### Phase 5: Checkout and Deploy
**Goal**: Users can submit orders via email and the store is live on the internet
**Depends on**: Phase 4
**Requirements**: CHKT-01, CHKT-02, CHKT-03, CHKT-04, CHKT-05
**Success Criteria** (what must be TRUE):
  1. User can enter their name and email on the checkout page without creating an account
  2. User sees a full order summary (items, quantities, prices, total) before confirming
  3. After submission, the seller receives an email with complete order details
  4. After submission, the buyer receives a confirmation email with their order summary
  5. User sees a confirmation page after checkout with a clear "pay in person" note
**Plans**: 3 plans

Plans:
- [x] 05-01: Order types, email templates, notification pipeline, and POST /api/checkout Route Handler
- [x] 05-02: Checkout page (form + order summary) and confirmation page with pay-in-person note
- [x] 05-03: Build verification, environment setup, integration testing, and Vercel deployment

</details>

### v1.1 Admin Panel & Inventory Management (In Progress)

**Milestone Goal:** Replace the static CSV rebuild workflow with a live admin panel for managing inventory, backed by a real database.

**Phase Numbering:**
- Integer phases (6, 7, 8...): Planned milestone work
- Decimal phases (7.1, 7.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 6: Database Foundation** - Neon Postgres schema, Drizzle ORM, and data migration from static JSON
- [ ] **Phase 7: Storefront Migration** - Storefront reads live card data from database instead of static JSON
- [ ] **Phase 8: Authentication** - Admin panel protected by Google OAuth with defense-in-depth access control
- [ ] **Phase 9: Admin Inventory Management** - Searchable card table with inline editing, delete, and CSV export
- [ ] **Phase 10: CSV Import** - Manabox CSV upload with preview, validation, and full-replace import
- [ ] **Phase 11: Checkout Upgrade & Order History** - Transactional stock decrement and admin order tracking
- [ ] **Phase 12: Bulk Operations & Dashboard** - Bulk select/delete, inventory stats, and breakdowns

## Phase Details

### Phase 6: Database Foundation
**Goal**: Card and order data lives in a Neon Postgres database with a typed data access layer
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: DB-01, DB-02
**Success Criteria** (what must be TRUE):
  1. Neon Postgres database is provisioned and accessible from the Next.js app
  2. Cards table schema stores all existing card fields (name, set, collector number, price, condition, quantity, color identity, image URL, rarity, oracle text)
  3. Orders and order_items tables exist with the schema needed for future checkout storage
  4. All existing card inventory from static JSON is seeded into the database with no data loss
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md -- Drizzle ORM schema, Neon HTTP client, config, and schema push to database
- [ ] 06-02-PLAN.md -- Idempotent seed script, vitest test infrastructure, and data migration

### Phase 7: Storefront Migration
**Goal**: Friends browse and shop from live database inventory with zero visible changes to the storefront experience
**Depends on**: Phase 6
**Requirements**: DB-03
**Success Criteria** (what must be TRUE):
  1. The storefront home page loads card data from the database (not static JSON)
  2. All existing storefront features work identically: browse, search, filter, sort, cart, checkout
  3. Card data updates in the database are reflected on the storefront after revalidation (no rebuild needed)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

### Phase 8: Authentication
**Goal**: The admin panel is protected so only the seller can access inventory management
**Depends on**: Phase 7
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Visiting /admin redirects unauthenticated users to a Google OAuth login page
  2. Only the seller's specific Google account can access admin pages after login
  3. API routes under /api/admin reject requests without a valid admin session (returns 401/403)
  4. The public storefront remains fully accessible without any login
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

**UI hint**: yes

### Phase 9: Admin Inventory Management
**Goal**: The seller can view, search, edit, and remove cards through an admin panel
**Depends on**: Phase 8
**Requirements**: INV-01, INV-02, INV-03, INV-05, INV-06, CSV-03
**Success Criteria** (what must be TRUE):
  1. Admin sees all cards in a sortable table with columns for name, set, price, condition, quantity, and actions
  2. Admin can edit a card's price, condition, and quantity directly in the table row and save changes
  3. Admin can delete an individual card from inventory with confirmation
  4. Admin can search cards by name and filter by set or condition within the admin table
  5. Cards with quantity of 1 are visually highlighted as low stock in the table
  6. Admin can export the current inventory as a downloadable CSV file
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD
- [ ] 09-03: TBD

**UI hint**: yes

### Phase 10: CSV Import
**Goal**: The seller can refresh the full inventory by uploading a Manabox CSV export
**Depends on**: Phase 9
**Requirements**: CSV-01, CSV-02
**Success Criteria** (what must be TRUE):
  1. Admin can upload a Manabox CSV file through the admin panel
  2. Before committing, admin sees a preview showing how many cards will be added and how many rows were skipped or invalid
  3. After confirming, the import replaces the full inventory in a single transaction (old cards removed, new cards inserted)
  4. The storefront reflects the new inventory after import completes
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

**UI hint**: yes

### Phase 11: Checkout Upgrade & Order History
**Goal**: Checkout is transactional with stock protection, and the seller can review past orders
**Depends on**: Phase 7 (storefront on DB), Phase 8 (auth for admin order pages)
**Requirements**: DB-04, ORD-01, ORD-02, ORD-03
**Success Criteria** (what must be TRUE):
  1. When a friend checks out, stock decrements atomically -- two simultaneous checkouts for the last copy of a card result in one success and one error, never overselling
  2. Each completed checkout creates an order record in the database with buyer info, line items, totals, and timestamp
  3. Admin can view a table of all past orders showing buyer name, date, and total
  4. Admin can click into any order to see the full list of cards ordered, quantities, and prices
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

**UI hint**: yes

### Phase 12: Bulk Operations & Dashboard
**Goal**: The seller has efficient bulk tools and at-a-glance inventory insights
**Depends on**: Phase 9 (inventory table for bulk ops), Phase 11 (orders for dashboard context)
**Requirements**: INV-04, DASH-01, DASH-02
**Success Criteria** (what must be TRUE):
  1. Admin can select multiple cards using checkboxes and delete them all in one action
  2. Admin dashboard shows inventory stats at a glance: total unique cards, total quantity, and total inventory value
  3. Admin dashboard shows inventory breakdowns by set, color identity, and rarity
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Pipeline | v1.0 | 3/3 | Complete | 2026-04-02 |
| 2. Card Catalog | v1.0 | 3/3 | Complete | 2026-04-06 |
| 3. Search and Filters | v1.0 | 3/3 | Complete | 2026-04-07 |
| 4. Shopping Cart | v1.0 | 3/3 | Complete | 2026-04-08 |
| 5. Checkout and Deploy | v1.0 | 3/3 | Complete | 2026-04-11 |
| 6. Database Foundation | v1.1 | 0/2 | Not started | - |
| 7. Storefront Migration | v1.1 | 0/1 | Not started | - |
| 8. Authentication | v1.1 | 0/1 | Not started | - |
| 9. Admin Inventory Management | v1.1 | 0/3 | Not started | - |
| 10. CSV Import | v1.1 | 0/2 | Not started | - |
| 11. Checkout Upgrade & Order History | v1.1 | 0/2 | Not started | - |
| 12. Bulk Operations & Dashboard | v1.1 | 0/2 | Not started | - |
