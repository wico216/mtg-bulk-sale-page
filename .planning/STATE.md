---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Import UX & Price Refresh
status: Awaiting next milestone
last_updated: "2026-05-20T23:25:23.603Z"
last_activity: 2026-05-20 — Milestone v1.4 completed and archived
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Friends can easily find and order cards from the bulk collection without friction.
**Current focus:** v1.4 milestone complete (human UAT passed 2026-05-20); ready for `/gsd:complete-milestone` after operator provisions `CRON_SECRET` and confirms first live cron firing.

## Current Position

Phase: Milestone v1.4 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-20 — Milestone v1.4 completed and archived

## v1.4 Phase Sequence

Single phase, two plans. Plans are fully independent (no shared files, no shared state), so plan order is risk-driven:

1. **Plan 23-01 — Daily Price Refresh** (PRICE-REFRESH-01..11) — write-side; MEDIUM risk; needs operator UAT against deployed cron + `CRON_SECRET` env setup
2. **Plan 23-02 — Import Picker UX** (IMPORT-UX-01..05) — UI-only; LOW risk; can interleave or follow

## Cross-Cutting Constraints (from research)

These constraints apply across the v1.4 plans and MUST be honored during planning and implementation:

- **NO env-gated test for the cron handler.** The v1.3.5 incident pattern was an env-gated test silently skipping in CI. The cron handler test MUST be a default-run unit test using `vi.stubEnv("CRON_SECRET", …)` + mocked Scryfall fetcher + mocked DB; file-header comment must say "NOT env-gated."
- **`runPriceRefresh` is a shared service called by two thin route handlers.** `GET /api/cron/refresh-prices` (Bearer-token auth) and `POST /api/admin/prices/refresh` (`requireAdmin()` + `ADMIN_BULK` rate-limit) both call `runPriceRefresh({ trigger, actorEmail? })`. The service is `"server-only"` and auth-agnostic; auth happens at the route boundary only. No HTTP between the two routes.
- **UPDATE by `cards.id` (5-segment), NEVER by `scryfall_id`.** Same Scryfall card maps to N rows (one per finish × condition × binder). The refresh applies the existing `getPrice(prices, finish)` ladder PER ROW. UPDATE-by-scryfall_id would re-introduce the v1.2 etched-mispricing bug fixed in Phase 17 FIN-01.
- **NEVER write `price = NULL` for Scryfall `not_found`.** Skip rows with no `scryfallId`; preserve existing price when `scryfallMap.get(id)` is undefined (Scryfall `not_found`); only write `NULL` when Scryfall explicitly returned `prices.usd === null`. Audit metadata distinguishes `updated / unchanged / failed (not_found) / skipped (no scryfallId)`.
- **Cents, not dollars.** `cards.price` is `integer` storing cents. `Math.round(parseFloat(usd) * 100)` matches the existing convention.
- **Postgres advisory lock single-flight.** `pg_try_advisory_lock(hashtext('cron.refresh_prices'))` is non-blocking and auto-releases on connection close. Second caller (cron-vs-manual or double-delivery) returns HTTP 409.
- **`cronSecret` literal-only in `/admin/health`.** Extend `envChecks()` with `cronSecret: isPresent(CRON_SECRET) ? "configured" : "missing"`. Flip top-level `ok=false` when missing. NEVER log the secret value.
- **Replace dead `notificationFailuresLast24h` tile, not add a 5th.** Grid stays `lg:grid-cols-4`. PROJECT.md decision row "⚠️ Revisit when log drain lands" is obsoleted.
- **Drop `defaultCheckedFor` memory entirely (Option A).** Picker opens all-unchecked on every session; Select All is the recovery affordance. Will-delete amber panel default-checked behavior is unaffected (lives in `import-client.tsx` separately).
- **Pure UI picker contract preserved.** Picker remains a controlled component; Select All / Deselect All call `onToggle` per binder OR a new `onBulkSet(names[], checked)` callback to avoid N renders.
- **No schema change, no migration.** `cards.price` already exists; `admin_audit_log.action` is `text` so `'price_refresh'` literal works as-is.
- **Vercel Hobby = 300s `maxDuration` with fluid compute (2026 default).** Operator's earlier "10s/60s" mental model is outdated. The ~26s cold-cache refresh has 11× headroom.

