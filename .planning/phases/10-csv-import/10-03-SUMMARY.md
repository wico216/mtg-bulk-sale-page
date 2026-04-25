---
phase: 10-csv-import
plan: 03
subsystem: admin-ui
tags: [admin, react, ndjson-streaming, drag-drop, destructive-confirm, toast, cart-reconciliation]

# Dependency graph
requires:
  - phase: 10-csv-import
    provides: POST /api/admin/import/preview NDJSON stream + POST /api/admin/import/commit (landed 10-02)
  - phase: 10-csv-import
    provides: IMPORT_FILE_FIELD + ImportStreamMessage + PreviewPayload + CommitRequest/Response (landed 10-02)
  - phase: 09-admin-inventory-management
    provides: existing Toast component on /admin (variant added in this plan)
  - phase: 04-shopping-cart
    provides: cart store + cart-page-client used by D-13 reconciliation
provides:
  - /admin/import page (server entry + client orchestrator)
  - Drag-drop or click-to-browse upload with .csv extension gate
  - Live "X / Y cards enriched" progress bar driven by NDJSON stream
  - Three-zone preview (Summary counts, 20-card sample, expandable Skipped rows)
  - Destructive Confirm button with "replace all {N} current cards with {M} new cards" label
  - Toast.variant="success"|"error" (default "error", green ribbon for success)
  - "Import CSV" Link in /admin action bar (left of Export CSV)
  - Post-import success toast on /admin via sessionStorage handoff
  - D-13 silent cart reconciliation: cart-page-client drops items whose IDs no longer exist after import
affects: [storefront-cart, admin-inventory-toast]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NDJSON client reader: ReadableStreamDefaultReader + TextDecoder({ stream: true }) + buffer.split('\\n') with trailing-line carry"
    - "FormData + multipart upload via fetch with shared IMPORT_FILE_FIELD constant"
    - "sessionStorage handoff between routes: importer writes 'admin-toast' before router.push('/admin'); inventory page reads + clears in useEffect"
    - "Discriminated-union state machine for upload UI (idle | uploading | preview | committing | error) with no in-place mutation"
    - "Variant-prop pattern on Toast component preserves backward-compat default (variant defaults to 'error')"
    - "Cart silent reconciliation: useEffect listens for allCards changes and removes items whose composite IDs aren't in the new card map"

key-files:
  created:
    - src/app/admin/import/page.tsx
    - src/app/admin/import/_components/import-client.tsx
    - src/app/admin/import/_components/drop-zone.tsx
    - src/app/admin/import/_components/progress-bar.tsx
    - src/app/admin/import/_components/preview-panel.tsx
    - .planning/phases/10-csv-import/10-03-SUMMARY.md
  modified:
    - src/app/admin/_components/action-bar.tsx
    - src/app/admin/_components/toast.tsx
    - src/app/admin/_components/inventory-table.tsx
    - src/app/cart/cart-page-client.tsx

key-decisions:
  - "Confirm button label IS the safeguard (D-12): 'Confirm import — replace all {currentTotal} current cards with {toImport} new cards' rendered verbatim; user is reading the destructive action they're authorising"
  - "Confirm disabled when toImport === 0 (RESEARCH Pitfall 7) — protects against the empty-CSV foot-gun before commit reaches the route"
  - "Client buffers the FULL enriched cards[] from preview's final NDJSON message and POSTs it back to /commit unmodified — preview is the contract, commit is the executor"
  - "sessionStorage 'admin-toast' is the cross-route handoff (router.push doesn't preserve client state); inventory-table reads + clears on mount, with try/catch around storage access"
  - "D-13 cart reconciliation is silent (no banner) per phase decision — friend-store UX prefers quiet correctness over scolding the buyer"
  - "Toast.variant defaults to 'error' so Phase 9 callers stay green; only the import success path opts into 'success'"
  - "Plan executed across 2 commits (4afa7e6 import flow + page; dec5dbe Toast variant + Import-CSV link + cart reconciliation) rather than 1 -- artifacts split cleanly along owner files"

requirements-completed: [CSV-01, CSV-02]

# Metrics
duration: ~4min
completed: 2026-04-20
---

# Phase 10 Plan 03: Admin Import UI Summary

**Complete admin user flow for CSV import: drag-drop upload, live NDJSON-streamed enrichment progress, three-zone preview, destructive replace-all confirm, post-import success toast on /admin, and silent cart reconciliation for buyers whose stored items vanish.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-04-20
- **Tasks:** 3 (page + components, action-bar/toast/inventory wiring, cart reconciliation)
- **Files created:** 5 source + this summary
- **Files modified:** 4

## Accomplishments

