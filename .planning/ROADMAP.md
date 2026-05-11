# Roadmap: Viki — MTG Bulk Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-11)
- ✅ **v1.1 Admin Panel & Inventory Management** — Phases 6-12 (shipped 2026-04-27)
- ✅ **v1.2 Store Operations & Hardening** — Phases 13-15 (shipped 2026-05-11)
- 🚧 **v1.3 Binder-Aware Inventory & Pick Workflow** — Phases 16-22 (in progress)

_For per-milestone details see `.planning/milestones/v{X.Y}-ROADMAP.md`._

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Data Pipeline (3/3 plans) — completed 2026-04-02
- [x] Phase 2: Card Catalog (3/3 plans) — completed 2026-04-06
- [x] Phase 3: Search and Filters (3/3 plans) — completed 2026-04-07
- [x] Phase 4: Shopping Cart (3/3 plans) — completed 2026-04-08
- [x] Phase 5: Checkout and Deploy (3/3 plans) — completed 2026-04-11

</details>

<details>
<summary>✅ v1.1 Admin Panel & Inventory Management (Phases 6-12) — SHIPPED 2026-04-27</summary>

- [x] Phase 6: Database Foundation (2/2 plans)
- [x] Phase 7: Storefront Migration (2/2 plans)
- [x] Phase 8: Authentication (2/2 plans) — completed 2026-04
- [x] Phase 9: Admin Inventory Management (3/3 plans) — completed 2026-04-19
- [x] Phase 10: CSV Import (3/3 plans) — completed 2026-04-20 (production hotfix wave 2026-04-25)
- [x] Phase 10.1: Multi-CSV Import & Delete Inventory (1/1 plan) — completed 2026-04-26 (INSERTED)
- [x] Phase 11: Checkout Upgrade & Order History (2/2 plans) — completed 2026-04-26
- [x] Phase 12: Bulk Operations & Dashboard (2/2 plans) — completed 2026-04-27

</details>

<details>
<summary>✅ v1.2 Store Operations & Hardening (Phases 13-15) — SHIPPED 2026-05-11</summary>

- [x] Phase 13: Admin Order Workflow (2/2 plans) — completed 2026-04-27
- [x] Phase 14: Inventory Audit Trail (2/2 plans) — completed 2026-04-28
- [x] Phase 15: Production Hardening (2/2 plans) — completed 2026-05-11 (live UAT 3/3 against `wikos-spellbinder.vercel.app`)

</details>

### 🚧 v1.3 Binder-Aware Inventory & Pick Workflow (Phases 16-22) — IN PROGRESS

**Milestone Goal:** Every card in the storefront knows which physical binder it lives in, so the admin can pull orders without flipping through every binder.

- [ ] **Phase 16: Schema & Migration** — Custom Drizzle migration adds `binder` dimension, `finish` enum, and CHECK constraint, with idempotency pre-flights and a Neon-branch dry-run gate
- [ ] **Phase 17: Parser & Etched** — Manabox CSV parser reads `Binder Name`/`Binder Type`, normalizes binder names, and fixes the latent v1.2 etched-as-normal bug
- [ ] **Phase 18: Allocator** — Server-side multi-binder allocator inside the existing CTE chain with extended concurrent-checkout proof
- [ ] **Phase 19: Import Preview & Picker** — Two-stage NDJSON binder picker with remembered selection, scoped replace, and bounded audit metadata
- [ ] **Phase 20: Storefront Aggregation & Cart Migration** — Storefront aggregates quantity across binders, splits `PublicCard`/`AdminCard` types, and reconciles v1.2 carts forward
- [ ] **Phase 21: Admin Visibility & Audit** — Admin inventory binder column + filter, `[binder]` annotation on order detail, and audit page renders scoped-import metadata
- [ ] **Phase 22: Hardening & UAT** — STRIDE delta (I-DISC-05 + D-DOS-01 resolution), multi-binder concurrent-proof, parser perf pin, and live-deployment UAT

_Execution order is custom (16 → 17 → 20 → 19 → 18 → 21 → 22) per research recommendation; see STATE.md `execution_order` field._

## Phase Details

<!-- v1.0/v1.1/v1.2 phase detail sections live in .planning/milestones/v1.2-ROADMAP.md -->

