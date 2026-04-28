---
phase: 14-inventory-audit-trail
plan: 01
status: complete
completed: 2026-04-28
requirements:
  - AUD-01
  - AUD-04
---

# 14-01 Summary: Audit Schema, Helpers, and Mutation Coverage

## What changed

Added the durable audit foundation for high-impact admin mutations.

Admin-side mutations now have a shared audit contract that records:

- action type
- actor email
- target type
- target id when applicable
- target count when applicable
- bounded JSON metadata
- creation timestamp

Covered mutation surfaces:

- inline inventory edit
- single inventory delete
- selected-row bulk delete
- delete-all inventory
- import commit audit summary
- order workflow status/internal-note update
- order cancellation
- optional order cancellation inventory restore

## Schema and helper contract

`src/db/schema.ts` now defines:

```ts
export const adminAuditLog = pgTable("admin_audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  action: text("action").notNull(),
  actorEmail: text("actor_email"),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  targetCount: integer("target_count"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`src/db/queries.ts` now exports:

```ts
export type AdminAuditAction =
  | "inventory.update"
  | "inventory.delete_one"
  | "inventory.delete_many"
  | "inventory.delete_all"
  | "inventory.import_commit"
  | "order.status_update"
  | "order.cancel"
  | "order.restore_inventory";

export type AdminAuditTargetType = "card" | "inventory" | "order" | "import";

export async function createAdminAuditEntry(input: CreateAdminAuditEntryInput): Promise<AdminAuditEntry>;
export async function getAdminAuditEntries(params?: AdminAuditEntriesParams): Promise<AdminAuditEntriesResult>;
```

`getAdminAuditEntries()` returns newest-first paginated rows and supports lightweight `action` and `targetType` filters.

Audit metadata is sanitized before insert:

- secret-like keys are redacted
- raw CSV/content-like keys are redacted
- long strings are truncated
- arrays, object keys, nesting depth, and total serialized metadata size are bounded
- non-JSON-compatible values are dropped or normalized

## Mutation coverage map

| Surface | Audit action(s) | Integration point |
|---------|-----------------|-------------------|
| Inline card edit | `inventory.update` | `updateCard(id, updates, audit)` |
| Single card delete | `inventory.delete_one` | `deleteCard(id, audit)` |
| Selected-row bulk delete | `inventory.delete_many` | `deleteCardsByIds(ids, audit)` |
| Delete-all inventory | `inventory.delete_all` | `deleteAllCards(audit)` |
| Import commit | `inventory.import_commit` | `replaceAllCards(cards, audit)` via commit route |
| Order status/note update | `order.status_update` | `updateOrderWorkflow({ ..., audit })` |
| Order cancellation | `order.cancel` | `cancelOrder({ ..., audit })` |
| Cancellation inventory restore | `order.restore_inventory` | `cancelOrder({ restoreInventory: true, audit })` |

Admin route handlers now pass `requireAdmin().user.email` into mutation helpers as the audit actor.

Import commit now forwards safe preview summary metadata from the client to the commit route:

- file names
- file count
- parsed row count
- skipped row count
- missing price count
- inserted card count

It does not send raw CSV bodies to commit.

## Schema application notes

After explicit approval, the configured database was updated with the additive audit table and indexes:

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  actor_email text,
  target_type text NOT NULL,
  target_id text,
  target_count integer,
  metadata jsonb NOT NULL DEFAULT jsonb_build_object(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON admin_audit_log (action);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_type_idx ON admin_audit_log (target_type);
```

Verified DB columns:

```json
[
  { "column_name": "id", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "action", "data_type": "text", "is_nullable": "NO" },
  { "column_name": "actor_email", "data_type": "text", "is_nullable": "YES" },
  { "column_name": "target_type", "data_type": "text", "is_nullable": "NO" },
  { "column_name": "target_id", "data_type": "text", "is_nullable": "YES" },
  { "column_name": "target_count", "data_type": "integer", "is_nullable": "YES" },
  { "column_name": "metadata", "data_type": "jsonb", "is_nullable": "NO" },
  { "column_name": "created_at", "data_type": "timestamp with time zone", "is_nullable": "NO" }
]
```

## Verification evidence

TDD red check:

- Initial `npx vitest run src/db/__tests__/admin-audit.test.ts` failed before implementation:
  - missing `createAdminAuditEntry`
  - missing `getAdminAuditEntries`
  - missing newest-first SQL ordering
  - missing bulk-delete audit integration

Focused tests after implementation:

- `npx vitest run src/db/__tests__/admin-audit.test.ts`
  - 1 file passed
  - 5 tests passed
- Focused admin mutation suite:
  - 9 files passed
  - 107 tests passed

Full automated verification passed:

- `git diff --check`
- `npx vitest run src/db/__tests__/admin-audit.test.ts`
  - 5 tests passed
- `npx tsc --noEmit`
- `npm test`
  - 23 files passed
  - 212 tests passed
- `npm run build`
  - production build passed

DB verification used disposable rows with run id:

```txt
phase14-audit-1777343553437
```

Verified audit actions:

```json
[
  "inventory.delete_many",
  "inventory.delete_one",
  "inventory.import_commit",
  "inventory.update",
  "order.cancel",
  "order.restore_inventory",
  "order.status_update"
]
```

DB smoke proof:

```json
{
  "auditRows": 7,
  "restoreQuantity": 2,
  "listedOrderAuditRows": 3,
  "safeMetadata": true
}
```

Cleanup proof:

```json
{
  "cards": 0,
  "orders": 0,
  "order_items": 0,
  "audit_rows": 0
}
```

The DB smoke also caught and fixed a metadata propagation gap: `order.restore_inventory` originally did not inherit the audit context metadata, making the row harder to correlate and clean up. The restore audit entry now includes the caller-provided audit metadata.

## Known limitations / next plan

- Import history is still represented as audit metadata only. Plan 14-02 owns first-class import history helpers and UI.
- The seller cannot view audit rows in the admin panel yet. Plan 14-02 adds `/admin/audit`.
- Full rollback/undo remains out of scope.
