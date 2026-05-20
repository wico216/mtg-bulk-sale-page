# Roadmap: Viki — MTG Bulk Store

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-11)
- ✅ **v1.1 Admin Panel & Inventory Management** — Phases 6-12 (shipped 2026-04-27)
- ✅ **v1.2 Store Operations & Hardening** — Phases 13-15 (shipped 2026-05-11)
- ✅ **v1.3 Binder-Aware Inventory & Pick Workflow** — Phases 16-22 (shipped 2026-05-11)
- 🚧 **v1.4 Import UX & Price Refresh** — Phase 23 (in progress, started 2026-05-20)

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

<details>
<summary>✅ v1.3 Binder-Aware Inventory & Pick Workflow (Phases 16-22) — SHIPPED 2026-05-11</summary>

- [x] Phase 16: Schema & Migration (1/1 plan) — completed 2026-05-11 (operator cutover pending)
- [x] Phase 17: Parser & Etched (1/1 plan) — completed 2026-05-11
- [x] Phase 18: Allocator (1/1 plan) — completed 2026-05-11 (5x flake check pending TEST_DATABASE_URL)
- [x] Phase 19: Import Preview & Picker (2/2 plans) — completed 2026-05-11
- [x] Phase 20: Storefront Aggregation & Cart Migration (2/2 plans) — completed 2026-05-11
- [x] Phase 21: Admin Visibility & Audit (2/2 plans) — completed 2026-05-11
- [x] Phase 22: Hardening & UAT (2/2 plans) — completed 2026-05-11 (live UAT pending operator)

</details>

### v1.4 Import UX & Price Refresh (Phase 23) — COMPLETE (pending operator setup + UAT)

- [x] **Phase 23: Import UX & Price Refresh** — Daily Scryfall price refresh + explicit opt-in binder picker (completed 2026-05-20)

## Phase Details

### Phase 23: Import UX & Price Refresh
**Goal**: Operator-trusted import workflow (explicit opt-in binder selection) and autonomous, observable price freshness (daily Scryfall refetch + manual escape hatch + `/admin/health` surface).
**Depends on**: Phase 22 (v1.3 shipped — binder picker exists, audit log shape locked, `/admin/health` framework live)
**Requirements**: IMPORT-UX-01, IMPORT-UX-02, IMPORT-UX-03, IMPORT-UX-04, IMPORT-UX-05, PRICE-REFRESH-01, PRICE-REFRESH-02, PRICE-REFRESH-03, PRICE-REFRESH-04, PRICE-REFRESH-05, PRICE-REFRESH-06, PRICE-REFRESH-07, PRICE-REFRESH-08, PRICE-REFRESH-09, PRICE-REFRESH-10, PRICE-REFRESH-11
**Success Criteria** (what must be TRUE):
  1. A daily Vercel Cron at `0 9 * * *` UTC refreshes all card prices and writes one `admin_audit_log` row per run with `{trigger, updated, unchanged, failed, skipped, durationMs}` metadata.
  2. The admin can click "Refresh now" on `/admin/health` and see the "Last Price Refresh" tile (which replaces the dead "Notification failures" tile) update to the current timestamp.
  3. Scryfall `not_found` cards never overwrite a previously-good price with NULL; rows missing `scryfallId` are skipped entirely; the etched-per-finish `getPrice` ladder is applied per row and UPDATEs go by 5-segment `cards.id` (never by `scryfall_id`).
  4. Concurrent cron + manual invocations are single-flighted by a Postgres advisory lock; the second caller returns HTTP 409, the first run completes, and audit-log counts stay honest.
  5. `/admin/health` JSON reports `cronSecret` as the literal `"configured"` or `"missing"` (never the value), and flips top-level `ok` to `false` when missing; the cron route fails closed (401) when the env var is absent.
  6. A fresh-session import opens the binder picker with every binder unchecked regardless of any prior-session selection memory; Select All / Deselect All buttons toggle every binder in one click; a live "X of Y selected" counter updates as the operator clicks; the Continue button is disabled with helper text when nothing is selected and no will-delete entry is checked.
**Plans**:
  - **Plan 23-01: Daily Price Refresh** — PRICE-REFRESH-01..11 (write-side; MEDIUM risk; ships first because operator UAT happens against the deployed cron)
  - **Plan 23-02: Import Picker UX** — IMPORT-UX-01..05 (UI-only; LOW risk; interleaves or follows Plan 23-01)
**UI hint**: yes

## Progress

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
| 16. Schema & Migration                      | v1.3 | 1/1 | Complete | 2026-05-11 |
| 17. Parser & Etched                         | v1.3 | 1/1 | Complete | 2026-05-11 |
| 18. Allocator                               | v1.3 | 1/1 | Complete | 2026-05-11 |
| 19. Import Preview & Picker                 | v1.3 | 2/2 | Complete | 2026-05-11 |
| 20. Storefront Aggregation & Cart Migration | v1.3 | 2/2 | Complete | 2026-05-11 |
| 21. Admin Visibility & Audit                | v1.3 | 2/2 | Complete | 2026-05-11 |
| 22. Hardening & UAT                         | v1.3 | 2/2 | Complete | 2026-05-11 |
| 23. Import UX & Price Refresh               | v1.4 | 2/2 | Complete   | 2026-05-20 |
