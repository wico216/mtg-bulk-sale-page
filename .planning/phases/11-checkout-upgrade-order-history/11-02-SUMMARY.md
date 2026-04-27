---
phase: 11-checkout-upgrade-order-history
plan: 02
subsystem: admin-orders
tags: [admin, orders, route-handlers, server-components, browser-verification, tests]

provides:
  - Admin order listing query helper with pagination and newest-first ordering
  - Admin order detail query helper reading denormalized order_items snapshots
  - Auth-gated GET /api/admin/orders endpoint
  - Auth-gated GET /api/admin/orders/[id] endpoint
  - /admin/orders server-rendered order history page
  - /admin/orders/[id] server-rendered order detail page
  - Admin header navigation between Inventory and Orders

requirements-completed: [ORD-02, ORD-03]
completed: 2026-04-26
---

# Phase 11 Plan 02 Summary

Implemented the seller-facing order history surfaces on top of the transactional checkout foundation from 11-01.

## What changed

### Admin order query helpers

- `getAdminOrders({ page, limit })` was added to `src/db/orders.ts`.
- Order list results are sorted newest first by `created_at DESC, id DESC`.
- Pagination defaults to page 1 / limit 25 and caps limit at 100.
- Prices are converted from integer cents to dollars for API/UI consumers.
- `getOrderById(id)` was added to `src/db/orders.ts`.
- Order detail reads directly from `orders` and `order_items` snapshot rows, not current card records, so history survives inventory re-imports/deletes.

### Admin order APIs

- `GET /api/admin/orders` returns `{ orders, total, page, limit, totalPages }` and uses `requireAdmin()`.
- `GET /api/admin/orders/[id]` returns `{ order }`, uses `requireAdmin()`, and returns 404 for missing orders.
- API tests cover 401, 403, 404, pagination handoff, and detail shape.

### Admin UI

- Added `/admin/orders` as a server-rendered page with direct `auth()` + `isAdminEmail()` checks before rendering.
- Added `/admin/orders/[id]` as a server-rendered detail page with the same defense-in-depth auth check and `notFound()` for missing orders.
- Added presentational `OrdersTable` and `OrderDetail` components.
- Admin header now includes `Inventory` and `Orders` navigation links.
- Order table shows order ref, buyer name/email, date, item count, total, and status.
- Detail page shows buyer contact, optional message, order item snapshots, set/collector details, condition, quantity, unit price, line total, and order total.

### Checkout/browser support fixes

- `/checkout` now reads cards from the database via `getCards()` instead of stale static JSON, matching `/cart` and the checkout API source of truth.
- `Header` now delays rendering the cart-count badge until the persisted cart store has hydrated, fixing a browser-observed hydration mismatch when localStorage already contains cart contents.

## Key files modified

- `src/db/orders.ts`
- `src/app/api/admin/orders/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/admin/layout.tsx`
- `src/app/admin/orders/page.tsx`
- `src/app/admin/orders/[id]/page.tsx`
- `src/app/admin/orders/_components/orders-table.tsx`
- `src/app/admin/orders/_components/order-detail.tsx`
- `src/app/checkout/page.tsx`
- `src/components/header.tsx`

## Tests added

- `src/db/__tests__/orders-admin.test.ts` — admin order list/detail helpers, price conversion, pagination cap/defaults, SQL guardrails for newest-first ordering and snapshot reads.
- `src/app/api/admin/orders/__tests__/route.test.ts` — admin order list/detail API auth, pagination handoff, 404, and response shape.

## Verification

- Red test run confirmed missing 11-02 exports/routes before implementation:
  - `npx vitest run src/db/__tests__/orders-admin.test.ts src/app/api/admin/orders/__tests__/route.test.ts` failed with missing `getAdminOrders`, `getOrderById`, and admin order route modules.
- Focused implementation verification:
  - `npx vitest run src/db/__tests__/orders-admin.test.ts src/app/api/admin/orders/__tests__/route.test.ts` — 14 passed.
  - `npx tsc --noEmit` — passed.
- Full verification after UI and header fixes:
  - `git diff --check && npx tsc --noEmit && npm test && npm run build` — passed.
  - Full test suite: 19 files passed, 163 tests passed.
  - Next production build passed and listed `/admin/orders`, `/admin/orders/[id]`, `/api/admin/orders`, and `/api/admin/orders/[id]` as dynamic routes.

### Browser verification

Ran local browser verification against the configured Neon database using a disposable sentinel card. The dev server was started with email sending disabled by overriding the email API key empty so checkout persistence could be verified without sending real messages.

Verified flow:

1. Inserted sentinel card `Phase 11 Browser Sentinel` with quantity 2.
2. Seeded browser cart with quantity 1 and opened `/checkout`.
3. Checkout summary showed the sentinel card and `$2.50` total.
4. Submitted checkout for `Phase 11 Browser Buyer` with optional message `Browser verification order history check`.
5. Confirmation loaded with order `ORD-20260427-031412-FA8787` and the sentinel order snapshot.
6. `/admin/orders` showed the order ref, buyer name/email, date, item count `1`, total `$2.50`, and status `pending`.
7. `/admin/orders/ORD-20260427-031412-FA8787` showed buyer contact, optional message, `Phase 11 Browser Sentinel`, `TST #11`, set name, `NM`, `$2.50 × 1`, and `$2.50` line/order totals.
8. `/admin` inventory search showed the sentinel card quantity decremented to `1` and marked `Low`.
9. Final browser console logs: none.
10. Final failed network logs: none.
11. Cleanup deleted the sentinel order and card; verification query returned `cards_remaining: 0` and `orders_remaining: 0`.

## Known notes

- Order status remains read-only (`pending`, with existing enum support for later statuses). Status editing is deferred.
- The browser auth state for verification was generated locally from existing auth env values without exposing or typing credentials.
- Disposable browser verification rows were removed from the remote database after proof.
