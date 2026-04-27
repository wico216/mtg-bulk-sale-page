---
phase: 13-admin-order-workflow
plan: 02
status: complete
completed: 2026-04-27
requirements:
  - ORD-06
---

# 13-02 Summary: Order Cancellation and Inventory Restore

## What changed

Added safe admin order cancellation while preserving order history.

Admin users can now:

- cancel `pending` or `confirmed` orders from `/admin/orders/[id]`
- choose whether cancellation restores inventory quantities
- keep cancelled order records and item snapshots visible in order history
- see cancelled orders blocked from the normal status workflow
- see completed orders blocked from normal cancellation
- filter `/admin/orders` by `cancelled` status

## Schema and DB helper contract

`src/db/schema.ts` extends the existing Postgres enum:

```ts
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
]);
```

Schema application note:

- The configured database was updated with `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled'` after explicit user approval.
- Verification confirmed DB enum values: `pending`, `confirmed`, `completed`, `cancelled`.
- Existing orders were unchanged by the enum update.

`src/db/orders.ts` now exports:

```ts
export type OrderWorkflowStatus = "pending" | "confirmed" | "completed";
export type OrderStatus = OrderWorkflowStatus | "cancelled";

export async function cancelOrder(
  input: CancelOrderInput,
): Promise<CancelOrderResult>;
```

Cancellation behavior:

- `cancelOrder({ orderId, restoreInventory })` marks only `pending` or `confirmed` orders as `cancelled`.
- Completed orders return `{ ok: false, code: "completed_order" }` and are not changed.
- Missing orders return `{ ok: false, code: "not_found" }`.
- Already-cancelled orders are idempotent: they return success with `alreadyCancelled: true`, but restore quantity is `0`.
- Inventory restore runs only when `restoreInventory` is `true` and the order was just updated by the cancellation operation.
- Restore increments only existing `cards` rows matching `order_items.card_id`.
- Missing card rows are skipped and returned as `{ cardId, name, quantity }`; the helper does not recreate cards from partial snapshots.
- Order items remain unchanged after cancellation.

The SQL uses a locked target order plus a single CTE chain so restore work is guarded by the first successful cancellation update:

- `FOR UPDATE` on the target order
- cancellable status filter for `pending` / `confirmed`
- `updated_order` CTE
- restore CTE gated by `EXISTS (SELECT 1 FROM updated_order)`

## API contract

New route:

```txt
POST /api/admin/orders/[id]/cancel
```

Request:

```ts
{ restoreInventory: boolean }
```

Success:

```ts
{
  success: true;
  result: {
    ok: true;
    order: AdminOrderDetail;
    alreadyCancelled: boolean;
    restoredQuantity: number;
    restoredRows: number;
    skippedItems: Array<{ cardId: string; name: string; quantity: number }>;
  };
}
```

Validation and failure behavior:

- `401/403` from `requireAdmin()`.
- `400` for invalid JSON/body shape.
- `400` when `restoreInventory` is missing or not boolean.
- `404` for missing orders.
- `409` for completed orders.

Existing list route/filter behavior now accepts `cancelled` as a status filter.

## UI behavior

`/admin/orders/[id]` now includes a dedicated cancel-order panel:

- Copy says cancellation keeps order records and snapshots.
- Cancel action appears only for `pending` and `confirmed` orders.
- Confirmation is inline and destructive, but says `Cancel order`, not delete.
- `Restore inventory quantities for existing card rows` is an explicit checkbox.
- Restore checkbox defaults off.
- Success copy reports whether inventory was restored and whether rows were skipped.
- Cancelled orders show `This order is already cancelled.` and do not show the normal cancel action.
- Completed orders show `Completed orders cannot be cancelled through the normal workflow.` and do not show the normal cancel action.
- Cancelled orders cannot be moved through the normal status selector.

`/admin/orders` now supports `status=cancelled` filtering and shows cancelled badges.

## Verification evidence

TDD/focused verification passed:

- Red tests first failed for missing `cancelOrder`, missing cancel route, and enum missing `cancelled`.
- After implementation:
  - `npx vitest run src/db/__tests__/orders-admin.test.ts src/app/api/admin/orders/__tests__/route.test.ts src/db/__tests__/schema.test.ts`
  - 3 files passed
  - 49 tests passed

Full automated verification passed after browser work:

- `git diff --check`
- `npx vitest run src/db/__tests__/orders-admin.test.ts src/app/api/admin/orders/__tests__/route.test.ts src/db/__tests__/schema.test.ts`
  - 49 tests passed
- `npx tsc --noEmit`
- `npm test`
  - 22 files passed
  - 202 tests passed
- `npm run build`
  - production build passed
  - route list includes `/api/admin/orders/[id]/cancel`
- LSP diagnostics / TypeScript workspace diagnostics: no issues found

Automated tests cover:

- no-restore cancellation
- restore cancellation
- missing inventory row skip/report behavior
- completed-order rejection
- missing-order rejection
- already-cancelled idempotency
- restore guarded by first successful cancellation update
- route auth gating
- route body validation
- route success, 404, and 409 responses

