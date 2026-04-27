# Phase 12: Bulk Operations & Dashboard - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 finishes the v1.1 admin workflow by making inventory operations faster and giving the seller an at-a-glance picture of store health.

Phase 12 owns:
- inventory dashboard stats on the admin inventory page
- inventory breakdowns by set, color identity, and rarity
- bulk selection and bulk delete for inventory rows
- authenticated admin APIs/query helpers needed for those features

Phase 12 does not own:
- order fulfillment/status editing
- buyer accounts or buyer order history
- payment/settlement workflows
- new CSV import semantics
- version history or undo beyond existing CSV export-before-delete guidance
- a separate analytics product or reporting dashboard

</domain>

<decisions>
## Implementation Decisions

### Dashboard placement
- **D-01:** Keep `/admin` as the Inventory page and add dashboard stat cards above the existing inventory table instead of introducing a separate `/admin/dashboard` route. This preserves the current admin mental model: land in inventory, see the store snapshot, then act.
- **D-02:** Dashboard stats should be server-rendered on `/admin` using direct DB query helpers. They are read-only and do not need client state or a separate fetch cycle.
- **D-03:** Dashboard breakdowns should be compact and operational, not analytics-heavy: top sets, color identity counts, rarity counts, low-stock count, total unique cards, total quantity, and total inventory value. Order KPIs remain deferred unless a future phase explicitly expands the dashboard beyond inventory health.

### Bulk delete
- **D-04:** Bulk delete should use a dedicated authenticated route instead of overloading `DELETE /api/admin/cards`, because that route already means delete the full inventory. Use an explicit action route such as `POST /api/admin/cards/bulk-delete` with `{ ids: string[] }`.
- **D-05:** Bulk delete must be explicit and reversible only through backup/import. The UI should show the selected count and require an inline confirmation before mutation, similar to the existing delete-all confirmation.
- **D-06:** Bulk selection operates on the currently visible/paginated rows. Select-all means “select all rows on this page,” not “select every matching row across all pages,” unless a future phase adds cross-page selection semantics.
- **D-07:** Bulk deletion should update the local table state after success and clear selections. It should not force a full page reload unless implementation proves local reconciliation too brittle.

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — INV-04, DASH-01, DASH-02
- `.planning/ROADMAP.md` — Phase 12 success criteria

### Prior phase context
- `.planning/phases/09-admin-inventory-management/09-03-PLAN.md` — existing admin inventory UI contract
- `.planning/phases/10.1-multi-csv-delete-inventory/10.1-01-SUMMARY.md` — delete-all route/helper and destructive confirmation pattern
- `.planning/phases/11-checkout-upgrade-order-history/11-02-SUMMARY.md` — order helper/API/page patterns and admin nav state

### Current code to read before execution
- `src/db/queries.ts` — existing admin card list/edit/delete/export/delete-all helpers
- `src/db/orders.ts` — Phase 11 order stats/query context
- `src/db/schema.ts` — card/order table fields for stats and breakdowns
- `src/app/admin/page.tsx` — server auth check and InventoryTable render point
- `src/app/admin/_components/inventory-table.tsx` — main client table state and mutation logic
- `src/app/admin/_components/action-bar.tsx` — existing delete inventory/import/export actions
- `src/app/admin/_components/delete-confirmation.tsx` — inline confirmation pattern
- `src/app/admin/_components/toast.tsx` — success/error feedback
- `src/app/api/admin/cards/route.ts` and `[id]/route.ts` — existing auth conventions for admin card APIs

</canonical_refs>

<code_context>
## Existing Code Insights

### Already present
- `/admin` is a server component with direct `auth()` + `isAdminEmail()` checks before rendering `InventoryTable`.
- `InventoryTable` is a client component that fetches `/api/admin/cards`, manages filters/sort/pagination, and already handles single-card delete and delete-all inventory.
- `ActionBar` already carries destructive actions and can be extended or complemented with bulk selection controls.
- `deleteAllCards()` and `DELETE /api/admin/cards` exist for full-inventory wipe, so bulk-delete must be a distinct route/helper to avoid ambiguous destructive behavior.
- `cards` rows include price cents, quantity, set, rarity, color identity, and timestamps needed for inventory stats.
- Server-rendered dashboard stats above a client table can become stale after client-side edits/deletes unless the table triggers an App Router refresh after successful mutations.

### Risk points
- Bulk delete is destructive and easy to confuse with delete-all; copy and route naming must make the scope obvious.
- Client-side table state already has many concerns; avoid turning `InventoryTable` into an unbounded component if small child components can isolate bulk-selection UI.
- Dashboard stats must treat null prices as zero for total value while still making “missing prices” visible if that matters.
- Color identity is a text array; grouping should normalize empty arrays to `C`/Colorless and multi-color cards to a stable sorted label such as `WU`.
- Rarity/set/color breakdowns should not require scanning from the client; compute them in SQL or a DB helper and pass ready-to-render data.

</code_context>

<specifics>
## Specific Interface Sketch

### Dashboard helper

```typescript
export interface AdminDashboardStats {
  inventory: {
    uniqueCards: number;
    totalQuantity: number;
    totalValue: number;
    lowStockCount: number;
    missingPriceCount: number;
  };
  breakdowns: {
    bySet: Array<{ setCode: string; quantity: number; uniqueCards: number; value: number }>;
    byColor: Array<{ color: string; quantity: number; uniqueCards: number; value: number }>;
    byRarity: Array<{ rarity: string; quantity: number; uniqueCards: number; value: number }>;
  };
}
```

### Bulk delete route

`POST /api/admin/cards/bulk-delete`

Request:
```typescript
{ ids: string[] }
```

Success:
```typescript
{ success: true; deleted: number; ids: string[] }
```

Validation failures:
- 400 if `ids` is missing, empty, too large, or contains non-string IDs
- 401/403 from `requireAdmin()`
- 500 with “Bulk delete failed — inventory unchanged” if DB write fails

</specifics>

<deferred>
## Deferred Ideas

- Cross-page “select all matching filters” bulk operations — useful later but risky/ambiguous for this small admin dataset.
- Undo/version history — still out of scope; CSV export before destructive operations remains the backup path.
- Order status editing and fulfillment workflow — deferred from Phase 11.
- Separate dashboard route or charts-heavy analytics — unnecessary for the v1.1 admin workflow.
</deferred>

---

*Phase: 12-bulk-operations-dashboard*
*Context gathered: 2026-04-26*
