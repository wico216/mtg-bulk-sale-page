# Phase 10: CSV Import - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The seller uploads a Manabox CSV through the admin panel. The system parses it, enriches via Scryfall, shows a preview (counts, sample cards, skipped rows), and on confirm replaces the full inventory in a single atomic transaction. The storefront reflects the new inventory after import. Merge/incremental import is explicitly out of scope (REQUIREMENTS.md Out of Scope table). Bulk delete and dashboard belong to Phase 12; order tracking to Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Upload location & UX
- **D-01:** Import lives on a dedicated route `/admin/import` (not a modal or inline panel on `/admin`). Keeps preview and skip list from cramping the inventory table.
- **D-02:** Entry point is an "Import CSV" button in the admin inventory action bar, placed next to the existing "Export CSV" button. Symmetric paired operations.
- **D-03:** File input is a drag-drop zone that doubles as click-to-browse. Single area handles both interactions.
- **D-04:** Pre-upload validation is minimal: reject files that do not have the `.csv` extension. No size cap, no header-schema gate. (Single-admin store behind Google OAuth — header-schema mismatches surface as skipped rows during parse, which is acceptable.)

### Preview content & flow
- **D-05:** Preview screen contains three zones: (1) summary counts — "X cards will be imported, Y rows skipped, Z missing prices"; (2) sample of the first ~20 imported cards showing name, set, quantity, price, condition; (3) expandable "Skipped rows" section listing each skipped row with its row number and reason (e.g., "missing Set code", "not found on Scryfall").
- **D-06:** Scryfall enrichment happens DURING preview generation, not after confirm. The admin must see real prices and Scryfall misses before committing the destructive replace.
- **D-07:** Preview screen has two actions: "Confirm import" (commits the replace) and "Cancel" (discards the upload and returns to blank `/admin/import`). No auto-commit, no timed confirmation.

### Enrichment timing & progress UX
- **D-08:** Enrichment runs synchronously in the POST handler for the preview step. No background job queue — keeps the architecture simple for a friend store.
- **D-09:** Progress is reported as a live "X / Y cards enriched" counter in the UI. Implementation approach (Server-Sent Events, streamed response, or polling an in-memory progress map) is Claude's discretion — pick the simplest approach that reliably renders the counter.
- **D-10:** Route Handler uses Next.js `export const maxDuration = 300` (segment config) so fresh-cache imports of ~150 cards fit within the 300s Vercel Pro ceiling. Document this in the route file.
- **D-11:** Reuse the existing 24-hour Scryfall cache (`src/lib/cache.ts`). Re-imports of the same collection become nearly instant; first import of a new binder pays the 100ms/card rate limit.

### Destructive replace confirmation
- **D-12:** Final confirmation is a single "Confirm import" button whose label includes the explicit delta, e.g. "Confirm import — replace all 136 current cards with 143 new cards". The delta in the button IS the safeguard. No checkbox, no type-to-confirm. Matches Phase 9 D-14's inline-confirmation philosophy.
- **D-13:** Cart safety: buyers with stale localStorage cart items from the old inventory are handled on the storefront side, not by clearing carts (impossible without buyer accounts). The cart page reconciles cart IDs against current DB and silently drops any IDs no longer present. Implementation detail: verify the existing cart page's DB query in `src/app/cart/page.tsx` already filters unknown IDs; if not, patch it as part of this phase.

### Transaction & post-import
- **D-14:** DB replace is a single Drizzle `db.transaction()`: DELETE all rows from `cards`, then INSERT the enriched batch. All-or-nothing. On any error the transaction rolls back and the old inventory is preserved. Meets CSV-01 "single transaction" success criterion.
- **D-15:** After a successful commit, the admin is redirected to `/admin` (the inventory table) with a success toast: "Imported N cards (M skipped)". Matches Phase 9's toast pattern. No intermediate summary screen.
- **D-16:** After a successful commit, the storefront inventory reflects the new data. Since storefront pages render dynamic (`force-dynamic`) per Phase 7, no explicit `revalidatePath` is strictly required, but the planner may add one as a belt-and-suspenders measure.

### Claude's Discretion
- Exact mechanism for streaming live enrichment progress (SSE, chunked response, or polling endpoint) — pick the simplest that works in Next.js 16 Route Handlers.
- Visual styling of the drag-drop zone (dashed border, hover/active states).
- Toast message wording beyond the "Imported N cards (M skipped)" template.
- How to display a Scryfall 429 / transient failure mid-enrichment (retry-with-backoff or surface error and stop).
- Error UI when parse fails entirely (zero valid rows): stay on `/admin/import` with an inline error banner.
- Whether the "Import CSV" button is disabled when admin inventory is still loading.
- Schema of the in-flight progress payload.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — CSV-01 (Manabox CSV replaces full inventory), CSV-02 (preview with add/skip counts before commit)
- `.planning/REQUIREMENTS.md` Out of Scope table — "Incremental/merge CSV import" explicitly excluded

### Prior phase decisions
- `.planning/phases/01-data-pipeline/01-CONTEXT.md` — Manabox CSV field mapping, Scryfall setCode+collectorNumber matching, skip-unmatched rule, 24h cache, USD-only, composite ID pattern
- `.planning/phases/08-authentication/08-CONTEXT.md` — Admin auth (`requireAdmin()`, 401/403 JSON responses for `/api/admin/*`), admin shell layout
- `.planning/phases/09-admin-inventory-management/09-CONTEXT.md` — Inline confirmation pattern (D-14), action-bar button placement, toast feedback, admin layout conventions

