# Requirements: Viki — MTG Bulk Store

**Milestone:** v1.4 Import UX & Price Refresh
**Defined:** 2026-05-20
**Core Value:** Friends can easily find and order cards from the bulk collection without friction.

## v1.4 Requirements

Requirements for v1.4 Import UX & Price Refresh. Each maps to roadmap phases.

### Import Picker UX

- [ ] **IMPORT-UX-01**: Operator can click Select All to check every binder in the import binder picker
- [ ] **IMPORT-UX-02**: Operator can click Deselect All to uncheck every binder in the import binder picker
- [ ] **IMPORT-UX-03**: The import binder picker opens with every binder unchecked on every import session (prior-session `defaultCheckedFor` memory is dropped)
- [ ] **IMPORT-UX-04**: The Continue button is disabled and shows helper text when no binders are selected and no will-delete entries are checked
- [ ] **IMPORT-UX-05**: Picker shows a live "X of Y selected" count near the Select All / Deselect All buttons

### Price Refresh

- [ ] **PRICE-REFRESH-01**: A daily Vercel Cron at `0 9 * * *` UTC triggers a refresh of all card prices via the existing batched Scryfall `/cards/collection` fetcher
- [ ] **PRICE-REFRESH-02**: The cron route rejects requests without `Authorization: Bearer ${CRON_SECRET}` (returns 401) and fails closed when the env var is missing
- [ ] **PRICE-REFRESH-03**: Each refresh writes one `admin_audit_log` row with `action='price_refresh'` and metadata `{ trigger, updated, unchanged, failed, skipped, durationMs }`
- [ ] **PRICE-REFRESH-04**: A refresh NEVER overwrites an existing price with NULL when Scryfall returns `not_found`; only updates when Scryfall returns a numeric price; rows with no `scryfallId` are skipped entirely
- [ ] **PRICE-REFRESH-05**: A refresh updates each card row by its 5-segment composite `cards.id`, applying the per-finish `getPrice(prices, finish)` ladder per row (NEVER UPDATE-by-scryfall_id)
- [ ] **PRICE-REFRESH-06**: Concurrent cron+manual invocations are single-flighted via a Postgres advisory lock; the second caller returns 409
- [ ] **PRICE-REFRESH-07**: Admin can trigger a manual refresh via `POST /api/admin/prices/refresh`, protected by `requireAdmin()` + `ADMIN_BULK` rate-limit
- [ ] **PRICE-REFRESH-08**: `/admin/health` JSON response includes `lastPriceRefreshAt` (ISO string or null)
- [ ] **PRICE-REFRESH-09**: `/admin/health` page renders a "Last Price Refresh" tile (replacing the dead "Notification failures (24h)" tile) showing the most recent refresh timestamp
- [ ] **PRICE-REFRESH-10**: `/admin/health` page renders a "Refresh now" admin button next to the Last Price Refresh tile, calling `POST /api/admin/prices/refresh` and re-rendering the page on success
- [ ] **PRICE-REFRESH-11**: `envChecks()` reports `cronSecret` as `"configured"` or `"missing"` (literal only, never the actual value); `/admin/health` `ok` flips to `false` when missing

## v2 Requirements (Deferred)

### Import Picker UX — Future

- **IMPORT-UX-FUT-01**: "Smart Select: NEW binders only" third button (NEW binders already sort to top with green pill — defer until operator UAT shows the gap)
- **IMPORT-UX-FUT-02**: Saved selection presets (e.g. "weekly restock binders")
- **IMPORT-UX-FUT-03**: Keyboard shortcut for Select All (currently anti-feature — conflicts with browser native Cmd-A)

### Price Refresh — Future

- **PRICE-REFRESH-FUT-01**: Staleness badge on `/admin/health` (yellow when `lastPriceRefreshAt > 36h` ago)
- **PRICE-REFRESH-FUT-02**: 60s cooldown UI + "Refreshed Ns ago" text on the manual refresh button
- **PRICE-REFRESH-FUT-03**: Top-5 price movers surfaced in audit metadata (bounded to stay under 4KB cap)
- **PRICE-REFRESH-FUT-04**: NDJSON streaming progress during manual refresh
- **PRICE-REFRESH-FUT-05**: `card_price_history` table for per-card price trend tracking

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time price tickers on storefront | Scryfall itself refreshes once/24h; would be theater |
| Multi-source pricing fallback (TCGplayer/Cardmarket) | Scryfall is more reliable than the operator's own deploys; one source of truth |
| Automated repricing with margin rules | Operator runs pass-through pricing, not margin strategy |
| Cron failure → Discord/email alerts | `/admin/health` is the surface; adding a vendor for one daily job is overengineered |
| Per-card price-drop emails to buyers | No buyer accounts; out of scope for friend store |
| Price-history graphs / trend visualization | Defer to v2; no clear operator demand |
| Master checkbox with indeterminate state (instead of buttons) | Picker layout is not a table; explicit action buttons map better to "I am opting in" mental model |
| `next dev` cron firing | Vercel docs explicit: not supported; operator uses `curl` against deployed URL or local route handler |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| IMPORT-UX-01 | Phase 23 | 23-02 | Pending |
| IMPORT-UX-02 | Phase 23 | 23-02 | Pending |
| IMPORT-UX-03 | Phase 23 | 23-02 | Pending |
| IMPORT-UX-04 | Phase 23 | 23-02 | Pending |
| IMPORT-UX-05 | Phase 23 | 23-02 | Pending |
| PRICE-REFRESH-01 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-02 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-03 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-04 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-05 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-06 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-07 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-08 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-09 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-10 | Phase 23 | 23-01 | Pending |
| PRICE-REFRESH-11 | Phase 23 | 23-01 | Pending |

**Coverage:**
- v1.4 requirements: 16 total
- Mapped to phases: 16 (100%)
- Unmapped: 0

## Decisions Locked at Requirements Time

| Decision | Choice | Reason |
|----------|--------|--------|
| Picker memory contract | **Drop `defaultCheckedFor` entirely** (Option A from PITFALLS Pitfall 3) | Matches "only upload what I need" goal; cleanest mental model; Select All is the recovery affordance |
| Health tile placement | **Replace dead `notificationFailuresLast24h` tile** | Kills a known-dead placeholder; grid stays 4-col; PROJECT.md "⚠️ Revisit when log drain lands" decision row obsoleted |
| Cron schedule | **`0 9 * * *` UTC daily** | Off-peak globally; before operator's morning admin work |
| Idempotency mechanism | **Postgres advisory lock** (`pg_try_advisory_lock(hashtext('cron.refresh_prices'))`) | Vercel may double-deliver cron events; advisory lock is non-blocking + auto-releases on connection close |
| Bulk-update key | **`cards.id` (5-segment composite), NEVER `scryfall_id`** | Avoids re-introducing v1.2 etched-mispricing bug; one Scryfall card → N rows with different finishes |
| Test gating | **Default-run unit tests for cron handler, NO env gating** | v1.3.5 incident pattern: env-gated tests skip in CI silently |

## Open Implementation Decisions (resolve during planning)

- **Tier 2 live-DB integration test** for cron + advisory lock: opt-in (`TEST_DATABASE_URL`-gated, mirrors Phase 18 pattern) or skip and rely on Tier 1 unit test only.
- **`CRON_SECRET` rotation policy** documentation in operator runbook (no code impact).

---
*Requirements defined: 2026-05-20*
*Last updated: 2026-05-20 — roadmap creation mapped 16/16 requirements to Phase 23 (Plan 23-01 / Plan 23-02)*
