# Phase 4: Shopping Cart - Research

**Researched:** 2026-04-02
**Domain:** Client-side shopping cart, Zustand persist middleware, localStorage, Next.js SSG hydration
**Confidence:** HIGH

## Summary

Phase 4 adds a shopping cart backed by a new Zustand store with localStorage persistence. The cart store is separate from the existing filter store. Users add cards from the catalog grid tile or detail modal, manage quantities on a dedicated `/cart` page, and see a running total. The cart icon in the header links to the cart page and displays a badge count.

The primary technical challenge is combining Zustand's `persist` middleware with Next.js SSG. During static generation the `window` object does not exist, so `localStorage` access will throw. Zustand 5.0.12 (installed) provides `createJSONStorage` which safely wraps `localStorage` access in a try/catch and returns `undefined` when the storage is unavailable, preventing SSG build failures. The persist middleware then gracefully degrades -- it works without storage on the server and hydrates from localStorage on the client after mount. The `skipHydration` option is available for fine-grained control but is unnecessary given the safe default behavior of `createJSONStorage`.

The second consideration is data shape. Cart items reference cards by their composite `id` (e.g., `sld-1750-foil-near_mint`) and store only `id`, `quantity`, and nothing else. Card metadata (name, price, image, available stock) is looked up from the filter store's `allCards` array at render time. This keeps the persisted data minimal and prevents stale prices/images in localStorage.

**Primary recommendation:** Create a new `cart-store.ts` using Zustand 5 with `persist` middleware wrapping `createJSONStorage(() => localStorage)`. Store only `Map<cardId, quantity>` serialized via custom `replacer`/`reviver` for JSON compatibility. Add `/cart` page route. Modify `card-tile.tsx` and `card-modal.tsx` to include add-to-cart / quantity stepper UI. Add cart icon with badge count to `header.tsx`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Add-to-cart interaction
- Add-to-cart button on both the card tile in the grid AND in the detail modal
- Feedback is subtle: cart icon badge count updates (no toast notifications)
- First tap always adds 1 (no quantity picker on add)
- Once a card is in the cart, the tile button transforms into a +/- quantity stepper

#### Cart visibility
- Cart is a separate /cart page (not a drawer or dropdown)
- Cart page shows card images as small thumbnails alongside name, price, quantity
- Empty cart state: "Your cart is empty" message with a button to browse cards

#### Quantity & removal
- Cart page has both +/- stepper buttons AND an editable number input for quantity
- Each cart item has a remove button
- Tapping minus below quantity 1 removes the item from cart (no minimum-of-1 floor)
- "Clear cart" button with confirmation dialog ("Are you sure?") to remove everything
- When user exceeds available stock: quantity caps and brief message appears ("Only X available")

#### Cart summary display
- Each cart item shows unit price and quantity (no per-item subtotal calculation)
- Grand total in a sticky bottom bar, always visible while scrolling
- Sticky bar shows: item count + total price (e.g., "12 cards -- $24.50")
- Checkout button included in the sticky bottom bar

### Claude's Discretion
- Cart icon placement (header nav vs floating button)
- Exact stepper/input styling on cart page
- Card thumbnail sizing in cart list
- Confirmation dialog design for "Clear cart"

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CART-01 | User can add cards to cart from the catalog | Add-to-cart button on `card-tile.tsx` and `card-modal.tsx`. Cart store `addItem(cardId)` action. First tap adds 1. Tile transforms to +/- stepper once item is in cart. |
| CART-02 | User can adjust quantity of items in cart (up to available stock) | Cart page has +/- stepper AND editable number input. `setQuantity(cardId, qty)` action caps at `card.quantity` (available stock from `allCards`). Stock cap shows brief "Only X available" message. |
| CART-03 | User can remove items from cart | Remove button per cart item. Minus below 1 removes. "Clear cart" with confirmation dialog. Cart store `removeItem(cardId)` and `clearCart()` actions. |
| CART-04 | Cart persists across page refreshes (localStorage) | Zustand `persist` middleware with `createJSONStorage(() => localStorage)`. Custom JSON `replacer`/`reviver` for Map serialization. `partialize` to persist only cart items, not derived state. |
| CART-05 | Cart displays running total of items and price | Derived selectors: `totalItems()` sums quantities, `totalPrice()` sums `qty * price` for each item. Displayed in sticky bottom bar on cart page. Also feeds badge count in header. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.2 | Framework, SSG, file-system routing | Already in project. `/cart` route = `src/app/cart/page.tsx` |
| React | 19.2.4 | UI components | Already in project |
| Tailwind CSS | v4 | Styling | Already in project, uses `@theme inline {}` |
| Zustand | 5.0.12 | State management | Already installed, used for filter store |