### Reusable library code (must be read/reviewed by planner)
- `src/lib/csv-parser.ts` — Existing Manabox parser; currently reads from filesystem, needs refactor to accept uploaded file content (string or Buffer)
- `src/lib/enrichment.ts` — `enrichCards()` sequential Scryfall enrichment with per-card stats
- `src/lib/scryfall.ts` — `fetchCard()` with 100ms rate limit and cache integration
- `src/lib/cache.ts` — 24h-TTL cache to reuse
- `src/lib/condition-map.ts` — Condition normalization (NM/LP/MP/HP/DMG)
- `src/lib/types.ts` — `ManaboxRow` and `Card` interfaces

### Database layer
- `src/db/schema.ts` — `cards` table with composite string `id` and `scryfallId` column expected to be populated by this phase's import
- `src/db/queries.ts` — Existing Drizzle query helpers; planner adds a bulk-replace transaction helper here
- `src/db/seed.ts` — Prior note: "Future inventory updates will be done via Phase 10 (CSV Import in admin panel)" — this phase fulfills that note

### Admin UI patterns
- `src/app/admin/layout.tsx` — Header + max-w-7xl content area
- `src/app/admin/page.tsx` — Inventory table; needs "Import CSV" button added to action bar
- `src/app/admin/_components/action-bar.tsx` — Place to add the Import button
- `src/app/admin/_components/toast.tsx` — Toast used for post-import success feedback
- `src/app/admin/_components/delete-confirmation.tsx` — Reference pattern for Phase 9's inline-confirm style
- `src/app/api/admin/cards/route.ts` — `requireAdmin()` usage template for the new import endpoint
- `src/app/api/admin/export/route.ts` — Admin Route Handler model

### Storefront cart safety
- `src/app/cart/page.tsx` — Verify/patch so unknown card IDs (from pre-import carts) are filtered silently after an import (D-13)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/csv-parser.ts`: Manabox field mapping, composite ID generation, duplicate-merging logic — all reusable, just needs a new entry point that accepts in-memory CSV content instead of reading from a directory
- `src/lib/enrichment.ts` + `src/lib/scryfall.ts` + `src/lib/cache.ts`: Full Scryfall pipeline already battle-tested from Phase 1 — reuse unchanged; the 100ms rate limit and 24h cache both remain appropriate here
- `src/lib/condition-map.ts`: Handles Manabox → DB condition normalization
- `src/app/admin/_components/toast.tsx`: Toast for post-import success signal
- `src/app/admin/_components/action-bar.tsx`: Host for the new "Import CSV" entry button
- `src/lib/auth/admin-check.ts` → `requireAdmin()`: Guard for the new `/api/admin/import/*` Route Handler(s)

### Established Patterns
- React Server Components for pages; Route Handlers in `src/app/api/admin/*` return JSON with `requireAdmin()` auth gate (Phase 8 convention)
- Admin mutations use Route Handlers, not server actions (Phase 9 pattern — consistent with existing CRUD in `api/admin/cards`)
- Inline confirmations, not modals; toast for success (Phase 9 D-14)
- Drizzle + Neon HTTP client for DB; prices stored as integer cents, returned as dollars
- `force-dynamic` storefront rendering (Phase 7) — no explicit revalidation needed after import

### Integration Points
- New route: `/admin/import` (page) with drag-drop + preview + confirm UI
- New API: `/api/admin/import/preview` (POST multipart) — parse + enrich + return preview payload with live progress stream
- New API: `/api/admin/import/commit` (POST JSON of enriched cards or a server-held preview token) — runs the transactional replace
- Modify `src/app/admin/_components/action-bar.tsx` to add the "Import CSV" link button next to Export CSV
- Modify `src/lib/csv-parser.ts` to export a function that accepts CSV content (string) in addition to the existing directory-based entry point
- Add bulk-replace transaction helper in `src/db/queries.ts` (e.g., `replaceAllCards(cards: Card[])`)
- Add `export const maxDuration = 300` to the preview Route Handler

</code_context>

<specifics>
## Specific Ideas

- The friend store currently has ~136 cards; typical Manabox re-exports will land in that ballpark. Most imports after the first will be cache-hot and fast.
- The delta in the final "Confirm import" button label ("replace 136 cards with 143 new cards") is the safeguard — no heavier gate needed for a single-admin Google-OAuth-protected panel.
- Preserve Phase 1's tolerant stance: rows missing required fields are skipped and reported, not fatal.

</specifics>

<deferred>
## Deferred Ideas

- Differential/merge import (show what would change vs wipe-and-replace) — explicitly out of scope per REQUIREMENTS.md; belongs in a future milestone if ever
- Scheduled/automated imports — out of scope per REQUIREMENTS.md Out of Scope table
- Admin undo / CSV snapshot before destructive replace — the existing Export CSV (Phase 9) already covers "export before import" as a manual pre-flight step
- Real-time Scryfall price refresh (not tied to import) — out of scope per PROJECT.md decisions

</deferred>

---

*Phase: 10-csv-import*
*Context gathered: 2026-04-19*
