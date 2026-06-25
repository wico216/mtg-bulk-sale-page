# Viki — MTG Bulk Store

## What This Is

A simple online store for selling Magic: The Gathering bulk cards to friends. Friends browse the inventory, search/filter cards, add them to a cart, and submit an order — no online payment needed. Orders are emailed to both the seller and buyer, and payment happens in person. The seller manages inventory through an admin panel with live editing, CSV import/export, and order tracking.

## Core Value

Friends can easily find and order cards from your bulk collection without friction — browse, pick, checkout, done.

## Current State

**Last shipped:** v1.4 Import UX & Price Refresh (2026-05-20). Live at `wikos-spellbinder.vercel.app`. Daily Vercel cron at `0 9 * * *` UTC refreshes Scryfall prices via the shared `runPriceRefresh` service; admin can trigger manual refresh on `/admin/health`; binder import picker opens with explicit opt-in (no remembered selection); `lastPriceRefreshAt` and `cronSecret` env presence on the health surface. Post-deploy `cardToRow` bug discovered + fixed + 2353 prod rows backfilled with `scryfall_id` in the same session.

**Current milestone:** v1.5 Visual QA Release Loop — planned 2026-06-25. Goal: turn Spellbook's existing `/qa/gates` approval surface into a repeatable AI release-quality loop with generated proof packets, a mobile UI review exemplar, release-status guardrails, and reusable work/UAT documentation.

## Requirements

### Validated

- [x] CSV import from Manabox app to populate inventory — Validated in Phase 1: Data Pipeline
- [x] Card display with auto-fetched images (Scryfall), price, condition, quantity — Validated in Phase 2: Card Catalog
- [x] Search cards by name — Validated in Phase 3: Search and Filters
- [x] Filter cards by mana color — Validated in Phase 3: Search and Filters
- [x] Shopping cart to collect desired cards — Validated in Phase 4: Shopping Cart
- [x] Checkout sends order email to seller — Validated in Phase 5: Checkout and Deploy
- [x] Checkout sends confirmation email to buyer — Validated in Phase 5: Checkout and Deploy
- [x] Confirmation page shown after checkout — Validated in Phase 5: Checkout and Deploy
- [x] Friend provides name/email at checkout (no account needed) — Validated in Phase 5: Checkout and Deploy
- [x] Auto-decrement stock on checkout — Validated in Phase 11 Plan 01 with concurrent checkout proof
- [x] Checkout stores order records in the database — Validated in Phase 11 Plan 01
- [x] Admin can view order history and order details — Validated in Phase 11 Plan 02 browser proof
- [x] Admin can import one or more Manabox CSV files as a full inventory replacement — Validated locally in Phase 10/10.1
- [x] Admin can delete the full inventory with explicit confirmation — Validated locally in Phase 10.1
- [x] Admin can update order status, private notes, and cancellation state — Validated in Phase 13
- [x] High-impact admin mutations create durable audit log entries — Validated locally in Phase 14
- [x] Import commits create durable import history — Validated locally in Phase 14
- [x] Admin can view audit and import history from `/admin/audit` — Validated locally in Phase 14
- [x] Production hardening: rate limits, structured logs, health checks, repeatable smoke, runbook, and security review — Validated in Phase 15 + 15-HUMAN-UAT.md (3/3 passed against `wikos-spellbinder.vercel.app`)
- [x] Admin panel with Google OAuth authentication — Validated in Phase 8: Authentication
- [x] Cards composite ID includes binder dimension; same card can live in multiple binders — Validated in Phase 16 (BIND-01..04, FIN-01)
- [x] Manabox CSV parser ingests Binder Name + Binder Type; skips non-binder rows; etched finish recognized — Validated in Phase 17 (CSV-05..08); fixes latent v1.2 etched bug for 11 known cards
- [x] Server-side multi-binder allocator at checkout (one SQL CTE chain; smallest-first + lex tiebreaker; one order_items per binder source) — Validated in Phase 18 (ALLOC-01..04); structurally enforced (TEST_DATABASE_URL 5x flake check pending operator)
- [x] Import preview binder picker with NEW/Will-delete annotations + remembered selection + scoped replace — Validated in Phase 19 (IMP-01..06)
- [x] Storefront aggregates SUM across binders; PublicCard/AdminCard type split prevents binder leak at compile time; cart reconciliation transitions v1.2 carts forward — Validated in Phase 20 (AGG-01..03)
- [x] Admin inventory binder column + filter; admin order detail [binder] pill from snapshot; admin audit page renders ScopedImportAuditMetadata — Validated in Phase 21 (ADM-01..03)
- [x] Hardening: import preview rate-limit (resolves v1.2 D-DOS-01); STRIDE delta with I-DISC-05; perf pin (12,749 rows in 38ms); 5-scenario UAT runbook — Validated in Phase 22 (HARD-01..04); live UAT pending operator execution
- [x] Operator can Select All / Deselect All binders in the import binder picker — Validated in Phase 23 Plan 02 (IMPORT-UX-01..02); native buttons with `onBulkSet(names, checked)` single-render callback
- [x] Import binder picker opens with all binders deselected by default — Validated in Phase 23 Plan 02 (IMPORT-UX-03); `defaultCheckedFor` memory dropped (Option A per D-05); UAT 3 confirmed live
- [x] Card prices refresh automatically once per day via Vercel Cron — Validated in Phase 23 Plan 01 (PRICE-REFRESH-01..03); `vercel.json` declares `0 9 * * *` UTC; Bearer-token auth via `CRON_SECRET`; first live cron firing confirmation pending next 09:00 UTC window
- [x] Each price refresh records an audit log entry with updated/unchanged/failed counts — Validated in Phase 23 Plan 01 (PRICE-REFRESH-05..07); proven live on prod with `updated:1102 unchanged:1251 skipped:0 durationMs:9690` audit row
- [x] Admin can see `lastPriceRefreshAt` on `/admin/health` — Validated in Phase 23 Plan 01 (PRICE-REFRESH-08..09); UAT 1 confirmed `router.refresh()` re-renders the tile after click without full page reload
- [x] Admin can trigger a manual price refresh from the admin UI — Validated in Phase 23 Plan 01 (PRICE-REFRESH-10..11); admin route uses `requireAdmin()` + `ADMIN_BULK` rate-limit; calls same `runPriceRefresh` service as cron (D-12 auth-agnostic service)