### New Middleware (no install needed -- bundled with zustand)
| Module | Purpose | Import Path |
|--------|---------|-------------|
| `persist` | localStorage persistence for cart state | `zustand/middleware` |
| `createJSONStorage` | SSG-safe localStorage wrapper | `zustand/middleware` |

### No New Dependencies
Everything needed is already in the project. The `persist` middleware is bundled with Zustand 5.0.12. No new `npm install` required.

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/
    page.tsx              # Existing -- modify card-grid/tile for add-to-cart
    cart/
      page.tsx            # NEW -- /cart route, server component wrapper
    layout.tsx            # Existing -- no changes needed
  components/
    card-tile.tsx          # MODIFY -- add-to-cart button / quantity stepper
    card-modal.tsx         # MODIFY -- add-to-cart button
    card-grid.tsx          # Existing -- minimal changes (tile already receives card)
    header.tsx             # MODIFY -- add cart icon with badge count
    cart-item.tsx          # NEW -- single cart row (thumbnail, name, price, qty stepper, remove)
    cart-summary-bar.tsx   # NEW -- sticky bottom bar with total + checkout button
    quantity-stepper.tsx   # NEW -- reusable +/- stepper with optional number input
  lib/
    store/
      filter-store.ts     # Existing -- no changes needed
      cart-store.ts        # NEW -- cart state with persist middleware
    types.ts               # Existing -- may add CartItem type
