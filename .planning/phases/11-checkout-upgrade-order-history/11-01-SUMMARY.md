---
phase: 11-checkout-upgrade-order-history
plan: 01
subsystem: checkout-orders
tags: [checkout, orders, stock, concurrency, neon, route-handlers, tests]

provides:
  - Collision-resistant order references with second precision and random suffix
  - Transactional checkout helper that atomically decrements stock and writes order snapshots
  - Structured stock-conflict response contract for stale carts
  - Checkout route backed by database order persistence instead of app-level stock validation
  - Post-commit notification behavior where email failure does not erase persisted orders
  - Buyer-facing stock conflict message that preserves cart and form state
  - Confirmation page support for order item image snapshots

requirements-completed: [DB-04, ORD-01]
completed: 2026-04-26
---

# Phase 11 Plan 01 Summary

Implemented the transactional checkout foundation for Phase 11. Checkout now treats the database write as the source of truth: stock decrement and order/order-item persistence happen atomically before notification emails are attempted.

## What changed

### Transactional checkout persistence

- Added `placeCheckoutOrder()` in `src/db/orders.ts`.
- The helper aggregates duplicate checkout line items by `cardId` before writing.
- It validates positive integer quantities before hitting the database.
- It uses one parameterized raw SQL write through Drizzle `sql` + `db.execute`.
- The SQL locks requested card rows with `FOR UPDATE`, computes stock conflicts, decrements stock, inserts one `orders` row, and inserts denormalized `order_items` snapshots.
- It never uses `db.transaction()`; the Neon HTTP Drizzle driver does not support interactive transactions.
- Missing cards and short-stocked cards return structured `stock_conflict` data instead of partially decrementing inventory.

### Checkout route

- `POST /api/checkout` now delegates to `placeCheckoutOrder()` instead of loading all cards and validating stock in application code.
- Successful checkout returns HTTP 201 with `{ success, orderRef, order, notification }`.
- Stock conflicts return HTTP 409 with `code: "stock_conflict"` and conflict details.
- Database write failures return HTTP 503 and do not attempt email notification.
- Notification emails are sent only after the DB commit succeeds.
- Seller/buyer email failures are returned as notification flags but do not undo a placed order.

### Buyer UI

- Checkout client formats `stock_conflict` responses into a concrete buyer-facing message.
- The cart and form data are preserved for all checkout errors.
- Confirmation page now uses `OrderItem.imageUrl` snapshots when available.

### Order model

- `generateOrderRef()` now emits `ORD-YYYYMMDD-HHMMSS-XXXXXX` style refs with a random suffix to avoid same-minute collisions.
- `OrderItem` now allows `imageUrl?: string | null` for persisted order snapshots.
- `buildOrderData()` includes image URLs for legacy/non-DB order construction paths.

## Key files modified

- `src/db/orders.ts`
- `src/app/api/checkout/route.ts`
- `src/app/checkout/checkout-client.tsx`
- `src/app/confirmation/confirmation-client.tsx`
- `src/lib/order.ts`
- `src/lib/types.ts`

## Tests added

- `src/lib/__tests__/order.test.ts` — order-ref uniqueness and format.
- `src/db/__tests__/orders.test.ts` — transactional helper result mapping, stock conflict result mapping, invalid quantity guard, SQL guardrails (`FOR UPDATE`, `UPDATE cards`, `INSERT INTO orders`, `INSERT INTO order_items`, no `db.transaction(`).
- `src/app/api/checkout/__tests__/route.test.ts` — 201 success, post-commit notification failure still succeeds, 409 stock conflicts, 400 validation, 503 DB failures, and no legacy `getCards()` stock path.

## Verification

- `npx vitest run src/lib/__tests__/order.test.ts` — 1 passed after red/green cycle.
- `npx vitest run src/db/__tests__/orders.test.ts` — 4 passed after red/green cycle.
- `npx vitest run src/app/api/checkout/__tests__/route.test.ts` — 9 passed after red/green cycle.
- `npx vitest run src/lib/__tests__/order.test.ts src/db/__tests__/orders.test.ts src/app/api/checkout/__tests__/route.test.ts && npx tsc --noEmit` — passed.
- `git diff --check && npm test && npm run build` — passed:
  - 17 test files passed.
  - 149 tests passed.
  - Next.js production build passed.

### Concurrent checkout proof

Ran a disposable remote Neon proof with one sentinel card at quantity 1 and two concurrent `placeCheckoutOrder()` calls for that same card. No notification emails were sent because the proof used the DB helper directly.

Observed result:

```json
{
  "successCount": 1,
  "conflictCount": 1,
  "finalQuantity": 0,
  "persistedOrderCount": 1,
  "cleanup": {
    "cards_remaining": 0,
    "orders_remaining": 0
  }
}
```

The losing checkout returned `stock_conflict` with the sentinel card and `available: 0`. Cleanup removed both the sentinel card and sentinel order rows.

## Known notes

- This completes the checkout write path only. Admin order list/detail remains in `11-02`.
- The concurrent proof used the configured remote Neon database after explicit user approval and cleaned up its sentinel rows.
- Notification delivery audit columns remain deferred; notification flags are returned in the checkout response and failures are logged.
