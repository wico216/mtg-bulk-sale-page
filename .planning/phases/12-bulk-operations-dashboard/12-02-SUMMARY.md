---
phase: 12-bulk-operations-dashboard
plan: 02
status: complete
completed: 2026-04-26
requirements:
  - INV-04
---

# 12-02 Summary: Bulk Inventory Delete

## What changed

Added selected-row bulk deletion to the admin inventory table.

Admin users can now:

- select individual inventory rows with checkboxes
- select all rows on the current visible page
- see the selected row count
- open an inline confirmation for selected-row deletion
- delete selected rows without invoking the full-inventory delete path

## API and helper contract

`src/db/queries.ts` now exports:

```ts
export async function deleteCardsByIds(
  ids: string[],
): Promise<{ deleted: number; ids: string[] }>
```

Behavior:

- De-dupes requested IDs.
- Uses one database delete statement with `WHERE id IN (...) RETURNING id`.
- Returns actual deleted row IDs, not merely requested IDs.
- Returns `{ deleted: 0, ids: [] }` without touching the DB for empty helper input.

New route:

```txt
POST /api/admin/cards/bulk-delete
```

Request:

```ts
{ ids: string[] }
```

Success:

```ts
{ success: true; deleted: number; ids: string[] }
```

Validation and failure behavior:

- `400` for missing, empty, non-array, blank, non-string, invalid JSON, or over-500 ID payloads.
- `401/403` from `requireAdmin()`.
- `500` with `Bulk delete failed — inventory unchanged` when the helper throws.
- Route tests prove it calls `deleteCardsByIds()` and does not call `deleteAllCards()`.

## UI behavior

`InventoryTable` now manages `selectedCardIds` and renders:

- a header checkbox for select-all-current-page
- per-row selection checkboxes
- a selected-count pill in `ActionBar`
- `Delete selected` button
- a selected-row confirmation panel distinct from the full-inventory delete confirmation

Selection behavior:

- Selecting rows updates the count.
- Select-all applies only to rows on the current visible page.
- Selection clears when filters, page, or sort order changes.
- Successful bulk delete removes selected rows locally, decrements totals, clears selection, shows a success toast, and calls `router.refresh()` so server-rendered dashboard stats refresh.
- Failed bulk delete keeps selection and shows an error toast.

## Verification evidence

Automated verification passed:

- `npx vitest run src/db/__tests__/bulk-delete-cards.test.ts src/app/api/admin/cards/__tests__/bulk-delete-route.test.ts`
  - 2 files passed
  - 14 tests passed
- `npx tsc --noEmit`
- `git diff --check`
- `npm test`
  - 22 files passed
  - 179 tests passed
- `npm run build`
  - production build passed
  - route list includes `/api/admin/cards/bulk-delete`

Browser and DB verification passed on `http://localhost:3000/admin` with local admin auth state restored.

Disposable DB proof:

- Inserted 3 sentinel cards:
  - selected target: `phase12-bulk-1777262104-lea-1-normal-near_mint`
  - selected target: `phase12-bulk-1777262104-mh2-2-normal-near_mint`
  - unselected keep row: `phase12-bulk-1777262104-sld-3-normal-near_mint`
- Browser confirmed initial table showed all 3 rows and `0 selected`.
- Selected the two target rows and confirmed `2 selected`.
- Clicked `Delete selected` and confirmed inline prompt:
  - `Delete 2 selected cards?`
  - `This removes only the selected rows.`
- Confirmed deletion.
- Browser wait observed success toast: `Deleted 2 selected cards.`
- Browser confirmed durable state after mutation:
  - selected rows no longer present in DOM
  - unselected row still present
  - selected count reset to `0 selected`
  - dashboard refreshed to 1 unique card, quantity 3, `$9.00` total value
- DB proof after mutation:
  - `selected_remaining: 0`
  - `keep_remaining: 1`
- Cleanup deleted the remaining keep row:
  - `cleanup_deleted: 1`
  - `remaining: 0`
- Browser reload confirmed clean empty inventory state.
- Failed network logs: none.
- Console output contained only expected local dev/HMR messages; no browser errors were observed.

## Known limitations

- Select-all means current visible page only.
- Cross-page “select all matching filters” remains deferred.
- There is no undo/version history; CSV export remains the backup path before destructive operations.
- Success toast is intentionally short-lived and may auto-dismiss before a later assertion; DB/browser durable state is the source of truth after deletion.
