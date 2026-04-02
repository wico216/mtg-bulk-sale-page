# Phase 4: Shopping Cart - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can collect desired cards into a persistent cart and manage their selections. Includes add-to-cart from catalog, quantity management, removal, localStorage persistence, and running totals. Checkout form and email sending belong to Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Add-to-cart interaction
- Add-to-cart button on both the card tile in the grid AND in the detail modal
- Feedback is subtle: cart icon badge count updates (no toast notifications)
- First tap always adds 1 (no quantity picker on add)
- Once a card is in the cart, the tile button transforms into a +/- quantity stepper

### Cart visibility
- Cart is a separate /cart page (not a drawer or dropdown)
- Cart page shows card images as small thumbnails alongside name, price, quantity
- Empty cart state: "Your cart is empty" message with a button to browse cards

### Quantity & removal
- Cart page has both +/- stepper buttons AND an editable number input for quantity
- Each cart item has a remove button
- Tapping minus below quantity 1 removes the item from cart (no minimum-of-1 floor)
- "Clear cart" button with confirmation dialog ("Are you sure?") to remove everything
- When user exceeds available stock: quantity caps and brief message appears ("Only X available")

### Cart summary display
- Each cart item shows unit price and quantity (no per-item subtotal calculation)
- Grand total in a sticky bottom bar, always visible while scrolling
- Sticky bar shows: item count + total price (e.g., "12 cards — $24.50")
- Checkout button included in the sticky bottom bar

### Claude's Discretion
- Cart icon placement (header nav vs floating button)
- Exact stepper/input styling on cart page
- Card thumbnail sizing in cart list
- Confirmation dialog design for "Clear cart"

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-shopping-cart*
*Context gathered: 2026-04-02*
