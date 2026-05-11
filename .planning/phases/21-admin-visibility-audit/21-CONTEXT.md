# Phase 21: Admin Visibility & Audit - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface binder context everywhere the admin needs it: a `Binder` column + filter on `/admin/inventory`; a `[binder]` annotation on every line of `/admin/orders/[id]` (read from the `order_items.binder` snapshot, NOT joined to live `cards`); the `/admin/audit` page renders the new `ScopedImportAuditMetadata` fields (selected/new/missing binders + per-binder before/after counts) in a compact human-readable form.

</domain>

<decisions>
## Implementation Decisions

### Inventory binder column + filter
- **D-01:** New `Binder` column in `/admin/inventory` table. Position: after `Condition`, before `Quantity` (admin sees binder context next to other physical-state columns). Display: lowercase normalized form (matches Phase 17 D-04 storage convention).
- **D-02:** Binder filter UX: single-select dropdown above the table, populated from `SELECT DISTINCT binder FROM cards ORDER BY binder ASC`. Default "All binders". Mirrors the existing `Set` and `Condition` filter dropdowns in the inventory table (consistency over novelty).
- **D-03:** Filter selection persists in URL search params (matches existing `q`, `set`, `condition` filter pattern at `/admin/inventory?q=&binder=A02`). Server-side filter via `if (binder) conditions.push(eq(cards.binder, binder))` in `getAdminCards()`.
- **D-04:** Bulk-edit-binder workflow (research P2 ADM-FUT-02 — "consolidate A02 into A07") explicitly DEFERRED to v1.3.x. Rationale: the allocator's smallest-first pick order (Phase 18 D-01) passively consolidates over time; manual bulk-edit is nice-to-have but not v1.3-critical.

