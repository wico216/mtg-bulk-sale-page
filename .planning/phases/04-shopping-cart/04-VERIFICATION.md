---
phase: 04-shopping-cart
verified: 2026-04-02T23:30:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Add a card from the catalog tile and confirm the header badge increments"
    expected: "Badge shows '1' immediately after clicking 'Add to cart' on a tile"
    why_human: "Badge update requires live rendering and Zustand subscription — cannot assert render output from static analysis"
  - test: "Add a card from the catalog detail modal and confirm the tile transforms to a stepper"
    expected: "After adding from modal and closing it, the tile for that card shows +/- stepper with quantity 1"
    why_human: "Cross-component state sync between modal and tile requires running UI to observe"
  - test: "On the cart page, increase quantity to max stock then try to go higher via the + button"
    expected: "Button is disabled at max stock; 'Only X available' message appears if input is used to exceed it"
    why_human: "Disabled state and stock warning require interaction in a running browser"
  - test: "Refresh the page with items in the cart"
    expected: "Badge count and cart contents match what was present before refresh (no flash of empty state)"
    why_human: "localStorage hydration behavior and absence of flash require live observation"
  - test: "Click 'Clear cart', click Cancel, then click 'Clear cart' again and confirm"
    expected: "First time: cart unchanged. Second time: all items removed, empty state shown"
    why_human: "window.confirm interaction cannot be automated from static analysis"
  - test: "Verify sticky summary bar shows correct count and formatted price as items are added/removed"
    expected: "Bar shows 'X cards — $Y.ZZ' updating live as quantities change"
    why_human: "Running total calculation verified in code, but live update behavior needs human observation"
---

# Phase 4: Shopping Cart Verification Report

**Phase Goal:** Users can collect desired cards into a persistent cart and manage their selections
**Verified:** 2026-04-02T23:30:00Z
**Status:** human_needed (all automated checks passed — 6 behaviors require human confirmation)
**Re-verification:** No — initial verification

---

## Step 0: Previous Verification

No previous VERIFICATION.md found. Proceeding with initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can add a card to the cart from the catalog view | ? HUMAN | Code verified: `card-tile.tsx` renders "Add to cart" span[role=button] calling `addItem(card.id, card.quantity)` with stopPropagation. `card-modal.tsx` renders Add to cart button calling same. Both wire to `useCartStore`. Visual confirmation required. |
| 2 | User can increase or decrease the quantity of any cart item (capped at available stock) | ? HUMAN | Code verified: `cart-item.tsx` has +/- stepper buttons and number input with `handleInputChange`. `setQuantity` in store enforces `Math.min(qty, maxStock)`. Stock warning fires via `showStockWarning()` when input exceeds stock. Tile stepper `aria-disabled` at `qty >= card.quantity`. Modal plus button `disabled={qty >= card.quantity}`. Capping logic present in store. Live behavior requires human. |
| 3 | User can remove an item from the cart entirely | ? HUMAN | Code verified: `cart-item.tsx` has a dedicated remove button calling `onRemove()`. Minus at quantity 1 calls `onRemove()`. `handleInputChange` calls `onRemove()` when parsed <= 0. `handleClearCart` in client calls `clearCart()` after `window.confirm`. All paths call `removeItem` in store (creates new Map, deletes entry). Requires live confirmation. |
| 4 | Cart contents survive a full page refresh (localStorage persistence) | ? HUMAN | Code verified: `useCartStore` uses Zustand `persist` middleware with `createJSONStorage(() => localStorage)`. Custom `replacer`/`reviver` serialize/deserialize `Map<string, number>`. Key: `"viki-cart"`. `partialize` limits persistence to `{ items }`. `cart-page-client.tsx` has hydration guard via `persist.onFinishHydration + hasHydrated()`. Requires live page refresh to confirm. |
| 5 | Cart displays a running total showing number of items and total price | ? HUMAN | Code verified: `cart-summary-bar.tsx` renders fixed bar with `"{totalItems} {card/cards} — ${totalPrice.toFixed(2)}"` and Checkout link to `/checkout`. `cart-page-client.tsx` computes `totalItems` via store selector and `totalPrice` via `useMemo` iterating items Map × card prices. `header.tsx` renders badge `{totalItems > 0 && <span>}` with `99+` cap. Requires live observation. |

