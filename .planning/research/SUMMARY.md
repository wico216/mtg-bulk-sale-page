# Project Research Summary

**Project:** Viki — MTG Bulk Store
**Milestone:** v1.3 Binder-Aware Inventory & Pick Workflow
**Domain:** Pure data-model + business-logic extension to an existing Next.js + Drizzle + Neon-HTTP storefront (~19,661 LOC TypeScript, 12,749 inventory rows, 28 passing test files, 272 tests). Adds a per-binder dimension to `cards`, a multi-source allocator on checkout, and the new `etched` finish.
**Researched:** 2026-05-11
**Confidence:** HIGH

## Executive Summary

v1.3 is a **schema + algorithm milestone**, not a stack milestone. Every target feature — binder-tagged composite PK, per-binder selective replace, server-side allocator, `[binder]` annotation on order detail, `etched` finish — is achievable with the **already-pinned versions** of `drizzle-orm@0.45.2`, `papaparse@5.5.3`, `next@16.2.2`, `react@19.2.4`, `zustand@5.0.12`, `vitest@4.1.4`, and Tailwind v4. **No new dependencies, no version bumps, no new tooling.** The roadmap should not include a stack-setup phase. SortSwift (a TCG-specific Shopify app) validates almost every UX decision the user has locked: free-text bin labels, group-by-bin on the pick view, aggregate quantity hiding the bin from buyers, bulk-edit between bins. Where v1.3 deviates from SortSwift is the **binder picker on import**, which is the user's locked design and a real workflow win.

The recommended approach is to **lock the schema and the allocator early** (Phases 16 and 18), let the **read-side aggregation and the cart-key migration land in parallel** with the importer's selective replace (Phases 19 and 20 can develop independently of each other after the schema is in), and **finish with hardening**. The allocator MUST be a **single SQL CTE chain** because `neon-http` has no interactive transactions — pre-computing a pick plan in JavaScript then locking just the chosen rows is the **biggest correctness trap** in this milestone and the reason Pitfall 1 is the load-bearing pitfall. Lock by `logical_id`, not by chosen rows; allocate inside the same CTE with a window function; add `CHECK (quantity >= 0)` as the belt-and-suspenders.

The key risks are: (1) the schema migration is destructive (12,749 PKs are being rewritten in place) and must be dry-run on a Neon branch before merge; (2) the `etched` finish is a **latent v1.2 bug at `csv-parser.ts:87`** — every etched card the seller owns is silently treated as `normal`, mis-priced and PK-collided with its non-foil twin; v1.3 is the natural moment to fix this and skipping it grows the cost with every future import; (3) the cart-key transition has to live in the existing Phase 10-03 silent-reconciliation effect, NOT as a Zustand `migrate` hook (the reconciler is the only place that sees both the persisted state and the live `cardMap`); (4) the binder name is a **physical-world identifier** ("top shelf, red box, A02") and must not leak via storefront SSR, stock_conflict payloads, confirmation emails, or structured logs — a `PublicCard`/`AdminCard` type split keeps TypeScript honest about this at compile time.

## Key Findings

### Recommended Stack

