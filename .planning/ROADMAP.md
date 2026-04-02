# Roadmap: Viki -- MTG Bulk Store

## Overview

Viki goes from CSV file to live storefront in 5 phases. First we build the data pipeline that turns a Manabox CSV export into enriched card data via Scryfall. Then we render that data as a browsable card catalog, followed by search and filtering capabilities. Next comes the shopping cart, and finally checkout with email-based ordering. Each phase delivers a complete, verifiable capability that builds on the previous one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Pipeline** - CSV import, Scryfall enrichment, and card data model (completed 2026-04-02)
- [ ] **Phase 2: Card Catalog** - Browsable card grid with detail view and mobile layout
- [ ] **Phase 3: Search and Filters** - Find cards by name, color, set, rarity, and sort order
- [ ] **Phase 4: Shopping Cart** - Add, adjust, remove cards with persistent totals
- [ ] **Phase 5: Checkout and Deploy** - Order form, email notifications, confirmation, and production deployment

## Phase Details

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
- [ ] 01-01-PLAN.md — Next.js scaffolding, card data model types, and CSV parsing with PapaParse
- [ ] 01-02-PLAN.md — Scryfall API client with caching, rate limiting, and card enrichment pipeline
- [ ] 01-03-PLAN.md — Build-time data generation script and Next.js integration

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
- [ ] 02-01: Data model extension (oracleText), next/image config, accent theme colors
- [ ] 02-02: Card grid with header, image-dominant tiles, responsive layout
- [ ] 02-03: Card detail modal with oracle text, metadata, and mobile full-screen

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
- [ ] 03-01: Zustand filter store, card-grid integration, sticky filter bar with search input
- [ ] 03-02: Mana color pills (WUBRG+C), set/rarity multi-select dropdowns, sort dropdown
- [ ] 03-03: Mobile bottom sheet for filter controls and responsive verification

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
**Plans**: TBD

Plans:
- [ ] 04-01: Cart state management with Zustand and localStorage persistence
- [ ] 04-02: Add-to-cart integration on catalog cards
- [ ] 04-03: Cart view with quantity controls, remove, and running totals

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
**Plans**: TBD

Plans:
- [ ] 05-01: Checkout form with name/email and order review summary
- [ ] 05-02: Email sending via Resend (seller notification + buyer confirmation)
- [ ] 05-03: Confirmation page with pay-in-person messaging
- [ ] 05-04: Vercel deployment and production configuration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 0/3 | Complete    | 2026-04-02 |
| 2. Card Catalog | 0/3 | Not started | - |
| 3. Search and Filters | 0/3 | Not started | - |
| 4. Shopping Cart | 0/3 | Not started | - |
| 5. Checkout and Deploy | 0/4 | Not started | - |