**Score:** 5/5 truths are substantively wired — all automated checks pass. All 5 require human observation for final confirmation.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/store/cart-store.ts` | Zustand cart store with persist middleware, Map state, actions, selectors | VERIFIED | 91 lines. Exports `useCartStore`. `Map<string, number>` items. `addItem`, `removeItem`, `setQuantity`, `clearCart` actions — each creates new Map for reactivity. `totalItems`, `hasItem`, `getQuantity` derived. `persist` with `createJSONStorage`, custom `replacer`/`reviver`, `partialize`. Key: `"viki-cart"`. |
| `src/components/header.tsx` | Header with cart icon linking to /cart and badge count | VERIFIED | 44 lines. `'use client'`. Imports `useCartStore`. `totalItems` selector. Cart icon SVG inside `<Link href="/cart">`. Badge rendered conditionally with `99+` cap. |
| `src/components/card-tile.tsx` | Card tile with dual-state add-to-cart button / quantity stepper | VERIFIED | 144 lines. `'use client'`. Imports `useCartStore`. Reads `inCart`, `qty`, `addItem`, `setQuantity`, `removeItem`. "Add to cart" span[role=button] transforms to +/- stepper. stopPropagation on all cart controls. Plus `aria-disabled` at stock cap. |
| `src/components/card-modal.tsx` | Card modal with add-to-cart button and stepper | VERIFIED | 186 lines. `'use client'`. Imports `useCartStore`. Reads `inCart`, `qty`, `addItem`, `setQuantity`, `removeItem`. "Add to cart" button when not in cart. Stepper with "in cart" label when in cart. Plus `disabled` at stock cap. `!text-black`/`!border-black` for contrast (04-03 polish). |
| `src/lib/load-cards.ts` | Shared loadCardData utility | VERIFIED | 13 lines. Reads `data/generated/cards.json` via `readFileSync`. Returns `CardData | null`. |
| `src/app/cart/page.tsx` | Server component wrapper for /cart route | VERIFIED | 21 lines. No `'use client'`. Imports `loadCardData`. Calls `loadCardData()`, extracts `cards`. Renders `<Header />` + `<CartPageClient cards={cards} />` with `pb-24` for sticky bar. |
| `src/app/cart/cart-page-client.tsx` | Client component rendering cart items with store integration | VERIFIED | 120 lines. `'use client'`. Imports `useCartStore`, `CartItem`, `CartSummaryBar`. Reads `items`, `setQuantity`, `removeItem`, `clearCart`, `totalItems`. Hydration guard. `cardMap` useMemo. `totalPrice` useMemo. Empty state with "Browse cards" link. Item list with `CartItem` map. `CartSummaryBar` rendered. `handleClearCart` uses `window.confirm`. |
| `src/components/cart-item.tsx` | Single cart row with thumbnail, stepper+input, remove button | VERIFIED | 176 lines. `'use client'`. Props: `cardId`, `quantity`, `card`, `onQuantityChange`, `onRemove`, `maxStock`. Stale item branch (card undefined). Normal branch: thumbnail, name, set, price, +/- stepper, number input with `handleInputChange`, stock warning, remove button. |
| `src/components/cart-summary-bar.tsx` | Sticky bottom bar with item count, total price, checkout button | VERIFIED | 32 lines. `'use client'`. Fixed bottom bar. Renders `"{totalItems} card(s) — ${totalPrice.toFixed(2)}"`. Checkout `<Link href="/checkout">`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `card-tile.tsx` | `cart-store.ts` | `useCartStore` reads `hasItem`/`getQuantity`, calls `addItem`/`setQuantity`/`removeItem` | WIRED | All 5 store references confirmed at lines 30-34. |
| `card-modal.tsx` | `cart-store.ts` | `useCartStore` reads `hasItem`/`getQuantity`, calls `addItem`/`setQuantity`/`removeItem` | WIRED | All 5 store references confirmed at lines 65-69. |
| `header.tsx` | `cart-store.ts` | `useCartStore` reads `totalItems()` for badge count | WIRED | Line 7. Selector returns primitive number — avoids unnecessary re-renders. |
| `cart-page-client.tsx` | `cart-store.ts` | reads `items` Map, calls `removeItem`/`setQuantity`/`clearCart` | WIRED | Lines 15-19. All four store hooks confirmed. |
| `cart-page-client.tsx` | `cart-item.tsx` | maps over cart items and renders `CartItem` for each | WIRED | Lines 102-114. Full prop set passed: `cardId`, `quantity`, `card`, `maxStock`, `onQuantityChange`, `onRemove`. |
| `cart-page-client.tsx` | `cart-summary-bar.tsx` | renders sticky bar with `totalItems` and `totalPrice` | WIRED | Line 117. Both props passed from computed values. |
| `cart/page.tsx` | `load-cards.ts` | loads card data at build time | WIRED | Line 1 import, line 10 call. |
| `app/page.tsx` | `load-cards.ts` | refactored to use shared `loadCardData` | WIRED | Confirmed via grep: line 1 import, line 7 call. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `cart-page-client.tsx` | `items` (Map) | `useCartStore` — Zustand persist store hydrated from `localStorage["viki-cart"]` | Yes — populated by user actions (addItem/removeItem/setQuantity) persisted to localStorage | FLOWING |
| `cart-page-client.tsx` | `totalPrice` | `useMemo` iterating `items` × `cardMap.get(id)?.price` | Yes — derived from real card prices from `cards.json` prop | FLOWING |
| `cart-page-client.tsx` | `cards` prop | Server component `loadCardData()` reads `data/generated/cards.json` at build/request time | Yes — real file read | FLOWING |
| `header.tsx` | `totalItems` | `useCartStore((s) => s.totalItems())` — sums all Map values | Yes — derived from live store state | FLOWING |
| `cart-summary-bar.tsx` | `totalItems`, `totalPrice` | Props from `cart-page-client.tsx` | Yes — passed from computed values | FLOWING |
| `cart-item.tsx` | `quantity`, `card`, `maxStock` | Props from parent — drawn from Zustand items Map and `cardMap` lookup | Yes — real store values and real card data | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles without errors | `npx tsc --noEmit` | No output (clean) | PASS |
| `cart-store.ts` exports `useCartStore` | Module import check | `typeof m === 'object'` (CJS interop successful) | PASS |
| `load-cards.ts` exports `loadCardData` | `grep -n "export function loadCardData"` | Found at line 5 | PASS |
| `cart/page.tsx` is not a client component | Absence of `'use client'` | File has no `'use client'` directive — correct server component | PASS |
| Anti-pattern scan (TODO/FIXME/placeholder) | grep across all 8 phase files | No matches | PASS |

Live server tests (add to cart, refresh, clear cart, stock cap) skipped — requires running browser. Routed to human verification.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CART-01 | 04-01 | User can add cards to cart from the catalog | SATISFIED | `card-tile.tsx` "Add to cart" span + `card-modal.tsx` "Add to cart" button both call `addItem`. Both wired to `useCartStore`. |
| CART-02 | 04-02 | User can adjust quantity of items in cart (up to available stock) | SATISFIED | `cart-item.tsx` has +/- stepper and number input. `handleInputChange` caps at `maxStock` and shows warning. Store `setQuantity` enforces `Math.min(qty, maxStock)`. Tile and modal steppers also enforce cap. |
| CART-03 | 04-02 | User can remove items from cart | SATISFIED | `cart-item.tsx` has dedicated remove button. Minus at qty 1 removes. Input at 0/NaN removes. `handleClearCart` with confirm removes all. All call `removeItem` or `clearCart` on store. |
| CART-04 | 04-01 | Cart persists across page refreshes (localStorage) | SATISFIED | `useCartStore` persist middleware with `createJSONStorage(() => localStorage)`, Map serialization, `partialize`. Hydration guard in client prevents empty flash. |
| CART-05 | 04-01, 04-02 | Cart displays running total of items and price | SATISFIED | `header.tsx` badge shows `totalItems`. `cart-summary-bar.tsx` renders `"{totalItems} cards — ${totalPrice.toFixed(2)}"`. Both wired to live store state. |

All 5 CART requirements claimed across plans are covered. No orphaned requirements — REQUIREMENTS.md traceability maps CART-01 through CART-05 to Phase 4, all accounted for.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TODO/FIXME/placeholder/stub patterns found in any of the 8 phase files. No empty implementations. No hardcoded empty data used as final render values (the `new Map()` initial state in the store is immediately hydrated from localStorage on client mount via persist middleware).

One notable observation: `cart-summary-bar.tsx` renders a Checkout button linking to `/checkout` which is a dead link (Phase 5 not yet built). This is documented as intentional in both PLAN and SUMMARY — not a defect for this phase.

---

## Human Verification Required

### 1. Add to Cart from Catalog Tile

**Test:** Open the home page. Find any card tile and click "Add to cart."
**Expected:** Header badge immediately shows "1". The tile button transforms into a +/- stepper showing quantity 1.
**Why human:** Badge render and tile state transformation require live Zustand subscription response in a running browser.

### 2. Add to Cart from Card Modal

**Test:** Find a card tile. Click the tile (not the button) to open the detail modal. Click "Add to cart" in the modal.
**Expected:** Modal button transforms to stepper with "in cart" label. Badge increments. Close the modal — the tile for that card now shows a stepper.
**Why human:** Cross-component synchronization (modal → tile → header) requires running React to observe.

### 3. Stock Cap Enforcement

**Test:** Find a card with a small quantity (e.g., 1 or 2). Add it to the cart. On the cart page, try increasing beyond available stock using the + button, then try typing a higher number in the quantity input.
**Expected:** + button disables at max stock. Typing above max in the input caps the value and shows "Only X available" for ~2 seconds.
**Why human:** Disabled state and auto-clearing stock warning require browser interaction.

### 4. localStorage Persistence (Page Refresh)

**Test:** Add several cards to the cart. Perform a full page refresh (Cmd+R or F5). Check the header badge and navigate to /cart.
**Expected:** Badge count matches what was there before refresh. Cart page items are unchanged with no flash of empty state.
**Why human:** localStorage read on hydration and suppression of the empty-cart flash require live browser observation.

### 5. Clear Cart with Confirmation

**Test:** On /cart with items, click "Clear cart." Click Cancel in the browser dialog. Click "Clear cart" again and click OK.
**Expected:** After Cancel: cart unchanged. After OK: all items removed, page shows "Your cart is empty" with "Browse cards" button.
**Why human:** `window.confirm` interaction cannot be simulated in static analysis.

### 6. Running Total in Sticky Bar

**Test:** Add 2 cards with known prices to the cart. Navigate to /cart. Verify the sticky bar.
**Expected:** Bar shows correct item count and total price formatted as "X cards — $Y.ZZ". Total updates as quantities change.
**Why human:** Price calculation from live store × card data requires running app with real card inventory.

---

## Gaps Summary

No automated gaps found. All 5 truths are supported by substantive, wired, data-flowing code. TypeScript compiles cleanly. All 5 CART requirements are satisfied by implementation evidence.

The phase is held at `human_needed` because the core behaviors (cart interactions, badge updates, localStorage persistence, stock warning) require a running browser session to confirm. The code correctly implements all specified behaviors, and the human verification in 04-03 was completed (04-03-SUMMARY.md documents approval with UI polish fixes applied), but as this is a formal automated verification pass, the live behavioral items are routed to human confirmation.

---

_Verified: 2026-04-02T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