```

### Pattern 1: Separate Cart Store with Persist
**What:** A dedicated Zustand store for cart state, separate from the filter store. Uses the `persist` middleware to sync to localStorage.
**When to use:** When persistence is needed for one domain (cart) but not another (filters).
**Why separate:** The filter store holds ephemeral UI state (search query, selected colors). The cart store holds durable user intent. Mixing persist into the filter store would persist filter selections unnecessarily and complicate the store.

```typescript
// src/lib/store/cart-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CartState {
  /** Map of card ID to quantity in cart */
  items: Map<string, number>;

  // Actions
  addItem: (cardId: string) => void;
  removeItem: (cardId: string) => void;
  setQuantity: (cardId: string, qty: number) => void;
  clearCart: () => void;

  // Derived (implemented as methods using get())
  totalItems: () => number;
  hasItem: (cardId: string) => boolean;
  getQuantity: (cardId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: new Map<string, number>(),

      addItem: (cardId) =>
        set((state) => {
          const next = new Map(state.items);
          next.set(cardId, (next.get(cardId) ?? 0) + 1);
          return { items: next };
        }),

      removeItem: (cardId) =>
        set((state) => {
          const next = new Map(state.items);
          next.delete(cardId);
          return { items: next };
        }),

      setQuantity: (cardId, qty) =>
        set((state) => {
          const next = new Map(state.items);
          if (qty <= 0) {
            next.delete(cardId);
          } else {
            next.set(cardId, qty);
          }
          return { items: next };
        }),

      clearCart: () => set({ items: new Map() }),

      totalItems: () => {
        let total = 0;
        for (const qty of get().items.values()) total += qty;
        return total;
      },

      hasItem: (cardId) => get().items.has(cardId),

      getQuantity: (cardId) => get().items.get(cardId) ?? 0,
    }),
    {
      name: "viki-cart",
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key, value) =>
          value instanceof Map ? { __type: "Map", entries: [...value] } : value,
        reviver: (_key, value) => {
          if (
            value &&
            typeof value === "object" &&
            (value as Record<string, unknown>).__type === "Map"
          ) {
            return new Map((value as { entries: [string, number][] }).entries);
          }
          return value;
        },
      }),
      partialize: (state) => ({ items: state.items }) as CartState,
    },
  ),
);
```

### Pattern 2: Minimal Persisted Data -- Lookup at Render Time
**What:** The cart store persists only `Map<cardId, quantity>`. Card metadata (name, price, imageUrl, available stock) is resolved by looking up the card ID in `allCards` from the filter store at render time.
**When to use:** When the source data (cards.json) is immutable during a session and available in another store.
**Why this matters:**
- Prevents stale data in localStorage (price changed in a rebuild, image URL changed)
- Keeps localStorage payload tiny (just IDs and quantities vs full card objects)
- Cards not found in `allCards` (removed from inventory between sessions) are gracefully handled by the cart page

```typescript
// In cart-item.tsx or cart page:
const card = allCards.find((c) => c.id === cardId);
if (!card) {
  // Card was removed from inventory -- show "no longer available" or auto-remove
}
```

### Pattern 3: Stock Capping in the Store Action
**What:** The `setQuantity` and `addItem` actions accept a `maxStock` parameter and cap the quantity. The component passes `card.quantity` as the cap.
**When to use:** Whenever the user changes quantity via stepper or input.
**Why in the action:** Centralizes the business rule. The UI just calls the action; it doesn't need to know the capping logic.

```typescript
addItem: (cardId, maxStock?: number) =>
  set((state) => {
    const next = new Map(state.items);
    const current = next.get(cardId) ?? 0;
    const newQty = current + 1;
    next.set(cardId, maxStock ? Math.min(newQty, maxStock) : newQty);
    return { items: next };
  }),

setQuantity: (cardId, qty, maxStock?: number) =>
  set((state) => {
    const next = new Map(state.items);
    if (qty <= 0) {
      next.delete(cardId);
    } else {
      next.set(cardId, maxStock ? Math.min(qty, maxStock) : qty);
    }
    return { items: next };
  }),
```

### Pattern 4: Card Tile Dual-State Button
**What:** The card tile shows either an "Add to cart" button or a +/- quantity stepper, depending on whether the card is already in the cart.
**When to use:** As specified in locked decisions.
**Key detail:** The button must not interfere with the tile's `onClick` to open the detail modal. Use `event.stopPropagation()` on the add-to-cart / stepper buttons.

```tsx
// In card-tile.tsx
const inCart = useCartStore((s) => s.hasItem(card.id));
const qty = useCartStore((s) => s.getQuantity(card.id));
const addItem = useCartStore((s) => s.addItem);
const setQuantity = useCartStore((s) => s.setQuantity);
const removeItem = useCartStore((s) => s.removeItem);

// In the JSX, below card metadata:
{inCart ? (
  <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 mt-1">
    <button onClick={() => qty <= 1 ? removeItem(card.id) : setQuantity(card.id, qty - 1)}>-</button>
    <span>{qty}</span>
    <button onClick={() => setQuantity(card.id, qty + 1, card.quantity)}>+</button>
  </div>
) : (
  <button onClick={(e) => { e.stopPropagation(); addItem(card.id, card.quantity); }}>
    Add to cart
  </button>
)}
```

### Pattern 5: Next.js App Router /cart Route
**What:** A new route at `src/app/cart/page.tsx`. The page component is a server component that loads card data (same as the home page). It passes `cards` to a client component that reads the cart store.
**Why server component wrapper:** Consistent with existing pattern in `src/app/page.tsx` where data loading happens server-side.

```typescript
// src/app/cart/page.tsx (server component)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardData } from "@/lib/types";
import CartPageClient from "./cart-page-client";

