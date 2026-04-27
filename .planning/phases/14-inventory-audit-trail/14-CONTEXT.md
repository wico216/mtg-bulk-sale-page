# Phase 14: Inventory Audit Trail - Context

**Gathered:** 2026-04-27
**Status:** Planned

<domain>
## Phase Boundary

Phase 14 makes destructive and high-impact admin actions explainable after the fact. The store now has real inventory mutations: imports, edits, single deletes, bulk deletes, delete-all, checkout stock decrements, and planned order cancellations/restores. The next operational gap is durable history: what changed, when, and why.

Phase 14 owns:
- admin audit log storage and helper APIs
- audit entries for inventory and order workflow mutations
- import history for committed CSV replacement operations
- an admin-facing audit/history page
- safer destructive-action affordances such as export-before-delete guidance

Phase 14 does not own:
- full rollback or undo
- recreating historical inventory states
- multi-admin permission attribution beyond the current admin identity/email
- external observability/logging vendors
- broad production health/rate-limit work; that belongs to Phase 15

</domain>

<decisions>
## Implementation Decisions

### Audit model
- **D-01:** Store audit records in the database, not only logs, because Vercel/serverless logs are not a durable product surface for the seller.
- **D-02:** Audit entries should describe the operation at a useful level: action type, target type, target IDs/counts, actor email, timestamp, and a small JSON metadata payload.
- **D-03:** Audit payloads must not store secrets or raw uploaded CSV contents. Store filenames/counts/summary information, not full file bodies.
- **D-04:** For mutations that succeed, the audit should succeed in the same server-side operation where practical. A successful destructive mutation with no audit record is a failure for Phase 14.

### Coverage
- **D-05:** Audit high-impact admin actions first: inline inventory edit, single delete, bulk delete, delete-all, import commit, order status update, order cancellation, and inventory restore.
- **D-06:** Checkout stock decrement is already represented by order/order_item records; Phase 14 may add audit for checkout only if execution finds it useful, but admin audit coverage is the priority.

### Import history
- **D-07:** Import history is a first-class operational concept, not just another audit row. The seller needs to know when inventory was last replaced and what the replacement contained.
- **D-08:** Import history should record uploaded file names, file count, parsed row counts, skipped/error counts, inserted card count, and committed timestamp.

### UI
- **D-09:** Add one admin history/audit page rather than scattering history views across every screen in Phase 14.
- **D-10:** Destructive UI should continue to encourage export/backup before irreversible actions, but Phase 14 does not need full automatic backup storage.

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — AUD-01, AUD-02, AUD-03, AUD-04
- `.planning/ROADMAP.md` — Phase 14 success criteria

### Prior phase context
- `.planning/phases/10-csv-import/10-03-SUMMARY.md` — import commit UI and replacement semantics
- `.planning/phases/10.1-multi-csv-delete-inventory/10.1-01-SUMMARY.md` — delete-all confirmation and multi-file parse summaries
- `.planning/phases/12-bulk-operations-dashboard/12-02-SUMMARY.md` — bulk delete helper/route/UI
- `.planning/phases/13-admin-order-workflow/13-02-SUMMARY.md` — order cancellation and restore mutation surface

### Current code to read before execution
- `src/db/schema.ts` — add audit/import history tables
- `src/db/queries.ts` — card edit/delete/import/delete-all/bulk helpers
- `src/db/orders.ts` — order workflow/cancel helpers
- `src/app/api/admin/import/commit/route.ts` — import commit metadata source
- `src/app/api/admin/cards/route.ts`, `[id]/route.ts`, `bulk-delete/route.ts` — mutation routes to audit
- `src/app/admin/layout.tsx` — admin navigation for the audit/history page

</canonical_refs>

<code_context>
## Existing Code Insights

### Already present
- Inventory mutation helpers already centralize most write operations.
- Import preview carries file-level parse summaries; commit currently receives the approved cards payload.
- Bulk delete returns actual deleted IDs, which is useful audit metadata.
- Delete-all returns deleted count.
- Order helpers contain enough context for status/cancel/restore audit entries after Phase 13.

### Risk points
- Adding audit after mutations in route handlers can drift or be skipped. Prefer helper-level integration where the write is already centralized.
- If an audit insert fails after a mutation commits, the system may be left in the exact state Phase 14 is trying to avoid. Prefer DB batch/transaction patterns compatible with Neon HTTP.
- Audit metadata can grow quickly. Keep payloads small and structured.
- Import history may need request-contract changes so the commit route receives file summary metadata along with the approved cards.

</code_context>

<specifics>
## Specific Interface Sketch

### Audit log

```typescript
export type AdminAuditAction =
  | "inventory.update"
  | "inventory.delete_one"
  | "inventory.delete_many"
  | "inventory.delete_all"
  | "inventory.import_commit"
  | "order.status_update"
  | "order.cancel"
  | "order.restore_inventory";

export interface AdminAuditEntry {
  id: number;
  action: AdminAuditAction;
  actorEmail: string | null;
  targetType: "card" | "inventory" | "order" | "import";
  targetId: string | null;
  targetCount: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

### Import history

```typescript
export interface ImportHistoryEntry {
  id: number;
  actorEmail: string | null;
  fileNames: string[];
  fileCount: number;
  parsedRows: number;
  skippedRows: number;
  insertedCards: number;
  committedAt: string;
}
```

</specifics>

<deferred>
## Deferred Ideas

- One-click rollback to a previous import.
- Automatic CSV backup storage before delete/import.
- Diff view between imports.
- External log drain/alerting; Phase 15 handles local health and operational surfaces first.
</deferred>

---

*Phase: 14-inventory-audit-trail*
*Context gathered: 2026-04-27*
