# Phase 10: CSV Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 10-csv-import
**Areas discussed:** Upload location & UX, Preview content & skip report, Enrichment timing & progress UX, Destructive replace confirmation

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Upload location & UX | Separate /admin/import page vs modal vs inline panel. Drag-drop vs file-picker. | ✓ |
| Preview content & skip report | Summary counts only vs full table. How to surface skipped rows. | ✓ |
| Enrichment timing & progress UX | Sync-blocking vs background job. ~15s–few min per import. | ✓ |
| Destructive replace confirmation | Full-replace wipes all cards, affects in-flight buyer carts. | ✓ |

**User's choice:** All four selected.

---

## Upload Location & UX

### Where should the CSV import live?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate /admin/import page | New route. "Import CSV" button in action bar links here. Room for preview + skip list. | ✓ |
| Modal on /admin page | Keeps user on inventory page. Cramped for large skip lists. | |
| Inline panel above inventory | Expand/collapse panel. Competes with table for space. | |

**User's choice:** Separate /admin/import page (recommended).

### How should the user choose the file?

| Option | Description | Selected |
|--------|-------------|----------|
| Drag-drop zone + click-to-browse | Single zone handles both interactions. | ✓ |
| File picker button only | Simple `<input type=file>` styled button. | |

**User's choice:** Drag-drop zone + click-to-browse (recommended).

### Entry-point styling on inventory page

| Option | Description | Selected |
|--------|-------------|----------|
| Button in action bar next to Export CSV | Symmetric paired operation in top-right of action bar. | ✓ |
| Primary CTA (emphasized styling) | Visually prominent but mismatched with flat admin UI. | |
| Icon-only button with tooltip | Saves space, less discoverable. | |

**User's choice:** Button in action bar next to Export CSV (recommended).

### File validations before preview

| Option | Description | Selected |
|--------|-------------|----------|
| .csv extension check | Reject non-.csv at upload boundary. | ✓ |
| File size cap (e.g. 5 MB) | Protects server from oversized uploads. | |
| Header-row schema gate | Reject files missing required columns. | |

**User's choice:** Only `.csv` extension check.
**Notes:** Single-admin store behind Google OAuth — lighter gates are acceptable. Schema mismatches will surface as skipped rows during parse.

---

## Preview Content & Skip Report

### What should the preview show?

| Option | Description | Selected |
|--------|-------------|----------|
| Summary stats + sample rows + skip list | Counts up top, ~20 sample cards, expandable skipped-rows list. | ✓ |
| Summary stats only | Just counts. Fastest to build, least reassuring. | |
| Full table of all rows | Every card shown. High confidence but heavy. | |

**User's choice:** Summary stats + sample rows + skip list (recommended).

### Should preview include enrichment?

| Option | Description | Selected |
|--------|-------------|----------|
| Enrich during preview | Admin sees real prices + Scryfall misses before committing. Slow step runs upfront. | ✓ |
| Enrich only after confirm | Preview is parse-only. Scryfall misses surface after the destructive click. | |

**User's choice:** Enrich during preview (recommended).

### Skipped rows reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable list with row# + reason | Inline collapsible section. | ✓ |
| Downloadable skipped-rows.csv | Offline inspection via spreadsheet. | |
| Both: inline + downloadable | Best coverage, most work. | |

**User's choice:** Expandable list with row# + reason (recommended).

### Confirm / Cancel flow

| Option | Description | Selected |
|--------|-------------|----------|
| Preview shows Confirm import + Cancel buttons | Cancel returns to blank /admin/import. | ✓ |
| Preview auto-commits after N seconds | Timed confirmation. Overkill and error-prone. | |

**User's choice:** Confirm + Cancel buttons (recommended).

---

## Enrichment Timing & Progress UX

### How should enrichment run during preview?

| Option | Description | Selected |
|--------|-------------|----------|
| Synchronous with progress indicator | Server enriches inline. UI shows "Enriching... (45 / 150)". | ✓ |
| Background job with status polling | Upload starts a job, UI polls. Survives tab-close but adds job-state complexity. | |
| Sync with spinner only | Easiest. No feedback during 15s–min run. | |

**User's choice:** Synchronous with progress indicator (recommended).

### Progress signal

| Option | Description | Selected |
|--------|-------------|----------|
| Live count "X / Y cards enriched" | Most informative. Requires streaming or polling. | ✓ |
| Indeterminate spinner with elapsed time | Simpler. No ETA. | |
| Progress bar estimated from row count | Estimate based on 100ms/row. Drifts on cache hits. | |

**User's choice:** Live count "X / Y cards enriched" (recommended).

### Vercel function timeout handling

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js `maxDuration = 300` | Vercel Pro 300s ceiling. Single endpoint. | ✓ |
| Chunk enrichment into batches with resume | Avoids long handler, much more complex. | |
| Defer to planning/research | Let researcher pick approach. | |

**User's choice:** `maxDuration = 300` (recommended).

### Scryfall cache reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 24h cache | Re-imports of same collection near-instant. | ✓ |
| Bypass cache for admin import | Always fresh prices, always slow. | |

**User's choice:** Reuse cache (recommended).

---

## Destructive Replace Confirmation

### Final "Confirm import" strength

| Option | Description | Selected |
|--------|-------------|----------|
| Single button with preview counts in label | "Confirm import — replace all 136 cards with 143 new cards". Delta IS the safeguard. | ✓ |
| Checkbox "I understand..." + button | Two-step friction. | |
| Type-to-confirm (type REPLACE) | Strongest. Overkill for single-admin friend store. | |

**User's choice:** Single button with preview counts in label (recommended).

### Cart safety for active buyers

| Option | Description | Selected |
|--------|-------------|----------|
| Accept stale carts; storefront filters unknown IDs | Cart page reconciles against new DB and silently drops missing cards. | ✓ |
| Auto-clear all carts on import | Impossible without buyer accounts (localStorage). | |
| Defer — let planner handle | Flag as risk only. | |

**User's choice:** Accept stale carts; storefront filters unknown IDs on cart page (recommended).

### DB replace transaction shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single db.transaction(): DELETE all, INSERT all | All-or-nothing. Rollback on error preserves old inventory. | ✓ |
| Backup-then-replace with rollback on failure | Extra machinery over what transactions already provide. | |
| Soft-delete with replaced_at timestamp | Bloats cards table. | |

**User's choice:** Single DB transaction (recommended).

### Post-import landing

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to /admin + success toast | "Imported 143 cards (4 skipped)". Closes the loop immediately. | ✓ |
| Stay on /admin/import with summary screen | Extra click, reinforces what happened. | |
| Summary screen + auto-redirect | Timed redirect. Unnecessary. | |

**User's choice:** Redirect to /admin + success toast (recommended).

---

## Claude's Discretion

- Exact mechanism for streaming live enrichment progress (SSE vs chunked vs polling)
- Visual styling of drag-drop zone (dashed border, hover/active states)
- Toast message wording beyond "Imported N cards (M skipped)" template
- Scryfall 429 / transient failure handling mid-enrichment
- Error UI when parse fails entirely (zero valid rows)
- Whether "Import CSV" button disables during admin table loading
- Progress payload schema

## Deferred Ideas

- Differential/merge import (out of scope per REQUIREMENTS.md)
- Scheduled/automated imports (out of scope)
- Admin undo / auto-snapshot before destructive replace (Export CSV covers manual pre-flight)
- Real-time Scryfall price refresh (out of scope per PROJECT.md)