## Open Decisions Carried to Planning

- **Tier 2 live-DB integration test** for cron + advisory lock: opt-in (`TEST_DATABASE_URL`-gated, mirrors Phase 18 pattern) or skip and rely on Tier 1 unit test only. Resolve in Plan 23-01 PLAN.md.
- **`CRON_SECRET` rotation policy** documentation in operator runbook (no code impact). Resolve in Plan 23-01 SUMMARY.md.

## Deferred Items

Items acknowledged and deferred at v1.3 milestone close on 2026-05-11 (carried forward into v1.4 context):

| Category | Item | Status |
|----------|------|--------|
| operator_handoff | Phase 16 production migration cutover | `npm run migrate:v1.3:dry-run` then `npm run migrate:v1.3` against prod DATABASE_URL; runbook in 16-01-SUMMARY.md |
| operator_handoff | Phase 22 5-scenario live-deployment UAT | Operator-on-autopilot picker, v1.2→v1.3 cart hydration, CHECK trip detection, public-page binder leak grep, multi-binder concurrent checkout — runbook in 22-HUMAN-UAT.md |
| operator_next_step | Phase 18 concurrent-proof (TEST_DATABASE_URL provisioning) | PROMOTED 2026-05-13 to Operator Next Steps — see `.planning/todos/pending/01-phase-18-concurrent-proof.md`. v1.3.5 hotfix exposed env-gated test gap. |
| process_artifact | Phase 22 missing canonical VERIFICATION.md aggregator | Work captured in 22-SECURITY-REVIEW.md + 22-HUMAN-UAT.md + per-plan SUMMARYs; aggregator file absent |
| verification_gap | 02-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 04-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 05-VERIFICATION.md | human_needed (v1.0 historical) |
| verification_gap | 08-VERIFICATION.md | human_needed (v1.1 historical) |
| process_artifact | VALIDATION.md missing across all v1.3 phases (16-22) | Nyquist coverage absent project-wide; matches v1.0/v1.1/v1.2 baseline |
| security_followup | S-01 (case-sensitive admin email) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-02 (rate-limit table maintenance) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | D-DOS-03 (header-trust IP source) | acknowledged in 15-SECURITY-REVIEW.md |
| security_followup | I-DISC-03 (notification-failure queryability) | acknowledged in 15-SECURITY-REVIEW.md — **OBSOLETED by v1.4**: tile being replaced by `lastPriceRefreshAt` |
| RESOLVED v1.3 | D-DOS-01 (import preview rate-limit) | RESOLVED in Phase 22 — ADMIN_BULK rate-limit applied AFTER requireAdmin() |

## Recently Completed

- 2026-05-20 — **v1.4 shipped to prod**: pushed all 28 backlog commits (`aa72121..5521bda`) to origin, Vercel auto-deployed `mtg-bulk-sale-page-o6mn3t1hs` (27s build), then redeployed `p1391v06s` after `CRON_SECRET` was added to Vercel env. Both `/api/admin/health` and the new `/api/cron/refresh-prices` route confirmed live (401 fail-closed on missing/wrong Bearer; route exists per HTTP code, not 404).
- 2026-05-20 — **`cardToRow` bug discovery + fix + backfill chain** (post-deploy verification turned up a real defect that made v1.4 dead-on-arrival on existing data):
  - **Root cause**: `src/db/seed.ts:cardToRow` hardcoded `scryfallId: null` from the legacy `cards.json` seed path. When `src/db/queries.ts:6` later imported the same function for `replaceCardsForBinders` (the Manabox CSV commit path), every import since v1.0 silently dropped the Scryfall UUID extracted by `csv-parser.ts:181`. All 2353 prod rows had `scryfall_id IS NULL` — making `runPriceRefresh` skip every row per D-10.
  - **Fix `f1312ad`**: 1-line change to forward `card.scryfallId ?? null` through `cardToRow`. 2 new tests (positive forwarding + undefined fallback). `545/2/0` test suite (was 543/2). TypeScript clean.
  - **Backfill `c78893a`**: one-shot `scripts/backfill-scryfall-ids.ts` using Scryfall `/cards/collection` batch endpoint with `(set, collector_number)` identifiers. 1861 unique printings → 100% match → 2353 prod rows populated in 160.6s. Idempotent (`WHERE scryfall_id IS NULL`).
  - **End-to-end validation**: clicked "Refresh now" on prod `/admin/health`. Audit row: `trigger='manual' updated:1102 unchanged:1251 failed:0 skipped:0 durationMs:9690 actor=wico216@gmail.com`. 1102 prices actually changed (top mover: Shadow Rift +$3.01; biggest drop: Stolen by the Fae -$2.73). Foil rows correctly received different prices than normal rows of the same printing (e.g. Reya Dawnbringer foil +$1.28) — `getPrice(prices, finish)` ladder per row working as designed. Vercel `mtg-bulk-sale-page-9zwph54xs` (Ready) carries the fix; later script-only redeploy `77jk94cka` followed.