### Active

- [ ] Visual QA gate packet generation is standardized from structured metadata rather than hand-authored large source blocks — Planned in Phase 24 (VQA-01..02)
- [ ] A mobile storefront Visual QA / UI Review gate is available as the canonical Spellbook loop exemplar — Planned in Phase 24 (VQA-03..05)
- [ ] Atlas/release tooling can query QA gate status and fail closed when not approved — Planned in Phase 24 (VQA-06)
- [ ] The Spellbook release-quality loop is documented so it can later transfer to work/Nova-style UAT — Planned in Phase 24 (VQA-07..08)

### Out of Scope

- Payment processing — friends pay in person
- Multiple admin accounts — single admin (seller), public storefront. Google OAuth chosen for future buyer order tracking.
- Real-time collaborative editing — single admin user
- Card grading beyond standard conditions (NM/LP/MP/HP/DMG)
- Mobile app — web-only

## Context

- Inventory sourced from Manabox app CSV exports
- Card images and metadata available via Scryfall API (free, no auth required)
- Target audience is a small friend group, so scale is not a concern
- No payment gateway needed — all transactions settled in person
- Public storefront (no password) — admin panel is Google OAuth protected
- v1.0 shipped 2026-04-11: browse, search, filter, cart, email checkout — all static/build-time
- v1.1 shipped 2026-04-27: live database-backed storefront/admin inventory, multi-CSV import, bulk operations, dashboard, transactional checkout, and admin order history
- v1.2 shipped 2026-05-11: admin order workflow, inventory audit trail, production hardening (rate limits + structured logs + `/admin/health` + smoke script + STRIDE review)
- v1.3 shipped 2026-05-11: binder-aware inventory + multi-binder allocator + binder picker + storefront aggregation with PublicCard/AdminCard type-split privacy + admin binder visibility + hardening delta. Etched-foil bug fix for 11 known cards in operator's collection.
- v1.4 shipped 2026-05-20: daily Scryfall price refresh (Vercel cron + admin manual) + explicit-opt-in binder picker. Discovered + fixed post-deploy that `cardToRow` had silently dropped `scryfall_id` on every Manabox import since v1.0; backfilled all 2353 prod rows. First real refresh: `updated:1102 unchanged:1251 skipped:0`.
- v1.5 planned 2026-06-25: Visual QA Release Loop. Converts `/qa/gates` from a useful one-off approval surface into a repeatable AI release-quality loop: generated/validated gate packets, mobile storefront exemplar, approval-status guard, and reusable work/UAT playbook.
- Codebase: ~26,292 LOC TypeScript (+6,631 from v1.2; +~5,929 net from v1.4 work). 545 tests passing + 2 skipped.

