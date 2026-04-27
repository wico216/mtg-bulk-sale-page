---
phase: 13-admin-order-workflow
plan: 01
status: complete
completed: 2026-04-27
requirements:
  - ORD-04
  - ORD-05
---

# 13-01 Summary: Order Workflow Basics

## What changed

Added the first operational workflow layer to admin orders.

Admin users can now:

- search `/admin/orders` by order reference, buyer name, or buyer email
- filter `/admin/orders` by `pending`, `confirmed`, or `completed` status
- open an order detail page and change status among `pending`, `confirmed`, and `completed`
- save a private internal note on an order
- reload the order detail page and see the persisted status/note state

## Schema and DB helper contract

`src/db/schema.ts` adds a nullable private admin note column:

```ts
adminNote: text("admin_note")
```

Schema application note:

- The configured database was updated with `ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note text` after explicit user approval.
- Verification confirmed `orders.admin_note` exists as nullable `text`.

`src/db/orders.ts` now exports workflow types and helper support:

```ts
export const ORDER_STATUSES = ["pending", "confirmed", "completed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface AdminOrdersParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: OrderStatus | "all";
}

export async function updateOrderWorkflow(
  input: UpdateOrderWorkflowInput,
): Promise<AdminOrderDetail | null>;
```

Behavior:

- `getAdminOrders({ q, status, page, limit })` filters in SQL, not in the browser.
- `q` matches order ID, buyer name, or buyer email with case-insensitive `ILIKE` search.
- `status` filters list/count queries when set to a concrete workflow state.
- `getOrderById()` returns `adminNote` for admin detail only.
- `updateOrderWorkflow()` updates only provided fields and returns the refreshed admin order detail.
- Blank internal notes normalize to `null`.

## API contract

Existing route extended:

```txt
GET /api/admin/orders?q=<query>&status=<pending|confirmed|completed|all>&page=<n>
```

Behavior:

- Auth remains enforced through `requireAdmin()`.
- Query params are forwarded to the DB helper.
- Invalid/unknown status values are treated as `all` for list filtering.

New mutation:

```txt
PATCH /api/admin/orders/[id]
```

Request:

```ts
{
  status?: "pending" | "confirmed" | "completed";
  adminNote?: string | null;
}
```

Success:

```ts
{ order: AdminOrderDetail }
```

Validation and failure behavior:

- `401/403` from `requireAdmin()`.
- `400` for invalid JSON/body shape.
- `400` when no supported fields are present.
- `400` for invalid status values.
- `400` for non-string notes or notes over 1000 characters.
- `404` when the order does not exist.

## UI behavior

`/admin/orders` now renders a server-backed GET filter form:

- search input
- status select
- filter button
- clear link
- filtered empty state copy
- pagination links preserving `q` and `status`

`/admin/orders/[id]` now renders an interactive workflow panel:

- status selector
- Save order workflow button
- internal note textarea with character count
- private-note helper copy: `Private admin-only note. Not shown to buyers.`
- success message after save
- error message on failed mutation while preserving local input
- `router.refresh()` after successful mutation so server-rendered order metadata refreshes

## Verification evidence

TDD/focused verification passed after implementation:

- `npx vitest run src/db/__tests__/orders-admin.test.ts src/app/api/admin/orders/__tests__/route.test.ts`
  - 2 files passed
  - 27 tests passed
- `npx tsc --noEmit`
- `npm test`
  - 22 files passed
  - 192 tests passed
- `git diff --check`
- `npm run build`
  - production build passed
  - route list includes `/admin/orders`, `/admin/orders/[id]`, `/api/admin/orders`, and `/api/admin/orders/[id]`

Browser and DB verification passed on `http://localhost:3000` with local admin auth state restored.

Disposable proof data:

- Inserted card: `phase13-smoke-1777298065-chk-1-normal-near_mint`
- Created checkout order through the storefront:
  - order ref: `ORD-20260427-135550-4DDB72`
  - buyer: `Phase 13 Buyer`
  - buyer email: `phase13-smoke-1777298065-buyer@example.com`
  - item: `Phase 13 Workflow Alpha`
  - total: `$1.75`

Browser proof:

- Storefront loaded the disposable card.
- Quick add placed it in the cart.
- Checkout completed and redirected to confirmation.
- Confirmation showed order ref, buyer email, item snapshot, and total.
- Admin order list search by buyer email with `status=pending` showed the order.
- Admin order list search by buyer email with `status=completed` showed `No orders found`.
- Admin order detail exposed status controls and internal note editing.
- Status changed to `confirmed` and internal note saved as `Ready for pickup after Phase 13 smoke.`
- Reloading the order detail preserved:
  - status value: `confirmed`
  - internal note value: `Ready for pickup after Phase 13 smoke.`
- Admin order list search by buyer email with `status=confirmed` showed the order.
- Admin order list search by order ref with `status=confirmed` showed the order.
- Browser console contained only expected local dev/HMR messages.
- Failed network logs: none captured.

DB proof after browser mutation:

```json
{
  "cardRows": [
    {
      "id": "phase13-smoke-1777298065-chk-1-normal-near_mint",
      "quantity": 1
    }
  ],
  "orderRows": [
    {
      "id": "ORD-20260427-135550-4DDB72",
      "buyerName": "Phase 13 Buyer",
      "buyerEmail": "phase13-smoke-1777298065-buyer@example.com",
      "status": "confirmed",
      "adminNote": "Ready for pickup after Phase 13 smoke.",
      "totalPrice": 175
    }
  ],
  "itemRows": [
    {
      "orderId": "ORD-20260427-135550-4DDB72",
      "cardId": "phase13-smoke-1777298065-chk-1-normal-near_mint",
      "name": "Phase 13 Workflow Alpha",
      "quantity": 1,
      "price": 175
    }
  ]
}
```

Cleanup proof:

```json
{
  "deletedItems": 1,
  "deletedOrders": 1,
  "deletedCards": 1,
  "remainingCards": 0,
  "remainingOrders": 0,
  "remainingItems": 0
}
```

A final browser reload of the filtered order list showed `No orders found` for the disposable order ref.

Privacy proof:

- Static privacy check passed: no `adminNote` or `admin_note` references exist in buyer-facing confirmation, checkout, cart, shared components, or checkout API paths.
- Admin note references are limited to DB/admin helper/API/test surfaces.

## Known limitations and deferred work

- Cancellation remains deferred to 13-02.
- Optional inventory restore on cancellation remains deferred to 13-02.
- Status values are intentionally limited to non-cancelled lifecycle states in 13-01: `pending`, `confirmed`, `completed`.
- Internal notes are private admin text only; they do not trigger buyer notifications.
- The local checkout smoke intentionally ran without `RESEND_API_KEY`; the post-commit notification warning was expected and non-blocking because order persistence, stock decrement, admin workflow, and cleanup all succeeded.
