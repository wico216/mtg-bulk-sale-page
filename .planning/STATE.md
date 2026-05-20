---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Import UX & Price Refresh
status: planning
last_updated: "2026-05-20T18:00:00.000Z"
last_activity: 2026-05-20
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 2
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Friends can easily find and order cards from the bulk collection without friction.
**Current focus:** v1.4 Import UX & Price Refresh — Phase 23 (Plan 23-01 Daily Price Refresh → Plan 23-02 Import Picker UX)

## Current Position

Phase: **23 — Import UX & Price Refresh** (not started)
Plan: **23-01 Daily Price Refresh** (next — write-side; ships first because operator UAT happens against the deployed cron)
Status: Roadmap defined, plan TBD (next: `/gsd:plan-phase 23`)
Last activity: 2026-05-20 — v1.4 ROADMAP.md appended with Phase 23 (2 plans, 16 requirements, 100% coverage)

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

- 2026-05-20 — v1.4 ROADMAP.md appended with Phase 23 (Import UX & Price Refresh); 2 plans, 16 requirements, 100% coverage
- 2026-05-20 — v1.4 milestone bootstrap: PROJECT.md updated, REQUIREMENTS.md authored (16 requirements), research synthesis complete (STACK/FEATURES/ARCHITECTURE/PITFALLS + SUMMARY)
- 2026-05-14 — Quick task wave (260514-7z2..gxr): buyer_phone end-to-end, storefront set-filter search, GitHub issues #8-#16 (search/modal/finish-text/double-faced flip/Type+Set filter defaults/Price filter reorder/sold-out hide/verified sender)
- 2026-05-11 — v1.3 Binder-Aware Inventory & Pick Workflow shipped (Phases 16-22; 464/2 skipped tests; live at `wikos-spellbinder.vercel.app`)
- 2026-05-11 — v1.2 Store Operations & Hardening shipped (Phases 13-15; live UAT 3/3 against `wikos-spellbinder.vercel.app`)

## Blockers/Concerns

- No active blocker.
- **CRITICAL pre-Plan-23-01 check:** `vercel.json` does NOT currently exist at repo root (verified during research). Plan 23-01 introduces it; operator must provision `CRON_SECRET` in Vercel env BEFORE first deploy (else cron fires and 401s silently — see Pitfall 6).
- The Plan 23-01 unit test MUST NOT gate on `TEST_DATABASE_URL` or `CRON_SECRET`. Use `vi.stubEnv` instead. This is the load-bearing lesson from the v1.3.5 hotfix.

## Operator Next Steps

1. **(NEXT) Plan Phase 23-01** with `/gsd:plan-phase 23` (or `/gsd:plan-phase 23 01` if multi-plan invocation is supported). Resolve open decisions: Tier 2 integration-test opt-in/skip, `CRON_SECRET` rotation runbook doc.
2. Provision `TEST_DATABASE_URL` and run the Phase 18 concurrent-proof harness (runbook: `.planning/todos/pending/01-phase-18-concurrent-proof.md`) — still pending from v1.3 close; same harness pattern Plan 23-01 will mirror IF Tier 2 is opted in.
3. Run the deferred Phase 22 5-scenario live-deployment UAT against `wikos-spellbinder.vercel.app` (runbook: `22-HUMAN-UAT.md`).

## Session Continuity

Last session: 2026-05-20 — v1.4 milestone bootstrap completed. PROJECT.md, REQUIREMENTS.md (16 requirements), research synthesis (STACK/FEATURES/ARCHITECTURE/PITFALLS/SUMMARY) authored. ROADMAP.md appended with Phase 23.

Next action: `/gsd:plan-phase 23` to decompose Plan 23-01 (Daily Price Refresh) and Plan 23-02 (Import Picker UX) into executable PLAN.md files.

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