## Constraints

- **Budget**: Free or minimal hosting costs preferred (Vercel free tier for Postgres + hosting)
- **Complexity**: Keep it simple — this is a personal tool, not a business platform
- **Data source**: Must work with Manabox CSV export format
- **Auth**: Google OAuth for admin only — storefront stays public (Google chosen so friends can reuse accounts for future order tracking)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| No payment processing | Friends pay in person, avoids payment gateway complexity | ✓ Good |
| No user accounts for buyers | Small friend circle, unnecessary friction | ✓ Good |
| Manabox CSV as data source | Already using Manabox to catalog collection | ✓ Good |
| Scryfall API for card images | Free, comprehensive, no auth required | ✓ Good |
| Public storefront access | No need to gate access for a friend store | ✓ Good |
| Vercel Postgres | Free tier, same platform as hosting, managed | — Pending |
| Google OAuth for admin | Friends already have Google accounts — enables future buyer order tracking | ✓ Good |
| Username/password admin fallback | Google OAuth can reject local automation/browser contexts; credentials provider is enabled only outside production while ADMIN_EMAIL remains the authorization gate | ✓ Good |
| Auto-decrement on checkout | Keeps inventory accurate without manual work | — Pending |
| CSV import replaces inventory | Simple mental model — Manabox export is source of truth | ✓ Good |
| Multi-CSV import still full-replaces inventory | Multiple Manabox exports are merged into one preview batch before replacing DB rows; no incremental merge semantics | ✓ Good |
| Checkout database commit is source of truth | Phase 11 treats the atomic stock decrement + order insert as the placed order; notification emails are post-commit side effects so email failure does not erase persisted inventory/order state | ✓ Good |
| Audit metadata is safe and bounded | Phase 14 records operational context without secrets, raw CSV bodies, or unbounded payloads | ✓ Good |
| Import history is first-class | Full-replace CSV commits create dedicated import-history rows in addition to audit entries | ✓ Good |
| Sliding-window rate limit, not token bucket | Phase 15 — correct on serverless without distributed clock sync; "blocked attempts don't extend the window" is trivial to enforce | ✓ Good |
| Postgres-backed rate-limit store, no new vendor | Phase 15 — reuses existing Neon connection; satisfies budget constraint; verified shared cross-instance via UAT #3 | ✓ Good |
| Rate-limit BEFORE body parse on /api/checkout | Phase 15 — abuse cannot starve real users via JSON-parse cost | ✓ Good |
| Rate-limit AFTER requireAdmin() on admin routes | Phase 15 — auth bugs are not hidden behind 429; unauth always sees 401 | ✓ Good |
| Health endpoint exposes literals only ("configured"/"missing"), never env values | Phase 15 — STATUS_LABELS lookup is the only path from env-state to UI text; pinning test enforces this | ✓ Good |
| `notificationFailuresLast24h` reserved as `null` | Phase 15 — keeps API contract stable so a future log-drain phase can flip null → number without breaking consumers | ⚠️ Revisit when log drain lands |
| STRIDE security review documented in-repo with named follow-up owners | Phase 15 — 0 High-severity; 4 deferred Medium with remediation steps | ✓ Good |
| 5-segment composite id `{setCode}-{collectorNumber}-{finish}-{condition}-{binder}` | Phase 16 — same card can live in multiple binders as separate rows; binder is a first-class dimension | ✓ Good |
| `pgEnum('finish', ['normal','foil','etched'])` replaces `foil: boolean` | Phase 16 + 17 — fixes latent v1.2 bug where etched cards were silently mispriced as `normal` | ✓ Good |
| `CHECK (quantity >= 0)` schema constraint | Phase 16 — schema-level safety net; over-decrement returns 503, never silent oversell | ✓ Good |
| Custom Drizzle migration via `--custom`, applied via `db.batch` atomic | Phase 16 — auto-gen broken for PK changes; atomic apply via existing pattern | ✓ Good |
| Manual `npm run migrate:v1.3` from operator's local before Vercel deploy | Phase 16 — matches Phase 13/14 manual schema-update pattern | ✓ Good |
| Binder name normalization: `trim().toLowerCase().replace(/\s+/g, ' ').replace(/-/g, '_')` | Phase 17 — collapses typos; hyphen→underscore preserves cart-key segment-strip safety | ✓ Good |
| Allocator MUST be one SQL CTE chain (NO JS pre-allocation) | Phase 18 — neon-http has no interactive transactions; load-bearing PITFALLS Pitfall 1 prevention | ✓ Good |
| Allocator pick order: smallest-quantity-first + lexicographic binder tiebreaker | Phase 18 — passively consolidates small binders over time; matches operator's mental model | ✓ Good |
| FOR UPDATE OF cards on aggregated key (NOT chosen rows) | Phase 18 — prevents double-decrement under concurrent checkout | ✓ Good |
| StockConflict.available is SUM across binders; never per-binder breakdown | Phase 18 + 20 — preserves Phase 11 invariant; binder is admin-only | ✓ Good |
| Two-stage NDJSON contract for import preview (binders message → enrichment) | Phase 19 — parser runs first; enrichment runs only on selected subset; saves Scryfall budget on partial imports | ✓ Good |
| Per-binder selective replace (`DELETE WHERE binder IN selected`) | Phase 19 — operator picks which binders to replace; unselected untouched | ✓ Good |
| `unsorted` binder shows in picker, default-UNCHECKED on every import | Phase 16 D-10 / Phase 19 — legacy backfill data persists until operator explicitly opts in | ✓ Good |
| Inline destructive confirmation with typed REPLACE phrase | Phase 19 — mirrors Phase 10 D-13 pattern; prevents operator-on-autopilot | ✓ Good |
| `PublicCard`/`AdminCard`/`PublicOrderItem` type split | Phase 20 — TypeScript catches binder leak at compile time; load-bearing privacy guarantee for v1.3 | ✓ Good |
| Storefront aggregation via plain SQL GROUP BY (no materialized view) | Phase 20 — Postgres hash-aggregate handles ~382k rows in single-digit ms; revisit at 100k+ logical cards | ✓ Good |
| Cart reconciliation extends Phase 10-03 useEffect (NOT Zustand migrate hook) | Phase 20 — migrate runs at hydration without `cardMap`; useEffect sees both persisted state and live cards | ✓ Good |
| `[binder]` order detail pill reads from `order_items.binder` snapshot | Phase 21 — survives subsequent re-imports that delete the source card row | ✓ Good |
| ADM-FUT-01..04 + ALLOC-FUT-01 deferred to v1.3.x | Phase 21 — allocator passively consolidates; bulk-edit and config-strategy nice-to-have, not v1.3-critical | ✓ Good |
| Phase 22 D-DOS-01 resolution: ADMIN_BULK rate-limit on `/api/admin/import/preview` | Phase 22 — v1.3's two-stage NDJSON amplifies per-call cost; resolves Phase 15 deferred Medium | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-20 — after v1.4 milestone bootstrap*