function loadCardData(): CardData | null {
  // Same pattern as src/app/page.tsx
}

export default function CartPage() {
  const data = loadCardData();
  return <CartPageClient cards={data?.cards ?? []} />;
}
```

### Anti-Patterns to Avoid
- **Storing full Card objects in the cart store:** Duplicates data, risks stale metadata in localStorage. Store only IDs + quantities.
- **Single mega-store for filters + cart:** Different persistence needs (filters = ephemeral, cart = durable). Keep stores separate.
- **Using `useEffect` to sync cart to localStorage manually:** The `persist` middleware handles this automatically. Manual sync is redundant and error-prone.
- **Calling `getFilteredCards()` in cart components:** Same SSR infinite loop issue from Phase 3. Use `allCards.find()` for single card lookups.
- **Using `Object` instead of `Map` for cart items:** Map preserves insertion order, has O(1) `.has()`, and `.size` is a property. Object keys are always strings but that's fine here since card IDs are strings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| localStorage persistence | Manual `useEffect` + `JSON.parse`/`stringify` | Zustand `persist` middleware | Handles hydration timing, version migration, SSG safety, error recovery |
| Map JSON serialization | Custom utility module | `createJSONStorage` `replacer`/`reviver` options | Built into the middleware, single configuration point |
| SSG localStorage safety | `typeof window !== 'undefined'` guards scattered through code | `createJSONStorage(() => localStorage)` | The factory wraps `getStorage()` in try/catch and returns `undefined` when unavailable, causing persist to gracefully degrade |
| Confirm dialog | Custom modal component | Native `window.confirm()` for "Clear cart" | Simple, accessible, no state to manage. Can upgrade later if visual style matters. |

**Key insight:** Zustand's `persist` middleware solves the three hardest problems in client-side persistence: SSR/SSG safety, hydration timing, and version migration. Hand-rolling any of these invites subtle bugs (flash of empty cart, hydration mismatch, corrupted localStorage).

## Common Pitfalls

### Pitfall 1: Map Serialization with JSON
**What goes wrong:** `JSON.stringify(new Map(...))` produces `{}` -- an empty object. Cart state "disappears" on page refresh.
**Why it happens:** `JSON.stringify` does not natively serialize Map objects. It falls back to `toJSON()` which for Map returns an empty object literal.
**How to avoid:** Use `replacer`/`reviver` functions in `createJSONStorage` to convert Map to/from a serializable format:
```typescript
createJSONStorage(() => localStorage, {
  replacer: (_key, value) =>
    value instanceof Map ? { __type: "Map", entries: [...value] } : value,
  reviver: (_key, value) =>
    value?.__type === "Map" ? new Map(value.entries) : value,
})
```
**Warning signs:** Cart is empty after every page refresh despite items being added.

### Pitfall 2: SSG Build Failure from localStorage Access
**What goes wrong:** `ReferenceError: localStorage is not defined` during `next build`.
**Why it happens:** The persist middleware defaults to `createJSONStorage(() => window.localStorage)`. During SSG, `window` does not exist.
**How to avoid:** The `createJSONStorage` factory already handles this -- it wraps the `getStorage()` call in a try/catch. If `localStorage` is not available (SSR), the factory returns `undefined`, and the persist middleware operates without storage (no-op persistence). The cart store initializes with empty state on the server and hydrates from localStorage on the client.
**Key detail from source code (verified):** Lines 278-303 of `node_modules/zustand/middleware.js` show the try/catch:
```javascript
function createJSONStorage(getStorage, options) {
  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    return; // returns undefined -- persist middleware degrades gracefully
  }
  // ...
}
```
And the persist middleware (line 346-357) handles `undefined` storage by logging a warning and operating without persistence.
**Warning signs:** Build crashes with `ReferenceError: localStorage is not defined`.

### Pitfall 3: Hydration Mismatch -- Flash of Empty Cart
**What goes wrong:** Server-rendered HTML shows an empty cart. After client hydration, the cart populates from localStorage, causing a visible flash/layout shift.
**Why it happens:** SSG renders with default state (empty cart). Client hydration restores persisted state.
**How to avoid:** Two strategies:
1. **Accept the flash for badge count:** The cart icon badge shows "0" initially, then updates. Since this is subtle (small badge), the flash is acceptable.
2. **Defer cart-dependent rendering:** Use `useCartStore.persist.hasHydrated()` to show a loading state until hydration completes:
```typescript
const hasHydrated = useCartStore.persist.hasHydrated();
if (!hasHydrated) return <CartSkeleton />;
```
**Recommendation:** Use option 1 for the header badge (acceptable flash) and option 2 for the cart page content (prevents confusing empty-then-full flash).
**Warning signs:** Cart page briefly shows "Your cart is empty" before items appear.

### Pitfall 4: Card Tile Button Event Propagation
**What goes wrong:** Clicking "Add to cart" on a card tile also opens the detail modal.
**Why it happens:** The entire `card-tile.tsx` is wrapped in a `<button>` with an `onClick` handler. The add-to-cart button inside it fires both its own click and the parent's.
**How to avoid:** Call `event.stopPropagation()` on the add-to-cart button and the quantity stepper buttons.
**Warning signs:** Every click on add-to-cart also opens the modal.

### Pitfall 5: Stale Cart Items After Inventory Rebuild
**What goes wrong:** A card ID persisted in localStorage no longer exists in the rebuilt `cards.json`. The cart page crashes or shows broken entries.
**Why it happens:** Inventory changes between rebuilds (CSV re-export removes a card, collector number changes).
**How to avoid:** When rendering cart items, look up each card ID in `allCards`. If not found, show a "No longer available" message with a remove button. Optionally auto-prune stale items on cart page mount.
**Warning signs:** Cart page shows items with missing names, images, or prices.

### Pitfall 6: Zustand Map Reactivity (Same as Set Issue in Phase 3)
**What goes wrong:** Mutating the Map in-place (`items.set(id, qty)`) does not trigger re-renders.
**Why it happens:** Zustand uses `Object.is` for equality. Same Map reference = no change detected.
**How to avoid:** Always create a new Map in `set()`:
```typescript
set((state) => {
  const next = new Map(state.items);
  next.set(cardId, qty);
  return { items: next };
});
```
**Warning signs:** Adding to cart does nothing visually, but `useCartStore.getState()` shows the item.

### Pitfall 7: Number Input Allowing Invalid Values
**What goes wrong:** User types "abc" or "0" or "-5" into the quantity input.
**Why it happens:** HTML `<input type="number">` still allows non-numeric characters in some browsers. `onChange` fires with empty string.
**How to avoid:** Parse the input value with `parseInt`, clamp between 0 and `card.quantity` (available stock). If `NaN`, ignore the change. If 0 or below, remove the item (per locked decision: minus below 1 removes).
**Warning signs:** Cart quantity shows NaN or allows negative values.

### Pitfall 8: Cart Items Selector Creating New Array Each Render
**What goes wrong:** Components subscribing to cart `items` Map re-render on every store update, even unrelated updates.
**Why it happens:** `useCartStore((s) => s.items)` returns the Map, which is a new reference after any mutation.
**How to avoid:** For the header badge, subscribe to a derived value: `useCartStore((s) => s.totalItems())`. For the card tile, subscribe to just the item's quantity: `useCartStore((s) => s.getQuantity(card.id))`. These return primitives (numbers), so they only trigger re-renders when the actual value changes.
**Warning signs:** Entire card grid re-renders when any cart action occurs.

## Code Examples

### Cart Store with Persist (Complete Implementation)
```typescript
// src/lib/store/cart-store.ts
// Source: Zustand 5.0.12 persist middleware types + source code analysis
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface CartState {
  items: Map<string, number>;

  addItem: (cardId: string, maxStock?: number) => void;
  removeItem: (cardId: string) => void;
  setQuantity: (cardId: string, qty: number, maxStock?: number) => void;
  clearCart: () => void;
  totalItems: () => number;
  hasItem: (cardId: string) => boolean;
  getQuantity: (cardId: string) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: new Map<string, number>(),

      addItem: (cardId, maxStock) =>
        set((state) => {
          const next = new Map(state.items);
          const current = next.get(cardId) ?? 0;
          const newQty = current + 1;
          next.set(cardId, maxStock != null ? Math.min(newQty, maxStock) : newQty);
          return { items: next };
        }),

      removeItem: (cardId) =>
        set((state) => {
          const next = new Map(state.items);
          next.delete(cardId);
          return { items: next };
        }),

      setQuantity: (cardId, qty, maxStock) =>
        set((state) => {
          const next = new Map(state.items);
          if (qty <= 0) {
            next.delete(cardId);
          } else {
            next.set(cardId, maxStock != null ? Math.min(qty, maxStock) : qty);
          }
          return { items: next };
        }),

      clearCart: () => set({ items: new Map() }),

      totalItems: () => {
        let total = 0;
        for (const qty of get().items.values()) total += qty;
        return total;
      },

      hasItem: (cardId) => get().items.has(cardId),

      getQuantity: (cardId) => get().items.get(cardId) ?? 0,
    }),
    {
      name: "viki-cart",
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key, value) =>
          value instanceof Map
            ? { __type: "Map", entries: [...value] }
            : value,
        reviver: (_key, value) => {
          if (
            value &&
            typeof value === "object" &&
            (value as Record<string, unknown>).__type === "Map"
          ) {
            return new Map(
              (value as { entries: [string, number][] }).entries,
            );
          }
          return value;
        },
      }),
      partialize: (state) =>
        ({ items: state.items }) as unknown as CartState,
      version: 1,
    },
  ),
);
```

### Card Tile with Add-to-Cart (Modification Pattern)
```tsx
// Key changes to src/components/card-tile.tsx
"use client";
import { useCartStore } from "@/lib/store/cart-store";