### Order detail [binder] annotation
- **D-05:** `[binder]` annotation appears INLINE on every line item of the order detail page. Display: small gray pill `[A02]` after the card name, matching the existing condition pill styling (Phase 11 set this pattern). Tailwind: `bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded ml-2`.
- **D-06:** Source: `order_items.binder` snapshot column (added Phase 16 D-09; populated Phase 18 D-11). NEVER joined to live `cards` — survives subsequent re-imports that delete the source row.
- **D-07:** Multi-binder same-card lines render as MULTIPLE rows in the order detail (one per allocation per binder source — matches Phase 18 D-10's order_items shape). Example display:
  ```
  Lightning Bolt — NM — [A02]   × 1   $0.50
  Lightning Bolt — NM — [A05]   × 2   $1.00
  ```
- **D-08:** Historical pre-v1.3 `order_items` rows have `binder='unsorted'` from the migration default (Phase 16 D-09). Render as `[unsorted]` to be EXPLICIT. Operator gets the signal that this order predates the v1.3 binder system; behaviorally safer than silently omitting the annotation.

### Audit page metadata rendering
- **D-09:** `/admin/audit` page renders the new `ScopedImportAuditMetadata` fields (selectedBinders, newBindersInExport, missingBindersFromExport, scopedReplaceCounts.before/after, totalCardsAfterImport) for `inventory.import_commit` audit entries.
- **D-10:** Display strategy: COLLAPSED BY DEFAULT with a "Show details" expander per row. Expanded view shows a small structured summary:
  ```
  Selected binders (3): A07, foundation box, lord of the rings
  New: A14
  Missing: (none)
  Per-binder counts:
    A07: 0 → 109
    foundation box: 470 → 470
    lord of the rings: 320 → 320
  Total inventory: 12,749 → 12,749
  ```
  Collapsed view shows a one-line summary: `Replaced 3 binders (909 rows)`.
- **D-11:** Other audit action types (`order.cancel`, `inventory.update`, etc.) keep their existing rendering. Phase 21 ONLY adds the new fields for `inventory.import_commit`.

### Admin dashboard binder breakdown (light addition; in scope)
- **D-12:** `/admin` dashboard adds a "By binder" breakdown tile alongside the existing "By set", "By color", "By rarity" breakdowns (Phase 12). Source: `getAdminDashboardStats().byBinder` derived from `SELECT binder, COUNT(*), SUM(quantity), SUM(price * quantity) FROM cards GROUP BY binder ORDER BY binder ASC`. Rendered as a small table.
- **D-13:** Why include in Phase 21: it's a 50-line addition that gives the operator at-a-glance "which binders contribute what value" — directly useful for the chaos-sort fulfillment workflow + dovetails with the inventory binder column.

### Claude's Discretion
- Exact placement of the binder filter dropdown (above table left vs right; matches existing Set/Condition filters)
- Tailwind class names for the [binder] pill
- Exact wording of the audit details summary
- Whether to make the dashboard "By binder" tile collapsible (likely yes if the table is long; planner picks)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/PITFALLS.md` — Pitfall 17 (annotation reads from snapshot, not live join); Pitfall 3 (graceful degradation for missing cards row)
- `.planning/research/FEATURES.md` — P2 deferrals: ADM-FUT-01 (allocator preview), ADM-FUT-02 (bulk-edit binder), ADM-FUT-03 (unsorted filter chip), ADM-FUT-04 (per-line binder audit)
- `.planning/research/SUMMARY.md` — Phase 21 section

### Prior phase context
- `.planning/phases/16-schema-migration/16-CONTEXT.md` — `order_items.binder` snapshot column (D-09)
- `.planning/phases/17-parser-etched/17-CONTEXT.md` — binder name normalization (display = lowercase canonical)
- `.planning/phases/18-allocator/18-CONTEXT.md` — allocator populates `order_items.binder` per allocation (D-11)
- `.planning/phases/19-import-preview-picker/19-CONTEXT.md` — `ScopedImportAuditMetadata` shape (D-17) Phase 21 renders

### Existing codebase patterns to mirror / extend
- `src/db/queries.ts` `getAdminCards()` — extend with `binder` filter param
- `src/app/admin/_components/inventory-table.tsx` — extend with Binder column + filter dropdown
- `src/db/orders.ts` `getOrderById()` — already returns `order_items` rows; add `binder` field to the return shape
- `src/app/admin/orders/[id]/page.tsx` (or wherever order detail renders) — add the `[binder]` pill rendering
- `src/app/admin/audit/page.tsx` — extend the rendering for `inventory.import_commit` entries with the new metadata fields
- `src/app/admin/page.tsx` (admin dashboard) — add the "By binder" breakdown tile
- `src/db/queries.ts` `getAdminDashboardStats()` — extend to include `byBinder`
- Phase 11 pill pattern (status pill on order list) — reuse for the [binder] pill

### Project docs
- `.planning/REQUIREMENTS.md` — ADM-01..03 are this phase's requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getAdminCards()` filter pattern (q, set, condition) — direct template for binder filter
- `getAdminDashboardStats().bySet` etc. — direct template for `byBinder`
- Order detail line item rendering — direct extension point
- Audit page row rendering — extension point with collapsed expander pattern

### Established Patterns
- **Filter via URL search params** — admin pages preserve filters across reload (Phase 9/13)
- **Snapshot-based historical display** — `order_items.name`, `order_items.price` snapshot the card state at order time; binder follows the same pattern (Phase 18 D-11)
- **Pill-style metadata** — condition, status, etc. all render as small Tailwind-styled pills

### Integration Points
- **Phase 16** schema (binder column + order_items.binder)
- **Phase 18** populates order_items.binder per allocation
- **Phase 19** writes ScopedImportAuditMetadata that this phase renders
- **Phase 20** AdminCard.binders field (storefront aggregation byproduct, useful for any admin reads not covered here)

</code_context>

<specifics>
## Specific Ideas

- The `[binder]` pill on order detail is the single most operator-facing change in v1.3 — it's the literal "where do I find this card" annotation that motivated the entire milestone. Get the styling tight; make it visible without being loud.
- Historical orders rendering `[unsorted]` (D-08) is honest; trying to hide them would be confusing when the operator looks at an old order and wonders why it lacks the v1.3 annotation.
- Dashboard "By binder" breakdown (D-12) makes the chaos-sort workflow visible at-a-glance: operator can see "Bulk Drawers contributes 28% of inventory value, A02 contributes 0.5%". Useful for prioritizing which binders to keep stocked.

</specifics>

<deferred>
## Deferred Ideas

- **Bulk-edit binder column** (research P2 ADM-FUT-02; "consolidate A02 into A07" workflow) — v1.3.x; allocator passively consolidates anyway
- **`unsorted` filter chip** (research P2 ADM-FUT-03) — v1.3.x; one-click filter to find legacy rows
- **Allocator preview in admin order detail** (research P2 ADM-FUT-01; "[A02 × 2, A05 × 1] BEFORE commit") — v1.3.x; current Phase 21 only shows post-commit allocation from order_items
- **Per-line binder audit log** (research P2 ADM-FUT-04) — v1.3.x; data already in order_items snapshot
- **Drag-and-drop binder reorganization** — research P3 anti-feature for v1.3; bulk-edit (when added) is the path

</deferred>

---

*Phase: 21-Admin Visibility & Audit*
*Context gathered: 2026-05-11*
