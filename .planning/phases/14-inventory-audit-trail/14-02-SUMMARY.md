---
phase: 14-inventory-audit-trail
plan: 02
status: complete
completed: 2026-04-28
requirements:
  - AUD-02
  - AUD-03
  - AUD-04
---

# 14-02 Summary: Import History and Admin Audit Page

## What changed

Added first-class import history and an admin-visible audit/history page.

The admin can now open `/admin/audit` from the admin navigation and see:

- recent high-impact audit entries, newest first
- import commit history, newest first
- actor email, target details, timestamps, and bounded metadata previews
- empty states when there is no history
- independent pagination for audit rows and import history

The page uses the same direct server-side admin check pattern as the order pages: unauthenticated users redirect to `/admin/login`, and non-admin users redirect to `/admin/access-denied`.

## Schema and helper contract

`src/db/schema.ts` now defines `importHistory`:

```ts
export const importHistory = pgTable("import_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  actorEmail: text("actor_email"),
  fileNames: text("file_names").array().notNull(),
  fileCount: integer("file_count").notNull().default(0),
  parsedRows: integer("parsed_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  insertedCards: integer("inserted_cards").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
});
```

`src/db/queries.ts` now exports:

```ts
export async function createImportHistoryEntry(input: CreateImportHistoryEntryInput): Promise<ImportHistoryEntry>;
export async function getImportHistory(params?: ImportHistoryParams): Promise<ImportHistoryResult>;
```

`getImportHistory()` returns paginated newest-first rows ordered by `committed_at DESC, id DESC`.

## Import commit integration

`replaceAllCards(cards, audit)` now accepts an optional `audit.importHistory` payload. When present, the import-history row is inserted in the same batch as the full inventory replacement and import audit entry.

`POST /api/admin/import/commit` now builds one safe summary from the preview handoff and passes it to both:

- audit metadata for `inventory.import_commit`
- the first-class `import_history` insert

The route still avoids raw CSV/content storage. Runtime summary fields are normalized defensively before use.

## Admin UI

Added:

- `src/app/admin/audit/page.tsx`
- `src/app/admin/audit/_components/audit-table.tsx`

Updated:

- `src/app/admin/layout.tsx` with an `Audit` navigation link
- destructive inventory confirmation copy to mention export/backup and Audit history
- import preview confirmation copy with a backup reminder before full replacement

## Schema application notes

After explicit approval, the configured database was updated with the additive import-history table and indexes:

```sql
CREATE TABLE IF NOT EXISTS import_history (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_email text,
  file_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  file_count integer NOT NULL DEFAULT 0,
  parsed_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  inserted_cards integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT jsonb_build_object(),
  committed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_history_committed_at_idx ON import_history (committed_at);
CREATE INDEX IF NOT EXISTS import_history_actor_email_idx ON import_history (actor_email);
```

Verified DB columns:

```json
[
  { "column_name": "id", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "actor_email", "data_type": "text", "is_nullable": "YES" },
  { "column_name": "file_names", "data_type": "ARRAY", "is_nullable": "NO" },
  { "column_name": "file_count", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "parsed_rows", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "skipped_rows", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "inserted_cards", "data_type": "integer", "is_nullable": "NO" },
  { "column_name": "metadata", "data_type": "jsonb", "is_nullable": "NO" },
  { "column_name": "committed_at", "data_type": "timestamp with time zone", "is_nullable": "NO" }
]
```

## Browser and DB proof

Browser proof used disposable rows with run id:

```txt
phase14-ui-1777344748
```

Verified `/admin/audit` showed:

- page heading `Audit & Import History`
- `Inventory edit` audit row produced through the authenticated card PATCH API
- seeded `Import commit` audit row
- `phase14-audit-ui.csv`
- `phase14-ui-smoke@example.com`
- metadata preview `cardName: Phase 14 Audit UI Card`

Verified destructive guidance in-browser:

- delete-all confirmation showed export/backup guidance and Audit-history copy
- selected-row delete confirmation showed export/backup guidance and Audit-history copy
- single-card delete confirmation showed export/backup guidance and Audit-history copy
- import preview showed `Backup reminder`, full-replacement copy, export rollback guidance, and Audit-history copy

Fresh browser diagnostics after clearing stale dev-server history:

- `no_console_errors` passed
- `no_failed_requests` passed

Cleanup proof:

```json
{
  "runId": "phase14-ui-1777344748",
  "deleted": {
    "auditRows": 2,
    "importHistoryRows": 1,
    "cards": 1
  },
  "remaining": {
    "auditRows": 0,
    "importHistoryRows": 0,
    "cards": 0
  }
}
```

## Verification evidence

TDD red check:

- Focused tests failed before implementation because `createImportHistoryEntry`, `getImportHistory`, and `importHistory` schema did not exist.

Focused tests after implementation:

- `npx vitest run src/db/__tests__/admin-audit.test.ts src/app/api/admin/import/__tests__/commit.test.ts src/db/__tests__/schema.test.ts`
  - 3 files passed
  - 30 tests passed

Full automated verification passed after the final code change:

- `git diff --check`
- `npx tsc --noEmit`
- `npm test`
  - 23 files passed
  - 217 tests passed
- `npm run build`
  - production build passed
  - `/admin/audit` appears as a dynamic route

`npm run build` still emits the pre-existing Node warning about `--localstorage-file` without a valid path during static generation; the build exits successfully.

## Known limitations / next plan

- Phase 14 is complete locally but has not been pushed, opened as a PR, merged, or deployed.
- Production deployment requires the target production database to contain both `admin_audit_log` and `import_history` tables/indexes.
- Full rollback/undo remains out of scope; the operational path is still export before destructive inventory changes.
- Phase 15 owns production hardening: rate limits, structured operational logs, health surfaces, repeatable production smoke, runbook docs, and security review.
