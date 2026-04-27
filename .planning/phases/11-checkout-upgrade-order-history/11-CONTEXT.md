# Phase 11: Checkout Upgrade & Order History - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Checkout moves from email-only submission to a database-backed order workflow. A successful checkout atomically decrements stock and writes an order + order item snapshots. The seller can then review order history in the admin panel. Payment still happens in person, buyer accounts remain out of scope, and fulfillment/status management beyond read-only order history is deferred unless already supported by the existing `status` column.

Phase 11 owns:
- transactional stock protection for checkout
- persisted order records and denormalized order item snapshots
- public checkout error handling for stale carts / insufficient stock
- admin order list and order detail pages

Phase 11 does not own:
- online payment
- buyer accounts / buyer order history
- bulk inventory dashboard metrics (Phase 12)
- changing CSV import semantics
- full order fulfillment workflow beyond showing existing status

</domain>

<decisions>
## Implementation Decisions

### Transaction and source of truth
- **D-01:** Database commit is the source of truth for checkout. If the stock decrement + order insert commits, the order is placed.
- **D-02:** Notification emails are post-commit side effects. Seller/buyer email failures are logged and surfaced through order/admin visibility where practical, but they do not erase a successfully committed order.
- **D-03:** The stock decrement and order insert must be one atomic database operation. Two simultaneous checkouts for the last copy of a card must produce one success and one conflict, never a negative quantity or duplicate sale.
- **D-04:** Use a single raw SQL statement with CTEs and `SELECT ... FOR UPDATE` row locks for the checkout write, executed through Drizzle's raw `sql` template / `db.execute` path. Do not use `db.transaction()` because the Neon HTTP Drizzle driver does not support interactive transactions; do not use `db.batch()` for this flow because partial stock updates must be globally gated across all requested cards.
- **D-05:** Lock card rows in deterministic card-id order to reduce deadlock risk when two carts overlap.

### Order data
- **D-06:** Order item rows are denormalized snapshots. They keep card name, set, collector number, condition, price, quantity, line total, and image URL at the time of checkout so history survives later CSV replacement or card deletion.
- **D-07:** Order references must be collision-resistant. The current `ORD-YYYYMMDD-HHMM` format can collide within a minute; Phase 11 should include seconds plus a short random suffix or another compact unique component.
- **D-08:** Server-side totals are authoritative. The checkout request supplies only buyer fields and `{ cardId, quantity }`; prices, names, and line totals are computed from current database rows.

### Checkout API behavior
- **D-09:** `POST /api/checkout` keeps the same request shape for the client but returns a more explicit error code on stock conflicts.
- **D-10:** Success returns an order payload suitable for the existing confirmation page and sessionStorage handoff.
- **D-11:** Insufficient stock returns HTTP 409 with machine-readable `code: "stock_conflict"` and structured conflicts. Validation remains 400, database outage remains 503, unexpected failures remain 500.
- **D-12:** On stock conflict, the checkout UI preserves the cart and form data and tells the buyer which cards changed. It must not clear the cart.

### Admin order history
- **D-13:** Add `/admin/orders` as a first-class admin route with a table of past orders: order ref, buyer, date, total items, total price, status.
- **D-14:** Add `/admin/orders/[id]` for full order detail: buyer contact, optional message, item snapshots, quantities, prices, and total.
- **D-15:** Add simple admin header navigation between Inventory and Orders. No sidebar yet.
- **D-16:** Use paginated admin order APIs or query helpers; default 25 rows, max 100. Offset pagination is acceptable for this small admin-only dataset.

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — DB-04, ORD-01, ORD-02, ORD-03
- `.planning/ROADMAP.md` — Phase 11 success criteria

### Prior phase decisions
- `.planning/phases/05-checkout-and-deploy/05-CONTEXT.md` — checkout UX, notification semantics, confirmation page behavior
- `.planning/phases/08-authentication/08-CONTEXT.md` — admin auth and 401/403 JSON conventions
- `.planning/phases/09-admin-inventory-management/09-CONTEXT.md` — admin layout and table conventions
- `.planning/phases/10-csv-import/10-CONTEXT.md` — Neon HTTP transaction limitations and full-replace inventory behavior
- `.planning/phases/10.1-multi-csv-delete-inventory/10.1-01-SUMMARY.md` — latest admin auth/browser verification context