### Phase 16: Schema & Migration
**Goal**: The `cards` and `order_items` tables understand binder as a first-class dimension, the `finish` enum makes etched a real value, and a `quantity >= 0` constraint is the schema-level safety net for the Phase 18 allocator
**Depends on**: Phase 15 (v1.2 complete)
**Requirements**: BIND-01, BIND-02, BIND-03, BIND-04, FIN-01
**Success Criteria** (what must be TRUE):
  1. After migration, every existing `cards` row carries `binder = 'unsorted'` and a 5-segment composite id ending in `-unsorted`, and the storefront, cart, and checkout still load and operate against the migrated rows
  2. The `cards.quantity >= 0` CHECK constraint exists in the database; manual attempt to set a row's quantity below zero rejects with a constraint-violation error
  3. The `order_items` table has a `binder text NOT NULL DEFAULT 'unsorted'` column populated for both historical rows (default) and any new row written after migration
  4. The `cards.finish` enum/text column accepts `normal`, `foil`, and `etched`, and existing rows are backfilled (`foil = true → finish = 'foil'`, `foil = false → finish = 'normal'`) with zero data loss
  5. The migration script (`scripts/migrate-v1.3-binder.ts`) refuses to run a second time against an already-migrated database (idempotency pre-flights catch repeat runs before any DML), and the dry-run on a Neon branch produces zero new `order_items.cardId` mismatches relative to the pre-migration count
**Plans**: 1 plan

Plans:
- [ ] 16-01-PLAN.md — Custom Drizzle migration script with three idempotency pre-flights, `pg_dump` backup step, Neon-branch dry-run gate, and `cards`/`order_items` schema updates

### Phase 17: Parser & Etched
**Goal**: The Manabox CSV parser ingests the `Binder Name` and `Binder Type` columns, normalizes binder names safely against the cart-key segment-strip, and emits `finish = 'etched'` for the printings the v1.2 parser silently misclassified as `normal`
**Depends on**: Phase 16
**Requirements**: CSV-05, CSV-06, CSV-07, CSV-08
**Success Criteria** (what must be TRUE):
  1. Operator runs a 5-minute manual test FIRST: exports one binder containing a known etched-foil card from Manabox, greps the CSV, and the `Foil` column literally equals `etched` — the parser test fixtures and the rest of Phase 17 are written against this verified literal
  2. Parsing a Manabox CSV containing a `Binder Name` column produces cards whose `binder` field reflects the row's binder, normalized via `trim().toLowerCase().replace(/\s+/g, ' ').replace(/-/g, '_')` (so `"A07"`, `"A07 "`, and `"a07"` all collapse to `a07`, and binder names with hyphens become underscores so the Phase 20 cart-key segment-strip stays safe)
  3. Parsing a Manabox CSV containing rows where `Binder Type != 'binder'` (decks/lists) skips those rows with `SkippedRow.reason = 'non-binder row'` and the import preview surfaces the count alongside existing skipped-row reasons
  4. Parsing a Manabox CSV containing a `Foil = etched` row produces a card with `finish = 'etched'` whose composite id is distinct from both the `normal` and `foil` printings of the same `(setCode, collectorNumber, condition, binder)` — no PK collision, no silent merge
  5. The cart-item, card-modal, and admin inventory display surfaces all read the new `finish` field instead of the legacy `foil: boolean`, and an etched card displays with the correct `usd_etched` price (not the `usd` price)
**Plans**: 1 plan

Plans:
- [ ] 17-01-PLAN.md — `ManaboxRow` type extension, `rowToCardOrSkip` binder normalization + `etched`/non-binder branches, composite id format change, display-layer `foil → finish` migration, and parser test fixture matrix (cross-binder same-card, etched-distinct-from-normal, trim/case normalization, non-binder skip)