// Inside CardTile component:
const inCart = useCartStore((s) => s.hasItem(card.id));
const qty = useCartStore((s) => s.getQuantity(card.id));
const addItem = useCartStore((s) => s.addItem);
const setQuantity = useCartStore((s) => s.setQuantity);
const removeItem = useCartStore((s) => s.removeItem);

// Below metadata, inside the outer button:
{inCart ? (
  <div
    onClick={(e) => e.stopPropagation()}
    className="flex items-center justify-center gap-2 mt-1.5"
  >
    <button
      type="button"
      onClick={() =>
        qty <= 1
          ? removeItem(card.id)
          : setQuantity(card.id, qty - 1, card.quantity)
      }
      className="w-6 h-6 rounded bg-zinc-100 text-sm font-medium cursor-pointer"
    >
      -
    </button>
    <span className="text-sm w-6 text-center">{qty}</span>
    <button
      type="button"
      onClick={() => setQuantity(card.id, qty + 1, card.quantity)}
      className="w-6 h-6 rounded bg-zinc-100 text-sm font-medium cursor-pointer"
    >
      +
    </button>
  </div>
) : (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      addItem(card.id, card.quantity);
    }}
    className="mt-1.5 w-full text-xs py-1 rounded bg-accent text-white font-medium cursor-pointer"
  >
    Add to cart
  </button>
)}
```

### Header Cart Icon with Badge
```tsx
// Modification to src/components/header.tsx
"use client";
import Link from "next/link";
import { useCartStore } from "@/lib/store/cart-store";

