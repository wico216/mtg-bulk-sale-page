# Phase 16: Schema & Migration - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `binder` text column to `cards` (NOT NULL DEFAULT `'unsorted'`) and a corresponding snapshot column to `order_items`; introduce a `finish` 3-value enum (`normal` / `foil` / `etched`) replacing the existing `foil: boolean`; rewrite `cards.id` to a 5-segment composite (`{setCode}-{collectorNumber}-{finish}-{condition}-{binder}`); add a `CHECK (quantity >= 0)` constraint as the schema-level safety net for the Phase 18 allocator. Apply via a single `db.batch([...])` atomic transaction in a custom Drizzle migration script that the operator runs manually before the Vercel code deploy.

This phase is the foundation. Phases 17 (parser), 18 (allocator), 19 (importer), 20 (storefront aggregation), and 21 (admin visibility) all depend on its schema shape.

</domain>

<decisions>
## Implementation Decisions

### Migration strategy (locked by research; reaffirmed in discussion)
- **D-01:** Use `drizzle-kit generate --custom` to produce the migration file. Auto-generation is broken for PK changes (Drizzle issues #3496, #3117) and cannot express the `id` data rewrite.
- **D-02:** Apply via a single `db.batch([sql\`ADD COLUMN binder...\`, sql\`ADD COLUMN finish...\`, sql\`UPDATE...backfill...\`, sql\`ALTER TABLE cards DROP CONSTRAINT cards_pkey\`, sql\`UPDATE cards SET id = ...new format...\`, sql\`ADD CONSTRAINT cards_pkey PRIMARY KEY (id)\`, sql\`ADD CONSTRAINT cards_quantity_check CHECK (quantity >= 0)\`, sql\`ALTER TABLE order_items ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'\`])` so the entire schema flip is atomic. Mirrors the existing `replaceAllCards` `db.batch` pattern at `src/db/queries.ts:809+`.
- **D-03:** During Phase 16 planning, do a 30-minute spike to confirm `db.batch([sql\`...\`])` typings accept raw `sql` calls. Fall back to `db.execute(sql\`BEGIN; ...; COMMIT;\`)` raw multi-statement only if the typing rejects.
- **D-04:** The migration script is one-shot. Three pre-flight assertions before any DML: (a) no row already has `-unsorted` suffix, (b) no `binder` column yet exists on `cards`, (c) `order_items.cardId` distribution captured to `lastCount` so before/after diff is verifiable. If any fails, exit non-zero with a clear message and zero changes.

### Schema shape (locked by research)
- **D-05:** New `cards.id` format: `{setCode}-{collectorNumber}-{finish}-{condition}-{binder}` (5 segments). The `finish` segment replaces the position previously held by the boolean-derived `'foil'`/`'normal'` string.
- **D-06:** `cards.binder text NOT NULL DEFAULT 'unsorted'`. Backfill all existing rows to `binder='unsorted'`.
- **D-07:** `cards.finish` is a Postgres enum: `pgEnum('finish', ['normal','foil','etched'])`. Matches the existing `orderStatusEnum` precedent at `src/db/schema.ts:15`. Backfill: `WHERE foil = true → finish = 'foil'`, `WHERE foil = false → finish = 'normal'`. The `foil` column is dropped after backfill (it is no longer source of truth — `finish` is).
- **D-08:** `cards.quantity` gains `CHECK (quantity >= 0)` constraint. Belt-and-suspenders for the Phase 18 allocator. Over-decrement becomes a 503 (constraint violation) — never a silent oversell.
- **D-09:** `order_items.binder text NOT NULL DEFAULT 'unsorted'`. Historical (pre-v1.3) `order_items` rows carry `'unsorted'` as the snapshot. Phase 21 admin order detail must render gracefully when binder = 'unsorted' on historical orders (likely shows `[unsorted]` or omits the annotation; decision deferred to Phase 21).

### Operator transition (decided in discussion)
- **D-10:** On the first v1.3 Manabox import, the binder picker (Phase 19) shows `unsorted (12,749 rows)` as a checkbox alongside the new binders from the CSV. Default state for `unsorted` is **UNCHECKED**. Operator can include it (replaces those 12,749 rows with whatever the new CSV has under unsorted, which is none) or leave it unchecked (those rows persist intact). Safest default; matches the rule that no binder is touched without explicit selection. **Phase 19 must implement this `unsorted` visibility behavior.**

### Migration runtime (decided in discussion)
- **D-11:** Migration runs MANUALLY from operator's local machine. Workflow:
  1. Operator pulls v1.3 branch locally
  2. `npm run migrate:v1.3 -- --dry-run` against a Neon branch first (verifies no data loss + prints summary)
  3. Operator confirms output looks right
  4. `npm run migrate:v1.3` against the production `DATABASE_URL` (the real run)
  5. Script prints structured summary (D-12)
  6. Operator confirms summary
  7. Vercel deploys v1.3 application code (which expects the new schema)
- **D-12:** No auto-run via Vercel build hooks. No paste-into-Neon-console workflow. Manual local run is the ONLY supported execution mode. Matches Phase 14's "schema applied after explicit user approval" pattern documented in 14-01 SUMMARY.
- **D-13:** Add `"migrate:v1.3": "tsx scripts/migrate-v1.3-binder.ts"` to `package.json scripts`. Add `"migrate:v1.3:dry-run": "tsx scripts/migrate-v1.3-binder.ts --dry-run"` for the Neon branch dry-run.

### Verification UX (decided in discussion)
- **D-14:** Migration script prints a structured terminal summary at the end:
  ```
  ✓ Migration v1.3 complete

  Schema changes applied:
    - cards: +binder (text NOT NULL DEFAULT 'unsorted')
    - cards: +finish (enum: normal/foil/etched)
    - cards: -foil (dropped; replaced by finish)
    - cards: +CHECK (quantity >= 0)
    - cards: id format: 4-segment -> 5-segment
    - order_items: +binder (text NOT NULL DEFAULT 'unsorted')

  Data migration:
    - cards rows migrated: 12,749 -> 12,749 (zero loss)
    - id format check: 12,749/12,749 have 5 segments ending in -unsorted
    - finish backfill: 11,000 normal, 1,749 foil, 0 etched
    - order_items: 47 historical rows backfilled to binder='unsorted'

  Constraints:
    - cards_pkey: PRESENT (PRIMARY KEY (id))
    - cards_quantity_check: PRESENT (CHECK (quantity >= 0))

  Sample 5 ids:
    - tdc-369-normal-near_mint-unsorted
    - ltr-229-normal-near_mint-unsorted
    - fin-48-normal-near_mint-unsorted
    - ltr-432-normal-near_mint-unsorted
    - mh3-101-foil-lightly_played-unsorted

  Pre-flights honored: ✓ no -unsorted suffix already, ✓ no binder column already, ✓ order_items.cardId distribution captured

  Next: deploy v1.3 application code to Vercel.
  ```
- **D-15:** No app-side schema-version indicator. No /admin/health changes in this phase. No smoke-script changes in this phase. The terminal summary is the contract; the smoke script changes belong in Phase 22 (Hardening & UAT).

### Backup retention (decided in discussion)
- **D-16:** No `pg_dump` to local file. Rely on:
  1. Neon branch dry-run (covers the rehearsal)
  2. Neon's automatic point-in-time recovery (~24-72h rollback window) for live-rollback if a bug surfaces post-deploy
- **D-17:** Document the Neon PITR rollback procedure in the migration script header comment so the operator knows what to do if something goes wrong post-deploy.

### Claude's Discretion
- Internal organization of the migration script: helpers, function naming, commenting style, etc.
- Pre-flight assertion implementation details (which specific SQL queries to run, error message wording)
- Test scaffolding for the migration script (likely a smoke-test that runs the script against a test DB and asserts post-state)
- Whether to add a `down` migration: NO (per D-16, rollback is via Neon PITR; a down migration would be misleading because the data rewrite is destructive and not symmetrically reversible)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/STACK.md` — Drizzle migration constraints, `db.batch` typing concern, `--custom` migration recipe, package.json pin verification, no Manabox npm package finding, `etched` finish gotcha
- `.planning/research/ARCHITECTURE.md` — One-shot `db.batch` migration design, neon-http no-interactive-transactions constraint, integration touchpoints, build order
- `.planning/research/PITFALLS.md` — Pitfall 4 (migration corruption from non-idempotent backfill), Pitfall 1 (CHECK constraint as allocator safety net), Pitfall 7 (etched silent mishandle in v1.2 parser)
- `.planning/research/SUMMARY.md` — Roadmap-ready synthesis; Phase 16 section

### Existing codebase patterns to mirror
- `src/db/schema.ts` — Current schema; defines `orderStatusEnum` (the pattern for the new `finish` enum); defines `cards`, `orders`, `order_items`, `admin_audit_log`, `import_history`, `rate_limit_hits` tables
- `src/db/queries.ts` §`replaceAllCards` (lines 809+) — The `db.batch([delete, insert, audit, importHistory])` atomic-batch pattern this migration mirrors
- `src/db/queries.ts` §`createAdminAuditEntry` — Audit log writer (no changes needed in this phase, but referenced because the migration could write a `schema.migration` audit entry; defer to D-15 — terminal summary is the contract)
- `src/db/orders.ts` §`placeCheckoutOrder` (CTE-chain checkout) — Phase 18 allocator extends this; the `CHECK (quantity >= 0)` constraint added here is the safety net for that future work
- `src/lib/csv-parser.ts` line 87 — The latent `etched` bug Phase 17 fixes; the `finish` enum added here is the destination type
- `src/db/seed.ts` — Existing seed script; needs awareness of new schema in Phase 17 (parser) where it will likely be updated

### Reference docs
- [Drizzle Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — workaround for the unsupported `id`-rewrite DDL
- [Drizzle Batch API](https://orm.drizzle.team/docs/batch-api) — atomic batched DDL+DML on neon-http
- [Neon Branching](https://neon.tech/docs/introduction/branching) — for the dry-run gate
- [Neon Point-in-Time Restore](https://neon.tech/docs/introduction/point-in-time-restore) — for the post-deploy rollback path

### Project docs
- `.planning/REQUIREMENTS.md` — BIND-01..04 + FIN-01 are the requirements this phase delivers
- `.planning/PROJECT.md` — Current Milestone section documents v1.3 goals + the "Manabox CSV parser ingests `Binder Name` and `Binder Type`" target feature
- `.planning/STATE.md` — Cross-Cutting Constraints section reiterates the Phase 16 expectations (Neon-branch dry-run, three pre-flight assertions, CHECK constraint)
- `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md` — STRIDE patterns to extend in Phase 22; not directly relevant to Phase 16 but contextual

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db.batch([...])` pattern from `src/db/queries.ts:809+` (`replaceAllCards`) — directly mirrors the Phase 16 migration shape (multiple DDL+DML operations executed atomically as one Neon-HTTP call)
- `pgEnum('order_status', [...])` from `src/db/schema.ts:15` — the precedent for `pgEnum('finish', ['normal','foil','etched'])`
- `tsx` (already in devDependencies) — the runner for `scripts/smoke-production.ts` already; same pattern works for `scripts/migrate-v1.3-binder.ts`
- `package.json` `scripts` section — already has `"smoke:production": "tsx scripts/smoke-production.ts"`; adds `"migrate:v1.3"` and `"migrate:v1.3:dry-run"` in the same shape

### Established Patterns
- **Schema changes are applied to the live DB AFTER explicit user approval, NEVER during build** — documented in Phase 13/14 SUMMARYs ("the configured database was updated with `ALTER TABLE...` after explicit user approval"). Phase 16 reaffirms via D-12 (manual local run, not Vercel build hook).
- **Audit metadata size cap = 4KB** — established in Phase 14; not directly relevant to this phase, but noted for Phase 19 which adds scoped-import audit metadata.
- **Tests pin schema invariants** — `src/db/__tests__/schema.test.ts` exists and was extended in Phase 13-02 (`cancelled` enum addition). Phase 16's test extension pins: presence of `binder` column, presence of `finish` enum with 3 values, presence of `CHECK (quantity >= 0)` constraint, presence of `order_items.binder` column.

### Integration Points
- **Phase 17 (Parser & Etched)** consumes the new `finish` enum + the new 5-segment id format. CSV parser writes `finish='normal'|'foil'|'etched'` and constructs id with binder.
- **Phase 18 (Allocator)** consumes `CHECK (quantity >= 0)`, the binder column, and `order_items.binder`. The CTE locks by aggregated key `(setCode, collectorNumber, finish, condition)` and writes `binder` into `order_items` per allocation.
- **Phase 19 (Import Preview & Picker)** consumes the binder column for the picker UI; per D-10, the picker shows `unsorted` as a checkbox default-unchecked.
- **Phase 20 (Storefront Aggregation)** consumes the new schema for `getCardsAggregated()` (`SUM(quantity) GROUP BY (setCode, collectorNumber, finish, condition)`).
- **Phase 21 (Admin Visibility)** reads `order_items.binder` snapshot for the `[binder]` annotation; reads `cards.binder` for the inventory table column + filter.

</code_context>

<specifics>
## Specific Ideas

- The migration's terminal summary (D-14) is the SOLE verification surface in this phase. Operator runs the script, eyeballs the summary, then deploys the application code. No app-side change required to confirm success.
- Sample IDs in the summary should be 5 random rows pulled from the migrated `cards` table — proves the new id format is in place across the population, not just constructible.
- The order in `db.batch` matters because of the PK rebuild step. Sequence: ADD binder column → ADD finish enum/column → BACKFILL finish from foil → DROP foil column → DROP cards_pkey → UPDATE cards SET id (5-segment) → ADD cards_pkey → ADD CHECK constraint → ADD order_items.binder column. Document this ordering in the migration script header.

</specifics>

<deferred>
## Deferred Ideas

- **Schema version indicator on /admin/health** (proposed during Area 3 discussion; user chose terminal-summary-only). If post-v1.3 deploys want this, defer to a v1.4+ Operations phase.
- **Smoke script schema check** (proposed during Area 3 discussion; user chose terminal-summary-only). The smoke script (`scripts/smoke-production.ts`) extension belongs to Phase 22 (Hardening & UAT) per the roadmap; no need to add a 6th smoke check just for schema-version verification.
- **External backup storage (S3, etc.)** for pre-migration `pg_dump` (proposed during Area 4 discussion; user chose Neon-only). If the friend store grows or a future migration is more destructive, revisit.

</deferred>

---

*Phase: 16-Schema & Migration*
*Context gathered: 2026-05-11*