### Phase 20: Storefront Aggregation & Cart Migration
**Goal**: Buyers see one row per logical card with summed stock across binders, binder names never appear in any public-facing surface, and v1.2 buyer carts silently reconcile forward to the v1.3 aggregated keys
**Depends on**: Phase 16 (binder column exists), Phase 17 (binder names normalized)
**Requirements**: AGG-01, AGG-02, AGG-03
**Success Criteria** (what must be TRUE):
  1. A buyer browsing the storefront sees one row per `(setCode, collectorNumber, finish, condition)` aggregated tuple with `quantity = SUM(quantity)` across binders — verified against a seed where a single logical card lives in three binders with stock `3+2+1`, the storefront row reads `In stock: 6`
  2. A `JSON.stringify()` grep of every public-route response (`GET /`, `GET /cart`, `POST /api/checkout` success and stock-conflict shapes, the buyer confirmation email HTML, every structured log emitted from a public route) contains zero occurrences of any binder name — enforced by per-route invariant tests AND by the compile-time `PublicCard`/`AdminCard` type split that puts `binder` only on `AdminCard`
  3. A buyer with a v1.2 localStorage cart (4-segment composite keys, possibly with the same logical card in two binders summing to e.g. 2+1) lands on `/cart` after the v1.3 deploy and sees their cart items hydrated under the aggregated key with quantity transferred (clamped to current stock) — silently dropped only when no aggregated candidate exists in `cardMap`
  4. The cart reconciliation extends the existing Phase 10-03 D-13 silent-reconciliation `useEffect` (NOT a Zustand `migrate` hook, which can't see `cardMap`) and reuses the established silent-shrink contract — buyer is not surprised by hard errors
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — `getCardsAggregated()` query (plain SQL `GROUP BY`, no materialized view), `app/page.tsx` swap, `PublicCard`/`AdminCard` type split in `src/lib/types.ts`, per-route invariant tests for binder-leak prevention
- [ ] 20-02-PLAN.md — Cart reconciliation extension (segment-count guard + last-`-{binder}`-segment strip + transfer-into-aggregated-candidate + clamp-to-current-stock) at `src/app/cart/cart-page-client.tsx:40-47`, optional one-time toast on first v1.3 visit (`viki-cart-version: '1.3'` sentinel)

**UI hint**: yes

### Phase 19: Import Preview & Picker
**Goal**: The operator sees every binder discovered in the upload (with row count + NEW/Will-delete annotations) before commit, the selection persists across imports, and the commit replaces only the inventory in the selected binders — leaving everything else untouched
**Depends on**: Phase 16 (binder column exists), Phase 17 (parser populates binder)
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06
**Success Criteria** (what must be TRUE):
  1. After uploading a Manabox CSV, the operator sees a binder picker rendered within 3 seconds of upload showing every binder name with its parsed row count and a per-binder checkbox; new binders not present in the previous selection are visually flagged `NEW`, and binders previously imported but missing from the current export appear in a separate `Will delete` panel that requires explicit confirmation
  2. The two-stage NDJSON contract delivers `{ type: 'binders', binders: [...] }` FIRST (after parse, < 2s for the production-scale 12,749-row CSV), THEN runs Scryfall enrichment ONLY on the rows belonging to selected binders — the operator never waits on enrichment for binders they aren't importing
  3. After committing an import scoped to a subset of binders, the operator can verify in the database that `cards` rows in unselected binders are bit-for-bit unchanged (same `id`, `quantity`, `updated_at`) and `cards` rows in selected binders are entirely replaced (`DELETE WHERE binder IN (selected)` then `INSERT`) — the SQL is scoped, not full-table
  4. Reopening the import page after a commit shows the picker pre-checked with the same selection as the previous successful import (persisted client-side via the `useBinderImportStore` zustand `persist` slice in localStorage)
  5. A confirmation modal between picker and commit summarizes ADD/REPLACE/DELETE counts per binder so an operator-on-autopilot still gets one explicit beat to notice that a critical binder was unintentionally deselected
  6. The audit log entry and `import_history` row for a scoped-replace commit include `selectedBinders`, `binderRowCounts` (before/after per binder), `newBindersInExport`, `missingBindersFromExport`, `replaceMode: 'selective'`, and `deletedFromUnselected: 0` — the entire metadata payload fits within the existing 4KB cap
**Plans**: 2 plans

Plans:
- [ ] 19-01-PLAN.md — Server-side: NDJSON `{ type: 'binders', binders: BinderSummary[] }` message kind in `/api/admin/import/preview`, `replaceCardsForBinders(cards, selectedBinders, audit)` replacing `replaceAllCards` (`db.batch([delete WHERE binder IN (selected), insert, audit, importHistory])`), bounded `ScopedImportAuditMetadata` shape
- [ ] 19-02-PLAN.md — Client-side: `binder-picker.tsx` hand-rolled checkbox list mirroring `filter-rail.tsx`, `useBinderImportStore` zustand `persist` slice, NEW/Will-delete diff annotations, confirmation modal with per-binder ADD/REPLACE/DELETE breakdown

**UI hint**: yes

### Phase 18: Allocator
**Goal**: Checkout commit deterministically allocates each buyer line across binder source rows inside one SQL CTE chain — never overselling, never silently partial-fulfilling, and producing one `order_items` row per binder source so admin order detail shows the operator exactly which binders to pull
**Depends on**: Phase 16 (binder column + CHECK constraint), Phase 17 (parser-stable binder names), Phase 20 (aggregated input shape locked)
**Requirements**: ALLOC-01, ALLOC-02, ALLOC-03, ALLOC-04
**Success Criteria** (what must be TRUE):
  1. A buyer line for `Lightning Bolt × 3` against stock `(A02:2, A05:2, A07:2)` produces exactly two `order_items` rows: one for `A02 × 2` and one for `A05 × 1`, in that lexicographic-binder-tiebreaker order, with the binder name snapshotted into `order_items.binder` at insert time
  2. The allocator's CTE chain locks every `cards` row matching the requested aggregated key (`set_code, collector_number, finish, condition`) via `FOR UPDATE OF cards` BEFORE deciding which to decrement — implemented as a pure SQL CTE using `ROW_NUMBER()` and running `SUM()` window functions and `LEAST(quantity, GREATEST(0, requested - prior_running_supply))` — with NO JS-side pre-allocation
  3. The extended concurrent-proof harness (`src/db/__tests__/orders.test.ts`) demonstrates that two simultaneous `placeCheckoutOrder` calls each requesting overlapping binder stock serialize correctly: one succeeds, one returns a `StockConflict`, total stock decrement equals total stock available, and zero `cards` rows end up with negative `quantity`
  4. When stock is insufficient across all binders combined, `placeCheckoutOrder` returns the same `StockConflict` shape as today (`{ cardId, name, requested, available }`) where `available` is the SUM across binders for that aggregated key — buyers never see a per-binder breakdown of where stock lives, and the `cardId` is the aggregated id, not a per-row binder-suffixed id
**Plans**: 1 plan

Plans:
- [ ] 18-01-PLAN.md — Allocator CTE rewrite of `placeCheckoutOrder` (`requested → locked_rows → conflicts → can_fulfill → allocations → stock_write → inserted_order → inserted_items` with binder snapshot), `StockConflict` aggregated-id semantics, full unit-test fixture matrix (`(2,2,2)×3 = [2,1,0]`, `(2,2,2)×5 = [2,2,1]`, `(2,2,2)×6 = [2,2,2]`, `(2,2,2)×7 = conflict`), and extended concurrent-proof harness

### Phase 21: Admin Visibility & Audit
**Goal**: The admin inventory table and admin order detail page surface binder context everywhere the operator needs it — Binder column with filter on the inventory table, `[binder]` annotation on every line item of order detail (read from the `order_items.binder` snapshot, not joined to live `cards`), and the audit page renders the new scoped-import metadata fields in human-readable form
**Depends on**: Phase 18 (`order_items.binder` snapshot populated), Phase 19 (scoped-import audit metadata format)
**Requirements**: ADM-01, ADM-02, ADM-03
**Success Criteria** (what must be TRUE):
  1. Admin opens any order detail page and sees a `[binder-name]` annotation on every line item — including historical (pre-v1.3) orders, which gracefully render `[unsorted]` from the migration default — and the annotation reads from `order_items.binder` so it survives even if the source `cards` row was later deleted by a re-import
  2. Admin opens `/admin` (inventory table) and sees a `Binder` column populated for every row, plus a filter dropdown populated from `SELECT DISTINCT binder FROM cards` that, when set, restricts the table to rows in the selected binder
  3. Admin opens `/admin/audit` and a scoped-import `import_history` row renders the per-binder breakdown in a compact, human-readable form: selected binders listed, per-binder before/after row counts shown, new binders flagged, missing binders flagged, all without scrolling or JSON dumps
**Plans**: 2 plans

Plans:
- [ ] 21-01-PLAN.md — Admin inventory: `getAdminCards()` extension with `if (binder) conditions.push(eq(cards.binder, binder))`, new `Binder` column rendering, binder filter dropdown populated from `SELECT DISTINCT binder`, `AdminDashboardStats.byBinder` breakdown
- [ ] 21-02-PLAN.md — Admin order detail: `[binder]` annotation per `order_items` row (graceful render for `binder IS NULL` historical rows), and audit page rendering of `ScopedImportAuditMetadata` (selected binders, per-binder before/after, new/missing) in compact form

**UI hint**: yes

### Phase 22: Hardening & UAT
**Goal**: STRIDE delta document records and resolves the new I-DISC-05 (binder leak) finding plus the deferred D-DOS-01 (import preview rate-limit) since v1.3 amplifies its per-call cost; multi-binder concurrent-checkout proof harness extends the Phase 11 baseline; performance is pinned and live-deployment UAT scenarios pass
**Depends on**: Phase 18 (allocator), Phase 19 (scoped-import preview), Phase 20 (PublicCard/AdminCard type split), Phase 21 (admin visibility)
**Requirements**: HARD-01, HARD-02, HARD-03, HARD-04
**Success Criteria** (what must be TRUE):
  1. The multi-binder concurrent-proof harness (`src/db/__tests__/orders.test.ts` extension over the Phase 11 baseline) demonstrates that two simultaneous orders requesting overlapping binder stock serialize atomically: `successCount === 1, conflictCount === 1`, total decrement equals total available, no `quantity < 0` rows, and the SAME pin runs green in CI before merge
  2. `.planning/phases/22-hardening/22-SECURITY-REVIEW.md` records I-DISC-05 (binder name privacy) with the `PublicCard`/`AdminCard` type split + per-route invariant tests as the resolved mitigation, AND records D-DOS-01 (rate-limit on `/api/admin/import/preview`) as resolved by applying the deferred Phase 15 follow-up since v1.3 amplifies the per-call cost
  3. A perf pin in unit tests asserts `parseManaboxCsvContents(12_749 rows) < 2000ms`, and a Playwright (or equivalent) test asserts the binder picker renders in the admin browser within 3 seconds of upload — both pins run green in CI
  4. Live-deployment UAT scenarios pass and are documented in `22-HUMAN-UAT.md`: (a) operator-on-autopilot binder picker (confirmation modal catches the unintentionally-deselected binder), (b) v1.2 → v1.3 cart hydration (manually re-create v1.2 localStorage in DevTools, deploy v1.3, verify cart hydrates correctly under aggregated keys), (c) over-decrement detection via CHECK constraint trip (manually attempt to drive a row negative, confirm 503 not silent oversell), (d) public-page binder-name leak grep (curl `GET /`, `GET /cart`, `POST /api/checkout` 200 + 409 shapes, grep response bodies for any binder name in a seeded distinctive form like `__bind_leak_canary__`)
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — STRIDE delta document (I-DISC-05 + D-DOS-01 resolution), multi-binder concurrent-proof harness extension, `/api/admin/import/preview` rate-limit applied (D-DOS-01 fix)
- [ ] 22-02-PLAN.md — Perf pins (`parseManaboxCsvContents` < 2000ms unit test + Playwright picker-render < 3s), live-deployment UAT scenarios + `22-HUMAN-UAT.md`

## Progress

**Execution Order:**
Phases execute in numeric order with v1.3 ordering refined per research recommendation: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 10.1 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 20 → 19 → 18 → 21 → 22

| Phase | Milestone | Plans Complete | Status   | Completed  |
|-------|-----------|----------------|----------|------------|
| 1. Data Pipeline                            | v1.0 | 3/3 | Complete | 2026-04-02 |
| 2. Card Catalog                             | v1.0 | 3/3 | Complete | 2026-04-06 |
| 3. Search and Filters                       | v1.0 | 3/3 | Complete | 2026-04-07 |
| 4. Shopping Cart                            | v1.0 | 3/3 | Complete | 2026-04-08 |
| 5. Checkout and Deploy                      | v1.0 | 3/3 | Complete | 2026-04-11 |
| 6. Database Foundation                      | v1.1 | 2/2 | Complete | 2026-04    |
| 7. Storefront Migration                     | v1.1 | 2/2 | Complete | 2026-04    |
| 8. Authentication                           | v1.1 | 2/2 | Complete | 2026-04    |
| 9. Admin Inventory Management               | v1.1 | 3/3 | Complete | 2026-04-19 |
| 10. CSV Import                              | v1.1 | 3/3 | Complete | 2026-04-20 |
| 10.1. Multi-CSV Import & Delete Inventory   | v1.1 | 1/1 | Complete | 2026-04-26 |
| 11. Checkout Upgrade & Order History        | v1.1 | 2/2 | Complete | 2026-04-26 |
| 12. Bulk Operations & Dashboard             | v1.1 | 2/2 | Complete | 2026-04-27 |
| 13. Admin Order Workflow                    | v1.2 | 2/2 | Complete | 2026-04-27 |
| 14. Inventory Audit Trail                   | v1.2 | 2/2 | Complete | 2026-04-28 |
| 15. Production Hardening                    | v1.2 | 2/2 | Complete | 2026-05-11 |
| 16. Schema & Migration                      | v1.3 | 0/1 | Not started | - |
| 17. Parser & Etched                         | v1.3 | 0/1 | Not started | - |
| 20. Storefront Aggregation & Cart Migration | v1.3 | 0/2 | Not started | - |
| 19. Import Preview & Picker                 | v1.3 | 0/2 | Not started | - |
| 18. Allocator                               | v1.3 | 0/1 | Not started | - |
| 21. Admin Visibility & Audit                | v1.3 | 0/2 | Not started | - |
| 22. Hardening & UAT                         | v1.3 | 0/2 | Not started | - |