## Browser and DB verification evidence

Browser verification ran on `http://localhost:3000` with local admin auth state restored.

Disposable setup:

- Inserted card: `phase13-cancel-1777299381-no-restore-normal-near_mint`
  - name: `Phase 13 Cancel No Restore`
  - initial quantity: `2`
- Inserted card: `phase13-cancel-1777299381-restore-normal-near_mint`
  - name: `Phase 13 Cancel Restore`
  - initial quantity: `2`

Storefront checkout proof:

- Created no-restore order through the storefront:
  - order ref: `ORD-20260427-141717-D1AE76`
  - buyer email: `phase13-cancel-1777299381-no-restore@example.com`
  - item: `Phase 13 Cancel No Restore`
  - total: `$2.00`
- Created restore order through the storefront:
  - order ref: `ORD-20260427-141745-AE0C0F`
  - buyer email: `phase13-cancel-1777299381-restore@example.com`
  - item: `Phase 13 Cancel Restore`
  - total: `$3.00`

Initial DB proof after checkout:

```json
{
  "cardRows": [
    {
      "id": "phase13-cancel-1777299381-no-restore-normal-near_mint",
      "quantity": 1
    },
    {
      "id": "phase13-cancel-1777299381-restore-normal-near_mint",
      "quantity": 1
    }
  ],
  "noRestore": [
    {
      "id": "ORD-20260427-141717-D1AE76",
      "status": "pending"
    }
  ],
  "restore": [
    {
      "id": "ORD-20260427-141745-AE0C0F",
      "status": "pending"
    }
  ]
}
```

No-restore cancellation proof:

- Opened `/admin/orders/ORD-20260427-141717-D1AE76`.
- Browser showed pending order detail and cancel-order panel.
- Opened inline cancel confirmation.
- Left restore checkbox off.
- Confirmed cancellation.
- Browser showed success copy: `Order cancelled. Inventory was not restored.`
- Reloaded order detail.
- Browser showed:
  - `cancelled`
  - `This order is already cancelled.`
  - `Cancelled orders cannot be moved through the normal status workflow.`
  - item snapshot still visible

DB proof after no-restore cancellation:

```json
{
  "cardRows": [
    {
      "id": "phase13-cancel-1777299381-no-restore-normal-near_mint",
      "quantity": 1
    }
  ],
  "orderRows": [
    {
      "id": "ORD-20260427-141717-D1AE76",
      "status": "cancelled"
    }
  ]
}
```

Restore cancellation proof:

- Opened `/admin/orders/ORD-20260427-141745-AE0C0F`.
- Browser showed pending order detail and cancel-order panel.
- Opened inline cancel confirmation.
- Checked restore inventory explicitly.
- Confirmed cancellation.
- Browser showed success copy: `Order cancelled. Restored 1 item across 1 inventory row.`
- Reloaded order detail.
- Browser showed:
  - `cancelled`
  - `This order is already cancelled.`
  - item snapshot still visible

DB proof after restore cancellation:

```json
{
  "cardRows": [
    {
      "id": "phase13-cancel-1777299381-no-restore-normal-near_mint",
      "quantity": 1
    },
    {
      "id": "phase13-cancel-1777299381-restore-normal-near_mint",
      "quantity": 2
    }
  ],
  "noRestore": [
    {
      "id": "ORD-20260427-141717-D1AE76",
      "status": "cancelled"
    }
  ],
  "restore": [
    {
      "id": "ORD-20260427-141745-AE0C0F",
      "status": "cancelled"
    }
  ]
}
```

Idempotency proof:

A second authenticated live API call to `POST /api/admin/orders/ORD-20260427-141745-AE0C0F/cancel` with `{ restoreInventory: true }` returned:

```json
{
  "success": true,
  "result": {
    "ok": true,
    "alreadyCancelled": true,
    "restoredQuantity": 0,
    "restoredRows": 0,
    "skippedItems": []
  }
}
```

Follow-up DB proof confirmed the restored card stayed at quantity `2`; it did not restore twice.

Cleanup proof:

```json
{
  "deletedItems": 2,
  "deletedOrders": 2,
  "deletedCards": 2,
  "remainingItems": 0,
  "remainingOrders": 0,
  "remainingCards": 0
}
```

A final browser reload of the cleaned-up order detail showed the expected 404 for the deleted disposable order.

Browser diagnostics:

- Console contained only expected local dev/HMR messages.
- Failed network logs: none captured during the cancellation workflow.
- The post-cleanup 404 was intentional after deleting the disposable order.

## Known limitations

- Missing inventory-row restoration was verified by automated tests, not by a browser-created missing-row fixture.
- Cancellation does not recreate inventory rows from order item snapshots; missing rows are reported and skipped by design.
- The `cancelled` Postgres enum addition is forward-only in normal Postgres operation.
- Cancelled orders preserve item snapshots and order history; there is no undo beyond future manual/admin operations.
- The local checkout smoke intentionally ran without `RESEND_API_KEY`; post-commit notification warnings are non-blocking because order persistence and cancellation proofs succeeded.
