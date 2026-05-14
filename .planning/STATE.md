---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Binder-Aware Inventory & Pick Workflow
status: Awaiting next milestone
last_updated: "2026-05-14T10:37:56.000Z"
last_activity: 2026-05-14 — Quick task 260514-95g completed: storefront Set filter search is now the first set-list row and clears after selection
progress:
  total_phases: 22
  completed_phases: 21
  total_plans: 44
  completed_plans: 45
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Friends can easily find and order cards from the bulk collection without friction.
**Current focus:** Planning next milestone (`/gsd:new-milestone`)

## Deferred Items

Items acknowledged and deferred at v1.3 milestone close on 2026-05-11:

| Category | Item | Status |
|----------|------|--------|
| operator_handoff | Phase 16 production migration cutover | `npm run migrate:v1.3:dry-run` then `npm run migrate:v1.3` against prod DATABASE_URL; runbook in 16-01-SUMMARY.md |
| operator_handoff | Phase 22 5-scenario live-deployment UAT | Operator-on-autopilot picker, v1.2→v1.3 cart hydration, CHECK trip detection, public-page binder leak grep, multi-binder concurrent checkout — runbook in 22-HUMAN-UAT.md |
| ~~deferred~~ → **active** | ~~Phase 18 concurrent-proof~~ | **PROMOTED 2026-05-13 to Operator Next Steps** — see todo `.planning/todos/pending/01-phase-18-concurrent-proof.md`. Reason: the same harness that would have caught the v1.3.5 `FOR UPDATE`+window-function regression remains env-gated. Two prod incidents within 48h justify provisioning. |
| process_artifact | Phase 22 missing canonical VERIFICATION.md aggregator | Work captured in 22-SECURITY-REVIEW.md + 22-HUMAN-UAT.md + per-plan SUMMARYs; aggregator file absent |
| verification_gap | 02-VERIFICATION.md | human_needed (v1.0 historical, never closed via /gsd:complete-milestone) |
| verification_gap | 04-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 05-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 08-VERIFICATION.md | human_needed (v1.1 historical) |
| process_artifact | VALIDATION.md missing across all v1.3 phases (16-22) | Nyquist coverage absent project-wide; matches v1.0/v1.1/v1.2 baseline |
| security_followup | S-01 (case-sensitive admin email) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-02 (rate-limit table maintenance) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-03 (header-trust IP source) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | I-DISC-03 (notification-failure queryability) | acknowledged in 15-SECURITY-REVIEW.md |
| RESOLVED v1.3 | D-DOS-01 (import preview rate-limit) | RESOLVED in Phase 22 — ADMIN_BULK rate-limit applied AFTER requireAdmin() |

## Current Position

Phase: Milestone v1.3 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-11 — Milestone v1.3 completed and archived

## v1.3 Phase Sequence

Execution order (research-recommended; deviates from numeric where lower-risk read-side ships before write-side):

1. **Phase 16 — Schema & Migration** — foundation; binder column, finish enum, CHECK constraint, idempotent migration
2. **Phase 17 — Parser & Etched** — populates the new column; fixes latent v1.2 etched-as-normal bug
3. **Phase 20 — Storefront Aggregation & Cart Migration** — read-side first (more reversible); aggregates qty across binders, splits PublicCard/AdminCard, reconciles v1.2 carts
4. **Phase 19 — Import Preview & Picker** — write-side scoped replace; two-stage NDJSON; remembered selection
5. **Phase 18 — Allocator** — highest-risk; pure SQL CTE allocator with multi-binder concurrent-proof
6. **Phase 21 — Admin Visibility & Audit** — admin inventory binder column + filter; `[binder]` annotation on order detail; audit metadata rendering
7. **Phase 22 — Hardening & UAT** — STRIDE delta (I-DISC-05 + D-DOS-01 resolution); perf pin; live-deployment UAT

## Recently Completed

- v1.2 Store Operations & Hardening shipped 2026-05-11 (Phases 13-15; live at `wikos-spellbinder.vercel.app`; 3/3 UAT passed)
- v1.3 milestone bootstrap: PROJECT.md updated, REQUIREMENTS.md (29 requirements), research synthesis complete (STACK/FEATURES/ARCHITECTURE/PITFALLS + SUMMARY)
- v1.3 ROADMAP.md created with 7 phases, 100% requirement coverage, success criteria derived from research findings

## Cross-Cutting Constraints (from research)

These constraints apply across multiple v1.3 phases and MUST be honored during planning and implementation:

