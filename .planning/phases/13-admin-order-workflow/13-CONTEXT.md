# Phase 13: Admin Order Workflow - Context

**Gathered:** 2026-04-27
**Status:** Planned

<domain>
## Phase Boundary

Phase 13 turns order history into an order workflow. Phase 11 proved that checkout persists orders and Phase 12 proved the admin panel can safely mutate inventory. The next gap is the seller's after-checkout work: confirm an order, mark it complete, cancel it when needed, and find orders quickly.

Phase 13 owns:
- admin order status changes
- internal admin notes on orders
- order list search and status filtering
- cancellation flow with an explicit optional inventory restore
- authenticated APIs/query helpers needed for those workflows

Phase 13 does not own:
- online payment or paid/unpaid settlement
- shipping labels or shipping addresses
- buyer accounts or buyer-facing order lookup
- automated email notifications for status changes
- a full audit log/history page; that belongs to Phase 14
- broad production rate limiting or health dashboards; that belongs to Phase 15

</domain>

<decisions>
## Implementation Decisions

### Order lifecycle
- **D-01:** Add `cancelled` as an explicit order status instead of treating cancellation as a note or deletion. Orders are business records and should remain visible after cancellation.
- **D-02:** Keep the lifecycle simple: `pending`, `confirmed`, `completed`, `cancelled`. No payment/shipping-specific states until the store actually needs payment/shipping.
- **D-03:** Order status changes must be admin-only and must preserve existing order item snapshots.
- **D-04:** `completed` orders should not be casually cancelled from the UI. If cancellation is allowed later, it should be a separate override path with clear copy.

### Notes
- **D-05:** Store one internal admin note field on the order for now. Threaded comments are unnecessary for a single-admin store.
- **D-06:** Admin notes are private operational context. They should never appear on buyer confirmation pages or public storefront pages.

### Cancellation and restore
- **D-07:** Cancellation and inventory restore are separate choices in one explicit flow. Cancelling an order should not silently change inventory.
- **D-08:** Restore should increment quantities only for inventory rows that still exist by `card_id`. If a row was removed by import/delete, do not recreate it from the order snapshot in Phase 13 because the snapshot does not carry full card metadata such as rarity and color identity.
- **D-09:** The cancellation result should report restored and skipped item counts so the admin knows whether inventory was changed.

### Search/filter
- **D-10:** Order search should cover order ref, buyer name, and buyer email. This supports the common support workflow: a buyer asks about an order and the seller has one identifier.
- **D-11:** Status filtering belongs on `/admin/orders`. Date range and export can wait unless Phase 13 implementation remains smaller than expected.

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — ORD-04, ORD-05, ORD-06
- `.planning/ROADMAP.md` — Phase 13 success criteria

### Prior phase context
- `.planning/phases/11-checkout-upgrade-order-history/11-CONTEXT.md` — transactional checkout and order snapshot boundary
- `.planning/phases/11-checkout-upgrade-order-history/11-02-SUMMARY.md` — current order list/detail contracts
- `.planning/phases/12-bulk-operations-dashboard/12-02-SUMMARY.md` — safe destructive confirmation and disposable DB proof pattern

### Current code to read before execution
- `src/db/schema.ts` — current `order_status` enum and order/order_item columns
- `src/db/orders.ts` — checkout placement, admin list/detail helpers
- `src/app/admin/orders/page.tsx` — current server-rendered order list
- `src/app/admin/orders/[id]/page.tsx` — current server-rendered order detail
- `src/app/admin/orders/_components/orders-table.tsx` — list UI to extend with search/filter
- `src/app/admin/orders/_components/order-detail.tsx` — detail UI to extend with workflow controls
- `src/app/api/admin/orders/route.ts` and `[id]/route.ts` — admin auth conventions
- `src/lib/auth/admin-check.ts` — `requireAdmin()` conventions for mutation routes

</canonical_refs>

<code_context>
## Existing Code Insights

### Already present
- Checkout writes `orders` and `order_items` in one atomic DB flow and decrements stock.
- Admin order list/detail already use snapshot rows, not current inventory rows.
- The order status enum currently supports `pending`, `confirmed`, and `completed`.
- Admin pages perform direct server-side auth checks instead of relying only on route protection.
- Admin mutation APIs use `requireAdmin()` and return JSON with 401/403/4xx/5xx conventions.

### Risk points
- PostgreSQL enum changes require care. Adding `cancelled` is additive, but execution must verify the schema update path against Neon before relying on the new value.
- Restoring cancelled order inventory can be wrong if the corresponding card row no longer exists after a full import. Phase 13 should report skipped restores rather than recreating partial cards.
- Status controls should be idempotent enough for accidental double-clicks or retries.
- Search/filter should not fetch all orders client-side if the order table grows. Keep filtering in the DB/helper layer.

</code_context>

<specifics>
## Specific Interface Sketch

### Order workflow helper

```typescript
export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface UpdateOrderWorkflowInput {
  orderId: string;
  status?: OrderStatus;
  adminNote?: string | null;
}

export interface CancelOrderInput {
  orderId: string;
  restoreInventory: boolean;
}

export interface CancelOrderResult {
  orderId: string;
  status: "cancelled";
  restoredItems: number;
  restoredQuantity: number;
  skippedItems: Array<{ cardId: string; name: string; quantity: number; reason: "missing_inventory_row" }>;
}
```

### Routes

- `PATCH /api/admin/orders/[id]` — update status and/or internal note
- `POST /api/admin/orders/[id]/cancel` — cancel with `{ restoreInventory: boolean }`
- `GET /api/admin/orders?status=pending&q=buyer@example.com&page=1` — filtered order list

</specifics>

<deferred>
## Deferred Ideas

- Buyer-facing order lookup and status page.
- Status-change emails.
- Payment and shipping statuses.
- Full order audit timeline; Phase 14 adds a broader audit trail.
- Recreating missing inventory rows from cancelled order snapshots; current snapshots are not complete card records.
</deferred>

---

*Phase: 13-admin-order-workflow*
*Context gathered: 2026-04-27*
