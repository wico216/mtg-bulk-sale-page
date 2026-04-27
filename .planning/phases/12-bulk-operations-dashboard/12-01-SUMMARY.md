---
phase: 12-bulk-operations-dashboard
plan: 01
status: complete
completed: 2026-04-26
requirements:
  - DASH-01
  - DASH-02
---

# 12-01 Summary: Admin Dashboard Stats

## What changed

Added an inventory dashboard to the existing `/admin` page above the inventory table.

The dashboard now shows:

- Unique cards
- Total quantity
- Total inventory value
- Low-stock card count
- Missing-price count
- Breakdown by set
- Breakdown by color identity
- Breakdown by rarity

## Helper contract

`src/db/queries.ts` now exports:

```ts
export interface AdminDashboardStats {
  inventory: {
    uniqueCards: number;
    totalQuantity: number;
    totalValue: number;
    lowStockCount: number;
    missingPriceCount: number;
  };
  breakdowns: {
    bySet: Array<AdminDashboardBreakdown & { setCode: string }>;
    byColor: Array<AdminDashboardBreakdown & { color: string }>;
    byRarity: Array<AdminDashboardBreakdown & { rarity: string }>;
  };
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats>
```

Behavior:

- Reads only the card fields needed for dashboard aggregation.
- Returns UI-facing values in dollars, while DB values remain cents internally.
- Treats null prices as missing and as `$0` for value math.
- Normalizes empty color identity to `C` / Colorless.
- Sorts multi-color identities by WUBRG order, producing stable labels such as `WU`.
- Sorts breakdown rows by quantity descending, then label ascending.
- Handles empty inventory with zero totals and empty breakdown arrays.

## UI placement

`src/app/admin/page.tsx` keeps its direct server-side admin auth checks, then loads `getAdminDashboardStats()` and renders:

1. Inventory page heading
2. `DashboardSummary`
3. Existing `InventoryTable`

`src/app/admin/_components/dashboard-summary.tsx` is a server-safe presentational component. It does not use client state.

Because dashboard stats are server-rendered while `InventoryTable` performs client-side inventory mutations, the existing successful mutation paths now call `router.refresh()` after local reconciliation:

- inline edit save
- single-card delete
- delete-all inventory

This keeps dashboard totals from drifting after existing admin actions.

## Verification evidence

Automated verification passed:

- `npx vitest run src/db/__tests__/dashboard-stats.test.ts`
  - 2 tests passed
- `npx tsc --noEmit`
- `git diff --check`
- `npm test`
  - 20 files passed
  - 165 tests passed
- `npm run build`
  - production build passed

Browser verification passed on `http://localhost:3000/admin` with local admin auth state restored.

Non-empty disposable DB proof:

- Inserted 3 sentinel cards:
  - `phase12-dashboard-1777261444-lea-1-normal-near_mint`
  - `phase12-dashboard-1777261444-mh2-2-normal-lightly_played`
  - `phase12-dashboard-1777261444-sld-3-normal-near_mint`
- Browser confirmed dashboard showed:
  - `UNIQUE CARDS 3`
  - `TOTAL QUANTITY 6`
  - `TOTAL INVENTORY VALUE $8.75`
  - `LOW STOCK 1`
  - `MISSING PRICES 1`
  - set breakdowns `LEA`, `SLD`, `MH2`
  - color breakdowns `R`, `WU`, `C / Colorless`
  - rarity breakdowns `Common`, `Rare`, `Uncommon`
- Browser confirmed the existing inventory table rendered below dashboard with the sentinel rows.
- Console logs: none.
- Failed network logs: none.

Cleanup proof:

- Deleted all 3 sentinel cards.
- DB cleanup reported `remaining: 0` for the sentinel IDs.
- Browser reload confirmed empty dashboard state:
  - zero totals
  - empty breakdown messages
  - existing empty inventory table state
- Final console logs: none.
- Final failed network logs: none.

## Known limitations / deferred ideas

- Dashboard remains inventory-only. Order KPIs remain deferred.
- Breakdown cards are compact text summaries, not charts.
- Dashboard stats refresh after existing successful table mutations via `router.refresh()`, not a dedicated client data subscription.
- Bulk delete dashboard refresh will be handled in 12-02 using the same refresh pattern.