### Current code to read before execution
- `src/db/schema.ts` — existing `orders` and `order_items` tables
- `src/db/client.ts` — Drizzle Neon HTTP client
- `src/db/queries.ts` — existing card queries and `replaceAllCards` constraints
- `src/app/api/checkout/route.ts` — current email-only checkout route
- `src/lib/order.ts` — order ref generation and `OrderData` construction
- `src/lib/notifications.ts` — Resend notification pipeline
- `src/lib/types.ts` — checkout and order types
- `src/app/checkout/checkout-client.tsx` — checkout form and error UI
- `src/app/confirmation/confirmation-client.tsx` — confirmation page sessionStorage handoff
- `src/app/admin/layout.tsx` — admin header to receive Orders nav
- `src/app/admin/page.tsx` and `_components/*` — admin UI patterns

</canonical_refs>

<code_context>
## Existing Code Insights

### Already present
- `orders` and `orderItems` schema exist in `src/db/schema.ts`.
- `order_items` already has no FK to `cards`, which is correct for snapshot history surviving imports/deletes.
- `orderItems.imageUrl` exists, but `OrderItem` in `src/lib/types.ts` does not currently expose image URL.
- `POST /api/checkout` currently validates stock in application code by loading all cards, sends email, and does not persist orders or decrement stock.
- `generateOrderRef()` currently has minute precision and is unsafe as a primary key under concurrent orders.
- Admin auth helpers and patterns already exist through `auth()`, `isAdminEmail()`, and `requireAdmin()`.

### Risk points
- The core risk is atomicity under concurrency. App-level stock validation is insufficient because two requests can validate the same last copy before either writes.
- `db.batch()` is useful for all-or-nothing statement batches, but it cannot inspect intermediate update counts to avoid partial multi-card decrements. The checkout write needs a globally gated SQL statement with row locks.
- Email is outside the database transaction. Treating email as the source of truth would create harder failure modes than treating the persisted order as source of truth.
- Order ref collision must be fixed before inserting into `orders.id`.

</code_context>

<specifics>
## Specific Interface Sketch

### `POST /api/checkout`

Request remains:
```typescript
{
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: Array<{ cardId: string; quantity: number }>;
}
```

Success: HTTP 201
```typescript
{
  success: true;
  orderRef: string;
  order: OrderData;
  notification: {
    sellerEmailSent: boolean;
    buyerEmailSent: boolean;
  };
}
```

Stock conflict: HTTP 409
```typescript
{
  success: false;
  code: "stock_conflict";
  error: "Some cards are no longer available.";
  conflicts: Array<{
    cardId: string;
    name: string;
    requested: number;
    available: number;
  }>;
}
```

### Admin orders

`GET /api/admin/orders?page=1&limit=25`
```typescript
{
  orders: Array<{
    id: string;
    buyerName: string;
    buyerEmail: string;
    totalItems: number;
    totalPrice: number;
    status: "pending" | "confirmed" | "completed";
    createdAt: string;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

`GET /api/admin/orders/:id`
```typescript
{
  order: OrderData & {
    status: "pending" | "confirmed" | "completed";
  };
}
```

</specifics>

<deferred>
## Deferred Ideas

- Admin status editing (`pending -> completed`) — useful later but not required for ORD-02/ORD-03.
- Buyer account order history — future BUYER-01.
- Email delivery audit columns — useful if notification failures become common, but not required for Phase 11 unless implementation shows it is cheap and low-risk.
- Idempotency keys for checkout retries — valuable, but can be deferred unless duplicate submission appears during testing. The button already disables while submitting.

</deferred>

---

*Phase: 11-checkout-upgrade-order-history*
*Context gathered: 2026-04-26*
*
*Context gathered: 2026-04-26*