- `/admin/import` page renders behind the existing admin auth gate, fetches `currentTotal` server-side, and hands off to `ImportClient`.
- `ImportClient` is a discriminated-union state machine (`idle | uploading | preview | committing | error`). It POSTs the file as multipart `file`, reads the NDJSON stream line-by-line with `TextDecoder({ stream: true })`, surfaces every `progress` message to the live counter, and stashes the final `result.preview` in component state.
- `DropZone` accepts drag-drop OR click-to-browse, gates on `.csv` extension, and rejects others with the exact copy specified in D-04.
- `ProgressBar` renders an accent-filled bar driven by `done/total`, falling back to indeterminate animation when `total === 0`.
- `PreviewPanel` renders three zones: (1) Summary counts, (2) up-to-20 sample tiles, (3) expandable Skipped Rows section that distinguishes parse skips from Scryfall misses via the `kind` discriminator.
- The Confirm button renders the literal D-12 label `Confirm import — replace all {currentTotal} current cards with {toImport} new cards`, uses `bg-red-600` destructive styling, and is `disabled` when `toImport === 0`.
- Confirm flow: POSTs `body.cards` to `/api/admin/import/commit`, awaits `{success, inserted}`, writes a `success` toast payload to `sessionStorage.admin-toast`, then `router.push('/admin')`.
- `Toast` gained a `variant: "success" | "error"` prop. `success` renders green (`bg-green-50 / border-green-300 / text-green-700`), `error` keeps the existing red. Default is `"error"` so Phase 9 callers behave identically.
- `action-bar.tsx` now renders an `Import CSV` Next.js `<Link href="/admin/import">` immediately to the left of the existing Export CSV button (D-02).
- `inventory-table.tsx` reads and clears `sessionStorage.admin-toast` on mount, surfacing the post-import toast on /admin for ~4s.
- `cart-page-client.tsx` watches the live card map and silently removes items whose composite IDs are no longer present (D-13). No "No longer available" banner — the disappearance is the signal.

## Task Commits

1. **Task 1: /admin/import page + drop-zone, progress-bar, preview-panel, import-client** — `4afa7e6` (feat)
2. **Task 2: Toast variant + action-bar Import CSV link + inventory-table sessionStorage toast + cart silent reconciliation** — `dec5dbe` (feat)

## Files Created

- `src/app/admin/import/page.tsx` — server entry, requireAdmin gate, currentTotal fetch, renders ImportClient.
- `src/app/admin/import/_components/import-client.tsx` — top-level state machine.
- `src/app/admin/import/_components/drop-zone.tsx` — drag-drop + click-to-browse.
- `src/app/admin/import/_components/progress-bar.tsx` — live progress with indeterminate fallback.
- `src/app/admin/import/_components/preview-panel.tsx` — three-zone preview.

## Files Modified

- `src/app/admin/_components/action-bar.tsx` — added `Import CSV` Link.
- `src/app/admin/_components/toast.tsx` — added `variant` prop, success styling.
- `src/app/admin/_components/inventory-table.tsx` — sessionStorage toast read on mount.
- `src/app/cart/cart-page-client.tsx` — D-13 silent reconciliation effect.

## Verification

The plan was `autonomous: false` because the final checkpoint is human-verify (drag-drop browser interaction, visible toast animation, storefront cross-page flow). Code-level verification:

- `npx tsc --noEmit` — clean
- `npx vitest run` — 121/121 green (no new tests added; this plan is UI surface)
- All artifacts exist on disk at the paths declared in 10-03-PLAN.md
- All key_links present (grep'd for the link patterns in the plan)

## Post-Launch Hotfixes

Real-user import on the deployed `wikos-spellbinder.vercel.app` surfaced four production-only issues that were patched on `main` after Plan 03 merged. They're documented in STATE.md under "Post-Phase 10 Hotfixes" rather than as separate phases because each was a 1-file, < 100-line fix unblocking a broken prod flow:

| Commit | What broke | Why |
| ------ | ---------- | --- |
| `7b3f517` | Every imported card showed "not found on Scryfall" | `setCache` wrote to project-relative path; Vercel's serverless FS is read-only outside `/tmp`, so the catch in scryfall.ts treated EROFS as a Scryfall miss for every card |
| `cdba6fa` | ~4% of cards mislabeled "not found on Scryfall" | `fetchCard` returned null on any non-OK status, conflating 429/5xx with 404; added retry-with-backoff for transient errors |
| `3fdc83d` | Foil prices showed non-foil USD | `getPrice` ignored `card.foil`; now prefers `usd_foil → usd_etched → usd` for foil rows |

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (`4afa7e6`, `dec5dbe`) verified in git log. Production deploy `mtg-bulk-sale-page-izvnolly8` (Ready, 2026-04-20) is the merge-to-main artifact. Subsequent hotfixes (`7b3f517`, `cdba6fa`, `3fdc83d`) restored the import flow on Vercel.

---
*Phase: 10-csv-import*
*Completed: 2026-04-20*
