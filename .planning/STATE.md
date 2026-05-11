---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Binder-Aware Inventory & Pick Workflow
status: planning
last_updated: "2026-05-11T00:00:00.000Z"
last_activity: 2026-05-11
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 11
  completed_plans: 0
  percent: 0
current_position:
  phase: 16
  phase_name: "Schema & Migration"
  plan: null
  status: not_started
execution_order:
  - 16
  - 17
  - 20
  - 19
  - 18
  - 21
  - 22
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Friends can easily find and order cards from the bulk collection without friction.
**Current focus:** Phase 16 — Schema & Migration (v1.3 foundation)

## Current Position

Phase: 16 — Schema & Migration
Plan: — (not yet planned; next step is `/gsd-plan-phase 16`)
Status: Roadmap approved, ready to plan
Last activity: 2026-05-11 — v1.3 roadmap created (7 phases, 29 requirements mapped, 100% coverage)

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

Working tree is on `main`. v1.3 planning artifacts (PROJECT.md, REQUIREMENTS.md, research/, ROADMAP.md, STATE.md) are uncommitted. The previous v1.2 milestone is shipped; the previous milestone files have been archived.

Next action: `/gsd-plan-phase 16` to decompose Phase 16 into executable plan files.

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

- Plan Phase 16: `/gsd-plan-phase 16`
