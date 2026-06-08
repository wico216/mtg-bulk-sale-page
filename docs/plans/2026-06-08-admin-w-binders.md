# Admin W Binders Private Picker

Project: Admin W Binders private picker
Goal: Wiko can upload personal W binders without selling them publicly, then browse/search those cards in an admin-only store-like interface and build a personal pick list.
Non-goals: No public multi-seller marketplace; no customer checkout against W binders; no inventory decrement for personal picks in this first slice.
Safety constraints: W binders must be excluded from public storefront, `/new`, cart reconciliation data, and server-side checkout allocation. Binder/folder names stay admin-only.
Success proof: Unit/source guard tests for public W exclusion and checkout allocator scope; admin route builds; focused tests/lint/build run with real output.

## Discovery

- Public storefront uses `loadStorefrontData()` -> `getCardsAggregated()` -> `toPublicCards()`.
- Public `/new` uses `getRecentlyAddedCards()`.
- Public cart page uses `getCardsAggregated()` for cart reconciliation data.
- Checkout allocation happens server-side in `placeCheckoutOrder()` and currently locks all matching binder rows.
- Existing binder names are normalized lower-case; W folders should be represented as `w*` binder values.

## First Slice

1. Define W binder scope as normalized binder values beginning with `w`.
2. Exclude W binders from public aggregate/meta/recent queries.
3. Exclude W binders from public checkout allocator SQL.
4. Add admin-only `/admin/w-binders` route and nav item.
5. Add a client-only private W pick list using a separate persisted store from the public satchel.
6. Reuse the storefront search/filter/sort/grid shell with an injected selection controller so admin picks do not touch the public cart.

## Risks

- `startsWith("w")` intentionally classifies any W-prefix folder as personal. If Wiko later creates public binders beginning with W, the helper must move to a config/list-based scope.
- The first slice creates a pick list only; it does not remove/decrement W binder inventory when Wiko physically pulls cards.
