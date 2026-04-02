---
phase: 04-shopping-cart
plan: 02
subsystem: ui
tags: [cart-page, quantity-stepper, number-input, stock-validation, sticky-bar, zustand, hydration-guard]

# Dependency graph
requires:
  - phase: 04-shopping-cart
    plan: 01
    provides: "useCartStore Zustand store with Map-based items, persist middleware, header cart icon link"
  - phase: 03-search-and-filters
    provides: "Card type, header component, layout patterns"
provides:
  - "Shared loadCardData utility for server-side card data loading across routes"
  - "/cart page with full cart management (quantity controls, removal, clear, stock validation)"
  - "CartItem component with thumbnail, metadata, stepper+input, stock warning, remove"
  - "CartSummaryBar sticky bottom bar with item count, total price, checkout link"
affects: [04-03, 05-checkout]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared server-side data loader, hydration guard with persist.onFinishHydration, O(1) card lookup Map, native confirm for destructive actions]

key-files:
  created: [src/lib/load-cards.ts, src/app/cart/page.tsx, src/app/cart/cart-page-client.tsx, src/components/cart-item.tsx, src/components/cart-summary-bar.tsx]
  modified: [src/app/page.tsx]

key-decisions:
  - "Extracted loadCardData into shared utility to avoid duplicate server-side data loading logic"
  - "Native window.confirm for clear-cart per research recommendation (simple, accessible, no state)"
  - "Hydration guard using persist.onFinishHydration to prevent empty-cart flash before localStorage loads"
  - "Stock warning shown for 2 seconds on input overshoot then auto-clears via setTimeout"

patterns-established:
  - "Shared data loader: src/lib/load-cards.ts used by both / and /cart server components"
  - "Hydration guard pattern: persist.hasHydrated + onFinishHydration for Zustand persist stores"
  - "Cart page layout: max-w-3xl centered narrower layout for focused cart experience"

requirements-completed: [CART-02, CART-03, CART-05]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 04 Plan 02: Cart Page and Item Management Summary

**Full /cart page with quantity stepper+input controls, stock validation, clear cart, stale item handling, and sticky summary bar with running totals**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T22:56:27Z
- **Completed:** 2026-04-02T22:58:56Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Shared loadCardData utility extracted, home page refactored to use it, /cart server route created
- Cart page with full item management: thumbnail, name, set, price, +/- stepper, editable number input
- Stock validation caps quantity at available stock with "Only X available" warning on overshoot
- Minus below 1 removes item; dedicated remove button per item; clear cart with native confirm dialog
- Sticky bottom bar showing "X cards -- $Y.ZZ" format with checkout button
- Empty cart state with "Your cart is empty" and browse button
- Stale cart items (removed from inventory) show "No longer available" with remove action
- Hydration guard prevents flash of empty cart before localStorage loads

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared loadCardData utility and create /cart route** - `2a6bf3e` (feat)
2. **Task 2: Build cart page client, cart item component, and summary bar** - `d28aa62` (feat)

## Files Created/Modified
- `src/lib/load-cards.ts` - Shared loadCardData utility for server-side card data loading
- `src/app/page.tsx` - Refactored to import loadCardData from shared utility
- `src/app/cart/page.tsx` - Server component wrapper loading card data for /cart route
- `src/app/cart/cart-page-client.tsx` - Client component with cart state, hydration guard, clear cart, item list, summary bar
- `src/components/cart-item.tsx` - Cart row with thumbnail, metadata, +/- stepper, number input, stock warning, remove
- `src/components/cart-summary-bar.tsx` - Fixed bottom bar with item count, total price, checkout link

## Decisions Made
- Extracted loadCardData into shared src/lib/load-cards.ts to eliminate duplicate server-side data loading between / and /cart
- Used native window.confirm for clear-cart confirmation per research recommendation (simple, accessible, no custom state needed)
- Hydration guard uses Zustand persist.hasHydrated() + onFinishHydration() to prevent empty-cart flash
- Stock warning auto-clears after 2 seconds via setTimeout with ref-tracked cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cart page fully operational with all quantity controls, removal, and stock validation
- Shared loadCardData utility available for any future route needing card data
- Checkout link in summary bar points to /checkout (Phase 5 route, dead link for now)
- Ready for 04-03 (remaining cart polish or checkout preparation)

## Self-Check: PASSED

- All 6 files verified on disk (load-cards.ts, page.tsx, cart/page.tsx, cart-page-client.tsx, cart-item.tsx, cart-summary-bar.tsx)
- Both task commits (2a6bf3e, d28aa62) verified in git log
- TypeScript type-check passed (npx tsc --noEmit)
- Production build passed (npm run build)

---
*Phase: 04-shopping-cart*
*Completed: 2026-04-02*