Nothing to add. v1.3 is a pure data-model + business-logic extension to the existing stack. The migration is one custom Drizzle SQL file (cannot be auto-generated because the `id`-format rewrite isn't inferrable). The allocator is ~30 lines of TypeScript wrapping one SQL CTE. The binder picker UI is a hand-rolled `<input type="checkbox">` list mirroring the established `filter-rail.tsx` pattern (used in 4 places already). Selection persistence reuses `zustand@5.0.12 persist` middleware (already pinned).

**Core technologies (unchanged):**
- **drizzle-orm@0.45.2 + drizzle-kit@0.31.10** — schema, queries, atomic batch writes. Migration MUST use `drizzle-kit generate --custom` (drizzle-kit cannot infer the `id ||= '-' || binder` data rewrite, and known PK-migration bugs #3496/#3117 make auto-gen risky).
- **papaparse@5.5.3** — extend existing `ManaboxRow` type with two new optional headers (`Binder Name`, `Binder Type`). Two new SkippedRow reasons (`non-binder row`, `zero quantity`).
- **@neondatabase/serverless@1.0.2** — `db.batch([...])` is the ONLY atomic path. `neon-http` driver throws on interactive transactions (`src/db/queries.ts:801` comment). Allocator MUST be one CTE in one `db.execute()`; the existing `placeCheckoutOrder` already proves the pattern.
- **next@16.2.2 + react@19.2.4** — no new APIs needed.
- **zustand@5.0.12** — existing cart store + new `useBinderImportStore` slice with `persist` middleware for "selection remembered between imports."
- **vitest@4.1.4** — allocator is a pure-function unit-test surface; the CTE pinning lives in `src/db/__tests__/orders.test.ts` extension.
- **Existing infra reused:** `RATE_LIMIT_BUCKETS.ADMIN_BULK` (already covers `/api/admin/import/commit`), `admin_audit_log.metadata jsonb`, `import_history.metadata jsonb`, `logEvent` structured logger, `requireAdmin()` Auth.js v5 gate, native `<input type="checkbox">` + Tailwind pattern.

**Critical version notes:**
- Drizzle migration MUST be `--custom` (auto-gen is broken for PK changes per known issues, and cannot express the `id` data rewrite).
- The hidden scope item: `foil: boolean` → `finish text` enum (normal/foil/etched) belongs in the SAME migration. Don't ship binder without etched.

### Expected Features

**Must have (P1 — locked v1.3 scope, 10 features):**
- Manabox CSV parser ingests `Binder Name` + `Binder Type`; skips rows where `Binder Type != 'binder'` (deck/list rows aren't physical stock).
- `cards` composite ID gains `binder` dimension — schema foundation.
- Migration backfills existing rows with `binder = 'unsorted'` so cart/checkout keep working from the moment the schema lands.
- Import preview shows binder picker (every binder name + row count + checkbox + remembered selection via zustand persist).
- Replace semantics scoped to selected binders only; unselected binders untouched.
- Storefront aggregates `SUM(quantity) GROUP BY (set_code, collector_number, foil, condition)`; binder hidden from public pages.
- Server-side allocator at checkout commit: **smallest-quantity-first with lexicographic tiebreaker**, as a SQL CTE inside the existing `placeCheckoutOrder` chain. One buyer line → potentially multiple `order_items` rows.
- Admin order detail shows `[binder]` annotation per line item (read from `order_items.binder` snapshot, NOT joined to live `cards`).
- Admin inventory table gains `Binder` column + filter.
- `etched` becomes a valid `Foil` finish enum value (fixes a latent v1.2 bug — see Pitfall 7).

**Should have (P2 — v1.3.x add-after-validation):**
- Allocator preview in admin order detail (read-only `[binder × qty]` next to each line before commit).
- Bulk-edit binder column with merge-on-collision modal (covers the user's stated "consolidate A02 into A07" workflow).
- `unsorted` filter chip on admin inventory.
- Audit log includes per-line allocated binder.
- Did-you-mean hint at import time for binder names within edit-distance 1.

**Defer (P3 — v1.4+):**
- Configurable allocator strategy.
- Drag-and-drop binder visualization.
- Per-binder capacity tracking.
- Mobile pick-mode UI.
- Binder transfer history.

**Anti-features (P0 — explicitly DO NOT build, prevent scope creep):**
- Separate "pick view" / printable pick list page — admin order detail IS the pick view (validated by SortSwift's docs).
- Per-binder buyer-facing display — friends don't care, leaks physical organization.
- Binder-name regex validation — breaks the user's real binder set (`Bulk Drawers`, `lord of the rings`, `compré titán`); SortSwift accepts free-text.

### Architecture Approach

Pure SQL allocator inside the existing CTE-chain checkout, plus a one-shot custom Drizzle migration for the binder column + PK rewrite + `finish` enum, plus a new aggregated read path for the storefront and a two-line extension to the existing cart-reconciliation effect. ONE new physical column lands on `order_items` (`binder text NOT NULL DEFAULT 'unsorted'`) as a denormalized snapshot — every other v1.3 datum lives in existing JSONB metadata columns.

**Major components:**
1. **Schema migration script (`scripts/migrate-binder.ts`)** — one-shot, runs once before deploy. Single `db.batch([sql\`ADD COLUMN binder text NOT NULL DEFAULT 'unsorted'\`, sql\`DROP CONSTRAINT cards_pkey\`, sql\`UPDATE cards SET id = id || '-' || binder\`, sql\`ADD CONSTRAINT cards_pkey PRIMARY KEY (id)\`])`. Drives the `finish` enum addition in the same batch. Dry-run on a Neon branch first.
2. **`parseManaboxCsvContents` extension** — two new optional headers (`Binder Name`, `Binder Type`); normalize binder at parse time (`trim().toLowerCase().replace(/\s+/g, ' ')` AND replace `-` with `_` to avoid breaking the cart-key segment-strip migration); skip `Binder Type != 'binder'` rows with `SkippedRow.reason = 'non-binder row'`; skip `Quantity === 0` with `'zero quantity'` reason; new 5-segment composite id `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`.
3. **`replaceCardsForBinders(cards, selectedBinders, audit)`** — replaces `replaceAllCards`. `db.batch([delete WHERE binder IN (...), insert, audit, importHistory])`. Audit + import_history metadata gain `selectedBinders`, `binderRowCounts`, `replaceMode`, etc. (bounded ScopedImportAuditMetadata shape, fits ~1.5KB under the 4KB cap).
4. **`getCardsAggregated()`** — new query on `src/db/queries.ts`. Plain `SELECT … SUM(quantity) … GROUP BY (set_code, collector_number, foil, condition)` returning `AggregatedCard[]`. NO materialized view (12,749 rows × hash-aggregate completes sub-50ms; verify with EXPLAIN ANALYZE). `app/page.tsx` swaps `getCards()` → `getCardsAggregated()`. `getCards()` is kept for cart/checkout disaggregated views.
5. **Cart-key migration loop (`src/app/cart/cart-page-client.tsx`)** — 2-line extension to the Phase 10-03 silent-reconciliation `useEffect`. Strip the trailing `-{binder}` segment; if the aggregated candidate is in `cardMap`, transfer quantity; else fall through to existing silent-removal.
6. **Allocator CTE inside `placeCheckoutOrder`** — extend the existing CTE chain. `locked_rows` joins on `(set_code, collector_number, foil, condition)` with `FOR UPDATE` (locks ALL binder rows for the requested logical card, not pre-chosen rows). Window function computes running supply. `LEAST(quantity, GREATEST(0, requested - prior_running_supply))` decides take_qty. UPDATEs decrement. INSERTs one `order_items` row per non-zero binder source, with `binder` snapshotted.
7. **Binder picker component (`src/app/admin/import/_components/binder-picker.tsx`)** — hand-rolled `<input type="checkbox">` list mirroring `filter-rail.tsx`. Two-stage NDJSON contract: `{ type: 'binders', binders: [...] }` fires after parse (<2s), then enrichment runs on the selected subset only. Selection persisted via `useBinderImportStore` zustand slice (localStorage).
8. **`PublicCard`/`AdminCard` type split** — TypeScript guarantees binder names never reach the storefront. Per-route invariant test: `JSON.stringify(response).includes('binder') === false` for `GET /`, `GET /cart`, `POST /api/checkout`.

**Build order:** A (Schema/Migration/Parser) → (B Importer scoped-replace || C Storefront aggregation + Cart migration) → D (Allocator integration in checkout) → E (Admin visibility + audit metadata) → F (Hardening + UAT). B and C are independent after A lands.

### Critical Pitfalls

The pitfall research enumerated **17 pitfalls** (13 critical, 4 moderate). The five load-bearing ones every roadmap phase must keep in mind:

1. **Allocator double-decrement under concurrent checkout (Pitfall 1, Phase 18).** `neon-http` has NO interactive transactions; `FOR UPDATE` outside a transaction releases the lock when the SELECT returns. The CTE MUST lock every row for the requested `logical_id` (`set_code, collector_number, foil, condition`), NOT just the rows the allocator pre-picked. Pre-computing a pick plan in JS then locking by `id IN (...)` is the load-bearing bug. Add `CHECK (quantity >= 0)` on `cards` as the schema-level safety net; over-decrement becomes a 503, not a silent oversell. Extend the Phase 11 concurrent-proof harness to a multi-binder scenario.
2. **`etched` finish silently treated as `normal` (Pitfall 7, Phase 17).** Latent v1.2 bug at `csv-parser.ts:87`: `const foil = row.Foil === "foil"`. Anything not literally `"foil"` becomes `false` — etched cards become non-foil with wrong price (`usd` vs `usd_etched`, often $0.50 vs $25) AND collide on PK with normal printings of the same collector number. Fix as a third finish enum value in the SAME v1.3 migration. Verify Manabox emits the literal string `"etched"` in the Foil column early (manual export inspection — Stack Q4 flagged this as MEDIUM-confidence).
3. **Migration corruption from non-idempotent backfill (Pitfall 4, Phase 16).** Re-running `UPDATE cards SET id = id || '-unsorted'` appends twice → 5-segment ids become 6-segment, every `order_items.cardId` snapshot mismatches. Pre-flight assertions in the migration script: (a) no row already has the `-unsorted` suffix, (b) no `binder` column yet exists, (c) capture `order_items.cardId` distribution before/after to verify zero new mismatches. Dry-run on a Neon branch FIRST; `pg_dump` to `.planning/migrations/v1.3/backups/` before merge.
4. **Cart-key migration silent empty after deploy (Pitfall 5, Phase 20).** v1.2 cart keys are 4 segments (`setCode-collectorNumber-foil-condition`); v1.3 aggregated keys remain 4 segments at the storefront/cart boundary (the allocator does the split server-side). The reconciliation effect at `cart-page-client.tsx:40-47` must extend, not replace, the existing D-13 pattern. Zustand `migrate` hooks can't see `cardMap` and won't work here. Normalize binder names by replacing `-` with `_` at parse time so the segment-strip migration is safe.
5. **Binder-name leak via API responses, emails, structured logs (Pitfall 6, Phase 20/22).** Binder is a physical-world identifier. Split `Card` into `PublicCard` (no binder) and `AdminCard` (has binder); TypeScript catches the leak at compile time. Pin per-route invariant tests asserting `JSON.stringify(response)` never contains `binder` on `GET /`, `GET /cart`, `POST /api/checkout`. STRIDE delta adds I-DISC-05 (binder name privacy). Allocator returns aggregated `available` in stock_conflict — never per-binder breakdown.

Also load-bearing but second-tier:
- **Pitfall 2** (partial allocation contract break — keep all-or-nothing, same `StockConflict` shape with aggregated `available`).
- **Pitfall 10** (binder name typos `"A02"` vs `"A02 "` vs `"a02"` — normalize at parse time).
- **Pitfall 12** (multi-CSV merge collapsing the binder dimension — fixed by including binder in the composite id).
- **Pitfall 13** (audit metadata bounded shape `ScopedImportAuditMetadata` fits ~1.5KB under the 4KB cap).
- **Pitfall 17** (order detail `[binder]` annotation MUST read from `order_items.binder` snapshot, not join to live `cards`).

## Implications for Roadmap

Based on combined research, the natural decomposition is **7 phases (16-22)**. Phases B and C (19 and 20) are independent after the schema lands in Phase 16; ship the lower-risk read-side first if the team prefers.

### Phase 16: Schema & Migration
**Rationale:** Foundation phase. Every other v1.3 feature depends on the binder column + the new 5-segment composite id + the `finish` enum. The migration is destructive (12,749 PKs rewritten in place) and must be dry-run on a Neon branch before merge.
**Delivers:** Custom Drizzle SQL migration adding `binder text NOT NULL DEFAULT 'unsorted'`, dropping/recomputing/re-adding `cards_pkey`, adding `finish text` (or `pgEnum('finish', ['normal','foil','etched'])`) with backfill from existing `foil` boolean, adding `CHECK (quantity >= 0)` constraint, adding `order_items.binder text NOT NULL DEFAULT 'unsorted'`. Migration script (`scripts/migrate-v1.3-binder.ts`) with three pre-flight assertions. `pg_dump` backups. Neon-branch dry-run gate.
**Addresses:** P1 features "composite key includes binder," "migration backfills unsorted," "etched becomes finish enum value." Lays the schema floor for the importer (Phase 19), aggregation (Phase 20), and allocator (Phase 18).
**Avoids:** Pitfall 4 (migration corruption — idempotency pre-flight), Pitfall 1 (CHECK constraint safety net for allocator), Pitfall 7 (etched in the same migration).

### Phase 17: Parser & Etched
**Rationale:** Once the schema accepts binder + finish, the parser must populate them. This phase is where the Manabox column ingest lives, plus the `etched` finish coercion and the binder-name normalization. Co-located because all three are CSV-side concerns.
**Delivers:** `ManaboxRow` interface extended with `"Binder Name"?: string`, `"Binder Type"?: string`. `rowToCardOrSkip` normalizes binder name (`trim().toLowerCase().replace(/\s+/g, ' ')` AND `replace(/-/g, '_')`), skips `Binder Type != 'binder'` rows with `SkippedRow.reason = 'non-binder row'`, skips `Quantity === 0` with `'zero quantity'` reason, sets `finish` from `row.Foil` (with verified handling of the literal `"etched"` string — manual test early), defaults missing `Binder Name` to `"unsorted"`. Composite id becomes `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`. Display layer (cart-item.tsx, card-modal.tsx) reads `finish` instead of `foil`. Parser test fixtures for the cross-binder same-card case, etched-distinct-from-normal case, and the trim/case normalization case.
**Addresses:** P1 features "parser reads Binder Name + Binder Type," "etched finish enum value." Eliminates the v1.2 latent etched bug.
**Avoids:** Pitfall 7 (etched silent mishandle), Pitfall 10 (binder name typo), Pitfall 12 (multi-CSV merge collapsing binder dimension), Pitfall 15 (zero-quantity rows persisting).

### Phase 18: Allocator
**Rationale:** Highest-risk phase. The CTE-chain rewrite of `placeCheckoutOrder` is non-trivial; the concurrent-checkout invariant is load-bearing. Standalone phase to give the unit-test fixture matrix and the multi-binder concurrent-proof harness adequate time.
**Delivers:** Extended CTE in `src/db/orders.ts`: `requested` → `locked_rows` (with `ROW_NUMBER()` and running `SUM()` window functions) → `conflicts` (aggregated `available`) → `can_fulfill` → `allocations` (`LEAST(quantity, GREATEST(0, requested - prior_running_supply))`) → `stock_write` → `inserted_order` → `inserted_items` (one row per non-zero binder source, capturing `binder` into the snapshot). `StockConflict` semantics: `cardId` shifts from per-row id to aggregated id; payload still `{cardId, name, requested, available}` (no per-binder breakdown). `placeCheckoutOrder` input shape unchanged. Pick order: `ORDER BY binder ASC` (deterministic, matches operator's "alphabetically first binder first" mental model). Unit test fixtures: `(2,2,2)×3 = [2,1,0]`, `(2,2,2)×5 = [2,2,1]`, `(2,2,2)×6 = [2,2,2]`, `(2,2,2)×7 = conflict`. Extended concurrent-proof harness.
**Addresses:** P1 features "server-side allocator," "one buyer line → multiple order_items rows."
**Avoids:** Pitfall 1 (lock by logical_id, not chosen rows; CHECK quantity >= 0), Pitfall 2 (all-or-nothing semantics preserved), Pitfall 14 (deterministic pick order pinned), Pitfall 17 (binder snapshotted into order_items at insert time).
**Uses stack elements:** `db.execute(sql\`...\`)` single CTE (the only atomic path on neon-http).

### Phase 19: Import Preview & Picker
**Rationale:** Operator UX phase. The two-stage NDJSON streaming protocol, the binder picker component, the selective replace semantics, and the bounded audit-metadata shape all live here. Can be developed in parallel with Phase 20 after Phase 16 lands.
**Delivers:** New NDJSON message kind `{ type: 'binders', binders: BinderSummary[] }` fires after parse (<2s), before enrichment. `binder-picker.tsx` hand-rolled `<input type="checkbox">` component (mirrors `filter-rail.tsx`). `useBinderImportStore` zustand slice persists selection in localStorage. Default-on for new binders (highlighted "NEW"), default-shown for missing-from-export binders in a separate "Will delete" panel (Pitfall 9 — operator must explicitly uncheck). Confirmation modal with per-binder ADD/REPLACE/DELETE breakdown. `replaceAllCards` → `replaceCardsForBinders(cards, selectedBinders, audit)` with `db.batch([delete WHERE binder IN (selectedBinders), insert, audit, importHistory])`. Audit metadata follows the `ScopedImportAuditMetadata` shape (selectedBinders, totalBindersInExport, scopedReplaceCounts.before/after, deletedFromUnselected: 0 literal, totalCardsAfterImport, newBindersInExport, missingBindersFromExport). Two-call flow (binders-then-enrichment) preferred over hold-and-resume.
**Addresses:** P1 features "import preview shows binder picker," "selection remembered between imports," "replace semantics scoped to selected binders only."
**Avoids:** Pitfall 8 (picker latency — parse-first/enrich-after streaming), Pitfall 9 (remembered selection silently drops new binders — confirmation modal catches autopilot), Pitfall 13 (audit metadata bounded under 4KB).
**Uses stack elements:** Existing NDJSON streaming pattern in `/api/admin/import/preview/route.ts`. `RATE_LIMIT_BUCKETS.ADMIN_BULK` reused for the selective commit. Existing `requireAdmin()` gate.

### Phase 20: Storefront Aggregation & Cart Migration
**Rationale:** Read-side change. Lower risk than write-side; can ship before Phase 19 if the team prefers reversibility. Includes the cart-key reconciliation extension and the `PublicCard`/`AdminCard` type split.
**Delivers:** `getCardsAggregated()` in `src/db/queries.ts`: plain `SELECT … SUM(quantity) … GROUP BY (set_code, collector_number, foil, condition)`. Aggregated id construction: `set_code || '-' || collector_number || '-' || (CASE WHEN foil THEN 'foil' ELSE 'normal' END) || '-' || condition`. `app/page.tsx` swaps `getCards()` → `getCardsAggregated()`. `app/cart/page.tsx` and `app/checkout/page.tsx` keep `getCards()` (still need disaggregated rows). Cart reconciliation extension (`src/app/cart/cart-page-client.tsx:40-47`): segment-count guard + last-`-{binder}`-segment strip + transfer-quantity-into-aggregated-candidate + clamp-to-current-stock. Optional one-time toast on first v1.3 visit (`viki-cart-version: '1.3'` sentinel). `PublicCard`/`AdminCard` type split in `src/lib/types.ts` — `binder` lives ONLY on `AdminCard`. Per-route invariant tests for `GET /`, `GET /cart`, `POST /api/checkout`.
**Addresses:** P1 features "storefront aggregates qty across binders," "binder hidden from public pages."
**Avoids:** Pitfall 5 (cart-key migration silent empty — reconciliation extension), Pitfall 6 (binder leak — type split + invariant tests), Pitfall 11 (stock changes mid-cart — clamp to current).
**Uses stack elements:** Existing Phase 10-03 silent-reconciliation contract. Existing zustand persistence with custom Map serializer.

### Phase 21: Admin Visibility & Audit
**Rationale:** Admin-facing reads. Adds the binder column to inventory table, filter, and the `[binder]` annotation on order detail. Reads `order_items.binder` snapshot (NOT joined to live `cards`).
**Delivers:** Admin inventory table at `getAdminCards()` adds binder filter (`if (binder) conditions.push(eq(cards.binder, binder))`). New `Binder` column + filter dropdown populated from `SELECT DISTINCT binder`. Admin dashboard `AdminDashboardStats.byBinder` breakdown. Admin order detail page renders `[binder]` per `order_items` row from the snapshot column. Audit log page renders the new ScopedImportAuditMetadata fields. Optionally: `unsorted` filter chip (P2).
**Addresses:** P1 features "admin order detail shows [binder] annotation," "admin inventory table gains Binder column + filter."
**Avoids:** Pitfall 17 (snapshot column, not live join), Pitfall 3 (graceful degradation for missing `cards` row).

### Phase 22: Hardening & UAT
**Rationale:** Closing phase. STRIDE delta document (I-DISC-05 binder leak; D-DOS-01 amplification on import preview rate-limit). Multi-binder concurrent-proof harness. Performance pins. Operator UAT.
**Delivers:** STRIDE delta in `.planning/phases/22-hardening/22-SECURITY-REVIEW.md` adding I-DISC-05 and the resolved mitigations. Multi-binder concurrent-checkout proof in `src/db/__tests__/orders.test.ts` extending the Phase 11 baseline. Apply the deferred D-DOS-01 fix (rate-limit on `/api/admin/import/preview` — Phase 15 deferred Medium; v1.3 amplifies the per-call cost). Perf pin: `parseManaboxCsvContents(12_749) < 2000ms`. Playwright test: picker renders within 3s of upload. UAT scenarios from the Pitfall research checklist (operator-on-autopilot binder picker; v1.2 → v1.3 cart hydration; over-decrement detection via CHECK constraint; binder leak grep).
**Addresses:** Production readiness.
**Avoids:** Pitfall 8 (perf pin), Pitfall 9 (UAT catches autopilot), Pitfall 6 (STRIDE delta finalizes the type-split contract).

### Phase Ordering Rationale

- **Phase 16 must come first** — it's the schema floor; everything else writes-against or reads-against the new shape.
- **Phase 17 must follow 16** — parser populates the new column; can't run before the column exists.
- **Phase 18 can run in parallel with 19+20** in principle, but it's the highest-risk phase and benefits from being a focused standalone phase. Recommend after the parser is solid (Phase 17) and after Phase 20's aggregated read shape is locked (so the allocator's input shape is final).
- **Phase 19 and Phase 20 are independent after Phase 16.** Phase 19 is write-side (importer); Phase 20 is read-side (storefront + cart). Recommend Phase 20 first because read-side changes are more reversible — if the aggregation has a bug, no data corruption; if the importer has a bug, history is corrupted.
- **Phase 21 needs Phase 18's `order_items.binder` snapshot column** to be populated, and needs Phase 16's binder column for the inventory filter.
- **Phase 22 is closing.** Multi-binder concurrent-proof needs the allocator (18); STRIDE delta needs the type split (20); perf pins need the importer (19).

Suggested execution: 16 → 17 → 20 → 19 → 18 → 21 → 22. Phases 19 and 20 can interleave after 17.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 18 (Allocator):** The CTE shape needs careful validation. The `LEAST(quantity, GREATEST(0, requested - prior_running_supply))` arithmetic is correct but non-obvious. Recommend a `/gsd-research-phase` for the unit-test fixture matrix and the concurrent-proof harness extension. Verify that `FOR UPDATE OF cards` (explicit table reference) is required when the CTE has multiple joined tables.
- **Phase 16 (Schema):** Verify on a Neon branch BEFORE roadmap approval that the `db.batch([sql\`ALTER…\`, sql\`UPDATE…\`])` shape actually compiles against drizzle-orm@0.45.2's TypeScript. The Architecture research flagged a NOTE that batch typings may reject `db.execute(sql\`...\`)` calls inside a batch; fall back to one multi-statement raw SQL (`db.execute(sql\`BEGIN; ALTER…; COMMIT;\`)`) if so. This is a 30-minute spike, not a phase.
- **Phase 19 (Import Preview):** Two-stage NDJSON contract design needs to be reviewed against the existing `ImportStreamMessage` type and the client reader at `import-client.tsx:101-145`. Recommend a `/gsd-research-phase` if the two-call vs hold-and-resume choice isn't clear from the existing patterns.

Phases with standard patterns (skip research-phase):

- **Phase 17 (Parser):** Established `rowToCardOrSkip` pattern. Just extend.
- **Phase 20 (Storefront aggregation):** Plain `GROUP BY`. The cart-key migration is a 2-line extension to an existing effect. Type split is mechanical.
- **Phase 21 (Admin visibility):** Pure UI + existing query extension patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against installed `package.json`, `node_modules/drizzle-orm/package.json` (0.45.2), `node_modules/drizzle-kit/package.json` (0.31.10). Zero new dependencies needed. WebSearch exhaustively confirmed no published Manabox parser exists. Drizzle PK-migration bugs #3496/#3117 are MEDIUM-confidence on whether they're fixed in 0.31.10 — mitigated by using `--custom` migration. Manabox emitting the literal `"etched"` string is MEDIUM — needs manual verification early. |
| Features | HIGH | SortSwift (TCG-specific Shopify app) is a direct competitor with documented patterns matching v1.3's locked decisions. 10 P1 features map cleanly to the user's locked spec. 3 P0 anti-features documented to prevent scope creep. Multi-platform validation (TCGplayer, Shopify, BigCommerce, Magento) confirms sum-the-quantities buyer aggregation is universal. Allocator strategy choice (smallest-first + lex tiebreaker) grounded in SAP / Extensiv WMS literature. |
| Architecture | HIGH | Every claim verified against `src/db/schema.ts`, `src/db/queries.ts`, `src/db/orders.ts`, `src/lib/csv-parser.ts`, `src/lib/store/cart-store.ts`, `src/app/cart/cart-page-client.tsx`, and the git history of phases 13/14/15. The single-`db.batch` migration pattern mirrors the existing `replaceAllCards`. The CTE-allocator pattern extends the existing `placeCheckoutOrder`. The cart-reconciliation extension fits the established D-13 contract. MEDIUM only for the suggested phase order — team may prefer ship-D-first behind a feature flag. |
| Pitfalls | HIGH | 17 pitfalls each grounded in a specific file:line or documented Phase 11/14/15 invariant. The five critical pitfalls (1, 4, 5, 6, 7) are the load-bearing ones; Pitfall 1 (lock by logical_id, not chosen rows) is the single most important correctness invariant. STRIDE delta is bounded (one new Medium, one amplification of an existing Medium). |

**Overall confidence:** HIGH.

### Gaps to Address

- **Manabox `"etched"` literal string verification.** Stack research flagged MEDIUM-confidence that Manabox emits `Foil="etched"` (not `Foil="Etched Foil"` or `Foil="foil-etched"` or similar). Recommend a 5-minute manual export inspection early in Phase 17 — have the operator export one binder containing a known etched-foil card and grep the CSV. Resolve before the parser test fixtures are written.
- **Drizzle `db.batch([sql\`...\`])` type compatibility.** Architecture research flagged a NOTE that batch typings may reject raw `sql` calls inside a batch. 30-minute spike during Phase 16 planning; fall back to `db.execute(sql\`BEGIN; …; COMMIT;\`)` if needed.
- **Two-stage NDJSON protocol vs hold-and-resume.** Architecture recommends two-call (stateless, simpler). Phase 19 planning should validate against the existing `import-client.tsx` reader and decide before implementation starts.
- **`order_items.binder` for historical (pre-v1.3) orders.** Will be NULL after migration. Admin order detail UI must render gracefully (show `[unsorted]` or omit the annotation for `binder IS NULL`).
- **Migration dry-run on Neon branch.** Schedule this as a gate before merging Phase 16 to main. Use `pg_dump` + the three pre-flight assertions from Pitfall 4.

## Sources

### Primary (HIGH confidence)

- **Existing repo (direct file reads):** `src/db/schema.ts`, `src/db/queries.ts`, `src/db/orders.ts`, `src/lib/csv-parser.ts`, `src/lib/types.ts`, `src/lib/import-contract.ts`, `src/app/cart/cart-page-client.tsx`, `src/app/api/admin/import/{preview,commit}/route.ts`, `src/components/filter-rail.tsx`, `src/components/cart-item.tsx`, `package.json`, `drizzle.config.ts`, `node_modules/drizzle-orm/package.json`, `node_modules/drizzle-kit/package.json`.
- **Existing phase documents:** `.planning/PROJECT.md`, `.planning/phases/15-production-hardening/15-SECURITY-REVIEW.md`, `.planning/phases/11-checkout-upgrade-order-history/11-01-SUMMARY.md`, `.planning/phases/{13,14}/SUMMARY.md`. Git commits `dec5dbe` (Phase 10-03 silent reconciliation), `87cf95d` (Phase 13 schema diff), `f04fc7b` (Phase 14 schema diff).
- **Drizzle ORM:**
  - [Drizzle Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — workaround pattern for the unsupported `id`-rewrite DDL.
  - [Drizzle Batch API](https://orm.drizzle.team/docs/batch-api) — atomic batched DELETE+INSERT with neon-http.
  - [Drizzle Migrations overview](https://orm.drizzle.team/docs/migrations) — `drizzle-kit generate --custom` flow.
- **SortSwift (TCG-specific Shopify app, the closest competitor):**
  - [Picklist Location Grouping](https://sortswift.com/docs/inventory/picklist/location-grouping) — free-text bin labels, sort-by-bin pick UX, "items without remarks at end" pattern.
  - [Location Summary](https://sortswift.com/docs/inventory/location-summary) — multi-bin same-card aggregation, transfer between locations.
  - [Inventory Management feature page](https://sortswift.com/features/inventory).
- **Allocator strategy literature:**
  - [SAP Bin Location optimization](https://blogs.sap.com/2016/06/09/optimizing-bin-location-warehouse-storage-or-numbers-of-picks/) — smallest-first vs largest-first toggle with named consequences.
  - [Extensiv 3PL Allocation Logic](https://help.extensiv.com/3pl-warehouse-manager-inventory-management/understanding-allocation-logic).
  - [Shopify Smart Order Routing](https://www.shopify.com/blog/smart-order-routing) — ranked location prioritization.
- **Manabox format:**
  - [Manabox Import/Export Guide](https://www.manabox.app/guides/collection/import-export/) — confirms `binder/deck/list` enum on `Binder Type`.
  - [Manabox Collection FAQ](https://www.manabox.app/guides/collection/faq/) — three container types.

### Secondary (MEDIUM confidence)

- [Drizzle ORM GitHub Issue #3496 — PK migration codegen bug](https://github.com/drizzle-team/drizzle-orm/issues/3496) — known PK-change codegen issue; fix status not confirmed for 0.31.10. Mitigated by `--custom` migration.
- [Drizzle ORM GitHub Issue #3117 — adding column-as-PK generates broken migration](https://github.com/drizzle-team/drizzle-orm/issues/3117) — second PK-related bug class. Same mitigation.
- Manabox emitting the literal string `"etched"` in the `Foil` column for etched-foil cards — column names not formally specified in public docs. Recommend manual verification early in Phase 17.
- [TCGplayer — Selling from Multiple Physical Stores](https://help.tcgplayer.com/hc/en-us/articles/115005291707-Selling-from-Multiple-Physical-Stores) — confirms "Total Qty" aggregation semantics.
- [Mana Pool — CSV Inventory Export ManaBox Format](https://support.manapool.com/hc/en-us/articles/26131255560855-CSV-Inventory-Export-ManaBox-Format) — third-party confirmation of Manabox column shape.

### Tertiary (LOW confidence)

- eBay seller anti-pattern references (community forum data) — supports the "don't stuff bin into SKU" anti-feature; not a load-bearing source.
- Stock display urgency tactics (Magento / BigCommerce) — supports the anti-feature "don't show low-stock thresholds to buyers"; not load-bearing.

---

*Research completed: 2026-05-11*
*Ready for roadmap: yes*
*Detail documents: `STACK.md` (309 lines), `FEATURES.md` (294 lines), `ARCHITECTURE.md` (744 lines), `PITFALLS.md` (880 lines).*