export default function Header() {
  const totalItems = useCartStore((s) => s.totalItems());

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <span className="font-bold text-accent">Viki</span>{" "}
          <span className="font-light text-zinc-500">MTG Bulk Store</span>
        </Link>
        <Link href="/cart" className="relative p-2">
          {/* Shopping cart SVG icon */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
            strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121 0 2.002-.881 2.002-2V6.75" />
          </svg>
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
```

### Hydration-Safe Cart Page
```tsx
// src/app/cart/cart-page-client.tsx
"use client";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useFilterStore } from "@/lib/store/filter-store";
import type { Card } from "@/lib/types";

interface CartPageClientProps {
  cards: Card[];
}

export default function CartPageClient({ cards }: CartPageClientProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  const allCards = useFilterStore((s) => s.allCards);
  const items = useCartStore((s) => s.items);

  // Hydration guard
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setAllCards(cards);
    // Check persist hydration
    const unsub = useCartStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useCartStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, [cards, setAllCards]);

  if (!hydrated) {
    return <div>Loading cart...</div>; // or skeleton
  }

  if (items.size === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 mb-4">Your cart is empty</p>
        <Link href="/">Browse cards</Link>
      </div>
    );
  }

  // Render cart items...
}
```

### Stock Cap with Feedback Message
```tsx
// Inside quantity stepper on cart page:
const [showStockWarning, setShowStockWarning] = useState(false);