- **Phase 16 migration must dry-run on a Neon branch BEFORE merge.** Three pre-flight assertions: (a) no row already has `-unsorted` suffix, (b) no `binder` column yet exists, (c) capture `order_items.cardId` distribution before/after to verify zero new mismatches. `pg_dump` to `.planning/migrations/v1.3/backups/` before merge.
- **Phase 17 etched literal verification step happens FIRST.** 5-minute manual test: operator exports one binder containing a known etched-foil card, greps the CSV, confirms `Foil` column literally equals `etched` BEFORE writing parser test fixtures.
- **Phase 18 allocator MUST be one SQL CTE in one `db.execute()`.** No JS-side pre-allocation. Lock by `(set_code, collector_number, finish, condition)` aggregated key, NOT by chosen rows. `neon-http` has no interactive transactions; pre-computing then `id IN (...)` locking is the load-bearing correctness bug.
- **Phase 18 concurrent-proof harness extended.** Multi-binder scenario: seed `(X,A02,2)`, `(X,A05,2)`, fire two `placeCheckoutOrder({ X: 3 })`, assert one success + one conflict + total stock conserved.
- **Phase 19 two-stage NDJSON contract.** `{ type: 'binders', binders: [...] }` fires after parse (<2s), enrichment runs ONLY on selected subset. Confirmation modal between picker and commit catches operator-on-autopilot.
- **Phase 20 `PublicCard`/`AdminCard` type split.** TypeScript guarantees binder names never reach storefront at compile time. Per-route invariant tests for `GET /`, `GET /cart`, `POST /api/checkout`. Cart reconciliation EXTENDS Phase 10-03 D-13 pattern (NOT a Zustand `migrate` hook — `migrate` can't see `cardMap`).
- **Phase 21 `[binder]` annotation reads from `order_items.binder` snapshot.** NOT joined to live `cards`. Annotation must survive even if source `cards` row was later deleted by a re-import. Historical (pre-v1.3) `order_items` rows render as `[unsorted]` from the migration default.
- **Phase 22 STRIDE delta document.** Records I-DISC-05 (binder name privacy) + resolves deferred D-DOS-01 (rate-limit on `/api/admin/import/preview` since v1.3 amplifies per-call cost). Perf pin: `parseManaboxCsvContents(12_749) < 2000ms`. Multi-binder concurrent-proof.

## Blockers/Concerns

- No active blocker.
- 30-minute spike during Phase 16 planning: verify `db.batch([sql\`...\`])` type compatibility with drizzle-orm@0.45.2; fall back to `db.execute(sql\`BEGIN; ALTER…; COMMIT;\`)` multi-statement raw SQL if batch typings reject.
- Manabox `"etched"` literal verification (Phase 17) is MEDIUM-confidence in research; resolve via 5-minute manual export inspection BEFORE writing parser test fixtures.

## Session Continuity

Last session: 2026-05-11 — Resumed v1.3.1-patch paused at task 5/6. Unwound WIP bookkeeping commit `534677f`, pushed 4 patch commits (`2331068..555ddbc`) + annotated tag `v1.3.1` to `origin/main`. Vercel auto-deploy triggered.

v1.3.1 (Faster CSV-Import Pricing Enrichment) shipped: batched Scryfall `/cards/collection` fetcher resolves the Axx-binder import timeout reported in v1.3.0. Tests 464/2 skipped/0 failed; tsc + build clean.

Next action: Operator verifies Vercel deployment ` Ready` and re-attempts Axx-binder import. Then start the next milestone with `/gsd:new-milestone`.

## Deferred Items

Items acknowledged and deferred at v1.2 milestone close on 2026-05-11 (carried forward into v1.3 context):

| Category | Item | Status |
|----------|------|--------|
| verification_gap | 02-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 04-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 05-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 08-VERIFICATION.md | human_needed (v1.1 historical) |
| process_artifact | 13-VERIFICATION.md | missing — phase verified via SUMMARY browser+DB proof |
| process_artifact | 14-VERIFICATION.md | missing — same as 13 |
| process_artifact | VALIDATION.md (Phases 13/14/15) | missing — Nyquist coverage absent project-wide |
| code_quality | src/app/admin/audit/page.tsx:112 raw console.error | bypasses src/lib/logger.ts |
| security_followup | S-01 (case-sensitive admin email) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-01 (import preview rate-limit) | **owner = Phase 22 (v1.3 amplifies per-call cost)** |
| security_followup | D-DOS-02 (rate-limit table maintenance) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-03 (header-trust IP source) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | I-DISC-03 (notification-failure queryability) | acknowledged in 15-SECURITY-REVIEW.md |

## Operator Next Steps

1. **(NEXT) Provision `TEST_DATABASE_URL` and run the Phase 18 concurrent-proof harness.** Runbook: `.planning/todos/pending/01-phase-18-concurrent-proof.md`. The v1.3.5 hotfix exposed that this harness — the *single most important test in the milestone per its own CONTEXT D-07* — has never run in CI because it's env-gated. The exact bug class it covers (allocator SQL correctness against real Postgres) already cost two production incidents.
2. Run the deferred Phase 22 5-scenario live-deployment UAT against `wikos-spellbinder.vercel.app` (runbook: `22-HUMAN-UAT.md`).
3. When ready: start the next milestone with `/gsd:new-milestone`.

## Recently Completed

- 2026-05-14 — Quick task 260514-7z2 (buyer_phone end-to-end): code shipped via b17ec52..d101581; prod migration applied (`orders.buyer_phone` column live, 1 existing row preserved with NULL phone, idempotent re-run verified).
- 2026-05-14 — Quick task 260514-95g: storefront Set filter search moved into the set list and clears after selecting a set; code commit `8038d84`.

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260514-95g | Add a searchable first row to the storefront set filter and clear the set search after selecting a set | 2026-05-14 | 8038d84 | [260514-95g-add-a-searchable-first-row-to-the-storef](./quick/260514-95g-add-a-searchable-first-row-to-the-storef/) |