- 2026-05-20 — Phase 23 human UAT complete (4/4 pass on local dev server pointed at live Neon DB). 23-HUMAN-UAT.md status=passed, 23-VERIFICATION.md status human_needed→verified. Commit `5521bda`.
- 2026-05-20 — Plan 23-02 Import Picker UX shipped (`refactor(23-02)` `6e9ce34`, `feat(23-02)` `2e45ab2`, `test(23-02)` `4c156c7` + docs SUMMARY commit). `defaultCheckedFor` removed from zustand store (Shape B per PATTERNS.md); BinderPicker gains Select all + Deselect all native buttons with `onBulkSet(names, checked)` callback (D-15 single render); picker opens UNCHECKED every session (D-05 / IMPORT-UX-03); Continue button surfaces helper text via `aria-describedby` when disabled (IMPORT-UX-04 + PITFALLS Pitfall 8). 540/2 skipped tests (net +10 over Plan 23-01 baseline); IMPORT-UX-01..05 complete. Will-delete amber panel default-CHECKED behavior UNCHANGED per D-05 explicit clause.
- 2026-05-20 — Plan 23-01 Daily Price Refresh shipped (`feat(23-01)` x4: `f4835d2`, `27ef9a9`, `4a4f030`, `bdf8cbe`). Vercel cron + admin manual button + Postgres advisory-lock single-flight + lastPriceRefreshAt + cronSecret env check on `/admin/health`. 530/2 skipped tests; PRICE-REFRESH-01..11 complete. Operator setup: provision `CRON_SECRET` in Vercel env before first deploy (runbook inline in 23-01-SUMMARY.md).
- 2026-05-20 — v1.4 ROADMAP.md appended with Phase 23 (Import UX & Price Refresh); 2 plans, 16 requirements, 100% coverage
- 2026-05-20 — v1.4 milestone bootstrap: PROJECT.md updated, REQUIREMENTS.md authored (16 requirements), research synthesis complete (STACK/FEATURES/ARCHITECTURE/PITFALLS + SUMMARY)
- 2026-05-14 — Quick task wave (260514-7z2..gxr): buyer_phone end-to-end, storefront set-filter search, GitHub issues #8-#16 (search/modal/finish-text/double-faced flip/Type+Set filter defaults/Price filter reorder/sold-out hide/verified sender)
- 2026-05-11 — v1.3 Binder-Aware Inventory & Pick Workflow shipped (Phases 16-22; 464/2 skipped tests; live at `wikos-spellbinder.vercel.app`)
- 2026-05-11 — v1.2 Store Operations & Hardening shipped (Phases 13-15; live UAT 3/3 against `wikos-spellbinder.vercel.app`)

## Blockers/Concerns

- No active blocker.
- ~~Operator action required for Plan 23-01 to ship: provision `CRON_SECRET` in Vercel env~~ **DONE 2026-05-20**: secret added and a redeploy (`p1391v06s`) baked it into the running prod deployment.
- Plan 23-01 tests are default-run (NOT env-gated) per D-01 / D-11 — the v1.3.5 hotfix lesson is now encoded in the test files' literal `"NOT env-gated"` headers and a phase-level grep gate.
- **`cardToRow` bug class to watch for in future cross-format mappers**: the function was originally written for one input shape (cards.json seed, no scryfallId) and silently misfit when reused for another (Manabox CSV, has scryfallId). Hardcoded `null`/default values in shared mappers are a smell — prefer `?? null` over literal `null` so the field is transparent. Worth a pattern note in a future learnings extract; no immediate code action.

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone

## Session Continuity

Last session: 2026-05-20T23:00:00.000Z

Next action: Wait for the first prod cron firing window (~next 09:00–09:59 UTC) to record one `trigger='cron'` row in `admin_audit_log`, then `/gsd:complete-milestone` to archive v1.4. The cron observation is non-blocking — milestone can be closed now if you don't want to wait. v1.5 / next-milestone planning is the natural continuation.

Resume hint: v1.4 is fully shipped and live on `wikos-spellbinder.vercel.app`. Latest prod deploy `77jk94cka` (post-backfill-script commit). Prod `cards.scryfall_id` is 2353/2353 populated. First real price refresh succeeded (audit row 2026-05-20T22:58Z, `updated:1102`). Before/after snapshots at `/tmp/prices-before-1779316713.tsv` and `/tmp/prices-after-1779317933.tsv` (will disappear on reboot — not persisted to repo).

Local-env state on this workstation:

- `.env.local` has `ADMIN_USERNAME=admin` + a generated `ADMIN_PASSWORD` from the UAT session — safe to delete if you don't need local password login. `CRON_SECRET` is NOT set locally (still intentionally absent — was used to validate the missing-state surfaces correctly on `/admin/health`).
- No local processes running. Dev server stopped earlier (task `brlnx22dg`).

Pattern to remember for future cross-format mappers: hardcoded `null`/default values in shared mappers (like the original `cardToRow: scryfallId: null`) silently misbehave when the function gets reused for a richer input. Prefer `card.field ?? null` over literal `null` so the field is transparent through the mapper. See 2026-05-20 Blockers note.

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260514-95g | Add a searchable first row to the storefront set filter and clear the set search after selecting a set | 2026-05-14 | 8038d84 | [260514-95g-add-a-searchable-first-row-to-the-storef](./quick/260514-95g-add-a-searchable-first-row-to-the-storef/) |
| 260514-afo | GitHub issues #8-#12 storefront search and card modal improvements | 2026-05-14 | 1288b58 | [260514-afo-github-issues-8-12-storefront-search-and](./quick/260514-afo-github-issues-8-12-storefront-search-and/) |
| 260514-bjt | Show foil finish in storefront card names | 2026-05-14 | 1f7f711 | [260514-bjt-show-foil-finish-in-storefront-card-name](./quick/260514-bjt-show-foil-finish-in-storefront-card-name/) |
| 260514-ewz | Add storefront card flip button for double-faced cards | 2026-05-14 | a207739 | [260514-ewz-add-storefront-card-flip-button-for-doub](./quick/260514-ewz-add-storefront-card-flip-button-for-doub/) |
| 260514-fb1 | Refine double-faced card flip controls on storefront tiles and modal | 2026-05-14 | dfddefe | [260514-fb1-refine-double-faced-card-flip-controls-o](./quick/260514-fb1-refine-double-faced-card-flip-controls-o/) |
| 260514-fib | Refresh storefront when clicking the header logo on the home page | 2026-05-14 | 25f63a2 | [260514-fib-github-issue-13-page-refresh-behavior](./quick/260514-fib-github-issue-13-page-refresh-behavior/) |
| 260514-fvh | Open Card Type and Set storefront filter sections by default | 2026-05-14 | c771512 | [260514-fvh-github-issue-14-open-card-type-and-set-f](./quick/260514-fvh-github-issue-14-open-card-type-and-set-f/) |
| 260514-fz0 | Move storefront Price filter section to the bottom | 2026-05-14 | e4e75f6 | [260514-fz0-move-storefront-price-filter-to-the-bott](./quick/260514-fz0-move-storefront-price-filter-to-the-bott/) |
| 260514-g5e | Hide sold-out purchased cards from the storefront | 2026-05-14 | d41bc6f | [260514-g5e-github-issue-15-hide-purchased-sold-out-](./quick/260514-g5e-github-issue-15-hide-purchased-sold-out-/) |
| 260514-gxr | Use verified order email sender and accurate confirmation copy | 2026-05-14 | dc3d624 | [260514-gxr-github-issue-16-verified-domain-email-co](./quick/260514-gxr-github-issue-16-verified-domain-email-co/) |