function handleIncrease() {
  if (qty >= card.quantity) {
    setShowStockWarning(true);
    setTimeout(() => setShowStockWarning(false), 2000);
    return;
  }
  setQuantity(card.id, qty + 1, card.quantity);
}

// JSX:
{showStockWarning && (
  <p className="text-xs text-amber-600">Only {card.quantity} available</p>
)}
```

## Discretion Recommendations

### Cart Icon Placement
**Recommendation:** In the header nav bar, right-aligned. Not a floating button.
**Rationale:** The header already exists with left-aligned branding. A right-aligned cart icon is the universal e-commerce convention. A floating button would overlap the card grid content and conflict with the sticky filter bar. The header is always visible (not sticky, but at top), and users navigate to cart intentionally, not impulsively.

### Stepper/Input Styling on Cart Page
**Recommendation:** Compact row layout per item. The +/- buttons are small rounded squares (w-8 h-8) flanking a centered number. The editable input is a small `<input type="number">` (w-16) that appears inline, replacing the static number display. Use a pattern similar to how many e-commerce sites handle this: the number itself is clickable to become an input.
**Simpler alternative:** Just show the +/- stepper with the number as a small input always (no toggle). This avoids the complexity of switching between display and edit modes.

### Card Thumbnail Sizing in Cart List
**Recommendation:** 48x67px (maintains 5:7 aspect ratio of card images). Small enough to not dominate the row, large enough to recognize the card art. Use `next/image` with `width={48} height={67}` and `sizes="48px"`.

### Confirmation Dialog for "Clear Cart"
**Recommendation:** Use native `window.confirm("Remove all items from your cart?")` for v1. It is accessible, requires zero extra components, and works on all devices. If the visual style feels too jarring compared to the rest of the app, a simple in-page confirmation banner (not a modal) can replace it later.

## Data Shape Reference

Current dataset characteristics relevant to cart:
- **Total cards:** 136
- **Card ID format:** `{setCode}-{collectorNumber}-{foil|normal}-{condition}` (e.g., `sld-1750-foil-near_mint`)
- **Quantity range:** 1-2 (135 cards have qty 1, 1 card has qty 2)
- **Price range:** $0.25 - $116.11 (zero null prices currently, but type allows null)
- **Cards with null price:** 0 (but cart must handle this gracefully)

**Cart localStorage payload estimate:** With all 136 cards in cart, the JSON payload would be roughly: `{"state":{"items":{"__type":"Map","entries":[["sld-1750-foil-near_mint",1],...]}},"version":1}` -- approximately 8KB. Well within localStorage limits.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux persist (separate package) | Zustand `persist` middleware (built-in) | Zustand 4+ (2022) | No extra dependency, simpler API |
| Manual `useEffect` + localStorage | `persist` middleware | Zustand 4+ | Automatic sync, hydration handling, version migration |
| `JSON.parse`/`stringify` with custom wrappers | `createJSONStorage` with `replacer`/`reviver` | Zustand 4.4+ | Type-safe serialization built into persist config |
| `typeof window !== 'undefined'` guards | `createJSONStorage` try/catch pattern | Zustand 5 | Zero manual SSR guards needed |

## Open Questions

1. **Alternative to Map: plain object for cart items**
   - What we know: Map provides O(1) lookups and clean iteration. But Map requires custom JSON serialization (replacer/reviver).
   - What's unclear: Whether a plain `Record<string, number>` would be simpler overall since JSON serialization is free.
   - Recommendation: **A plain object `Record<string, number>` is actually simpler for this use case.** Card IDs are strings, quantities are numbers. No custom serialization needed. The Map advantages (insertion order, non-string keys) are not relevant here. The planner should consider this tradeoff -- Map is more "correct" but Record is more pragmatic. Either works.

2. **Header component becoming a client component**
   - What we know: `header.tsx` is currently a server component (no `"use client"` directive). Adding the cart badge requires `useCartStore`, making it a client component.
   - What's unclear: Whether this has any performance implications for the layout.
   - Recommendation: This is fine. The header is small and already re-renders on every page. Making it a client component for the cart badge is standard practice. The `Link` component from `next/link` works in both server and client components.

3. **Data loading duplication between / and /cart**
   - What we know: Both `src/app/page.tsx` and the new `src/app/cart/page.tsx` need to load `cards.json` for the card data.
   - What's unclear: Whether the data loading function should be extracted to a shared utility.
   - Recommendation: Extract `loadCardData()` from `src/app/page.tsx` into `src/lib/load-cards.ts` and import it from both page components. This prevents copy-pasting the filesystem read logic.

## Sources

### Primary (HIGH confidence)
- **Zustand 5.0.12 source code** -- `node_modules/zustand/middleware.js` lines 278-495 -- persist middleware implementation, createJSONStorage, ssrSafe behavior verified directly
- **Zustand 5.0.12 type definitions** -- `node_modules/zustand/middleware/persist.d.ts` -- PersistOptions interface, StateStorage, createJSONStorage signature
- **Existing codebase** -- `filter-store.ts` (established Zustand pattern), `card-tile.tsx` (current tile structure), `card-modal.tsx` (current modal), `header.tsx` (current header), `page.tsx` (data loading pattern), `card-grid.tsx` (store usage, useMemo pattern), `globals.css` (theme vars), `next.config.ts` (image domains)
- **cards.json analysis** -- 136 cards, quantity distribution (135x1, 1x2), price range, ID format verified
- **Next.js 16.2.2 docs** at `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` -- file-system routing for /cart page

### Secondary (MEDIUM confidence)
- **Zustand persist middleware documentation** -- skipHydration, partialize, version, migrate options from type definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All dependencies already installed. Persist middleware API verified from source code.
- Architecture: HIGH -- Patterns follow established codebase conventions (server loads data, client renders with Zustand). New /cart route follows standard Next.js App Router file conventions.
- Pitfalls: HIGH -- Map serialization, SSG localStorage safety, hydration mismatch, event propagation all verified from source code and codebase analysis. Stock capping logic informed by actual data (135 cards qty 1, 1 card qty 2).
- Discretion areas: MEDIUM -- Recommendations based on common e-commerce patterns and consistency with existing UI.

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, no fast-moving dependencies)
