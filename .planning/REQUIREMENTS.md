# Requirements: Viki — MTG Bulk Store

**Defined:** 2026-04-02
**Core Value:** Friends can easily find and order cards from your bulk collection without friction

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Pipeline

- [ ] **DATA-01**: CSV import parses Manabox export into structured card inventory
- [ ] **DATA-02**: Scryfall API enriches cards with images at build time (matched by set code + collector number)
- [ ] **DATA-03**: Scryfall API enriches cards with TCGPlayer market prices at build time
- [ ] **DATA-04**: Card data model includes: name, set, collector number, price, condition, quantity, color identity, image URL, rarity

### Card Catalog

- [ ] **CATL-01**: User can browse cards in a responsive grid showing image, name, set, price, condition, and quantity
- [ ] **CATL-02**: User can search cards by name with real-time filtering
- [ ] **CATL-03**: User can filter cards by mana color (WUBRG multi-select)
- [ ] **CATL-04**: User can filter cards by set/expansion
- [ ] **CATL-05**: User can filter cards by rarity
- [ ] **CATL-06**: User can sort cards by price (low-high, high-low) and by name (A-Z)
- [ ] **CATL-07**: User can tap/click a card to see detail modal with oracle text and full metadata
- [ ] **CATL-08**: Card catalog is mobile-responsive (works on phone screens)

### Shopping Cart

- [ ] **CART-01**: User can add cards to cart from the catalog
- [ ] **CART-02**: User can adjust quantity of items in cart (up to available stock)
- [ ] **CART-03**: User can remove items from cart
- [ ] **CART-04**: Cart persists across page refreshes (localStorage)
- [ ] **CART-05**: Cart displays running total of items and price

### Checkout

- [ ] **CHKT-01**: User can enter name and email to place an order (no account required)
- [ ] **CHKT-02**: User sees order review/summary before final submission
- [ ] **CHKT-03**: Checkout sends order details email to seller
- [ ] **CHKT-04**: Checkout sends confirmation email to buyer
- [ ] **CHKT-05**: User sees confirmation page after successful order with "pay in person" note

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Visual Polish

- **VISP-01**: Visual WUBRG mana icons on filter buttons
- **VISP-02**: Cart count badge in header/nav
- **VISP-03**: Inventory freshness indicator ("Last updated" date)

### Enhanced Cart

- **ECRT-01**: Bulk add to cart with quantity selector on catalog cards

## Out of Scope

| Feature | Reason |
|---------|--------|
| Payment processing | Friends pay in person — no Stripe/payment complexity |
| User accounts / login | Unnecessary for friend circle |
| Admin dashboard | CSV re-upload + rebuild is sufficient |
| Real-time inventory sync | Manual CSV re-upload when stock changes |
| Wishlists / saved items | Cart with localStorage is sufficient |
| Reviews / ratings | Friend store, not a marketplace |
| Multi-seller support | Single seller store |
| Deck builder integration | Separate app, massive scope creep |
| Shipping / logistics | Friends pick up in person |
| Advanced search syntax | Simple name search + visual filters is enough |
| Internationalization | Friend circle shares a language |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| CATL-01 | — | Pending |
| CATL-02 | — | Pending |
| CATL-03 | — | Pending |
| CATL-04 | — | Pending |
| CATL-05 | — | Pending |
| CATL-06 | — | Pending |
| CATL-07 | — | Pending |
| CATL-08 | — | Pending |
| CART-01 | — | Pending |
| CART-02 | — | Pending |
| CART-03 | — | Pending |
| CART-04 | — | Pending |
| CART-05 | — | Pending |
| CHKT-01 | — | Pending |
| CHKT-02 | — | Pending |
| CHKT-03 | — | Pending |
| CHKT-04 | — | Pending |
| CHKT-05 | — | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after initial definition*
