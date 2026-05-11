# Phase 19: Import Preview & Picker - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `/admin/import` flow with a binder picker. After parse (under 2s), the import preview surfaces every binder discovered in the upload as a checkbox list with row counts. Operator selects which binders to include; selection is remembered between imports via `zustand persist`; commit replaces only the inventory in selected binders (DELETE WHERE binder IN selected; unselected binders' rows persist untouched). Audit + import_history records the selected/new/missing binder context within the existing 4KB metadata cap.

Two-stage NDJSON streaming protocol: parse-and-list-binders message fires first (fast, no Scryfall calls), then enrichment runs ONLY on the rows in selected binders. Saves time and Scryfall API budget on partial-binder imports.

</domain>

<decisions>
## Implementation Decisions

### NDJSON streaming protocol (locked by research)
- **D-01:** Two-stage contract on `POST /api/admin/import/preview`:
  1. Server parses the CSV (no Scryfall calls), groups by binder, emits ONE message: `{ type: 'binders', binders: BinderSummary[] }` where `BinderSummary = { name: string; rowCount: number; sampleNames: string[] /* first 3-5 card names for at-a-glance recognition */; isNew: boolean /* not in operator's previous selection */ }`
  2. Client renders the picker; operator selects; client POSTs the selected list back to a NEW endpoint or re-uses the existing preview endpoint with a `selectedBinders[]` body field
  3. Server enriches ONLY the rows from selected binders, streaming the existing per-row progress messages
- **D-02:** Two-call flow (binders-then-enrichment) preferred over hold-and-resume (per ARCHITECTURE research). Stateless on the server; client manages selection state. Implementation: a new `?stage=binders` query param on the existing preview endpoint OR a new dedicated endpoint — planner picks whichever creates less surface duplication.

### Binder picker UI (locked + auto-mode refinements)
- **D-03:** Picker is hand-rolled `<input type="checkbox">` list mirroring `src/components/filter-rail.tsx` (the established multi-select-with-counts pattern in this codebase, used in 4 places already). NO new UI primitive library. Tailwind for styling.
- **D-04:** Picker layout: vertical stack of binder rows. Each row: `[checkbox] [binder name] [row count, formatted with commas e.g. "3,576"] [optional NEW badge] [optional 3-5 sample card names, smaller text]`. Sample names give operator at-a-glance "is this the binder I think it is" recognition.
- **D-05:** **Sort order:** NEW binders sort to top (default-checked AND visually highlighted with green NEW badge so operator notices). Existing binders sort alphabetically below. Both groups sorted within themselves.
- **D-06:** **Row count display:** full integer formatted with thousands separator (`3,576` not `3.5k`). Operator wants precision when deciding whether to include a 3,576-row binder.
- **D-07:** **NEW badge:** small green pill `NEW` to the right of the row count. Tailwind: `bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded`.
- **D-08:** **`unsorted` row treatment** (per Phase 16 D-10): always shows in picker; default UNCHECKED on every import. Has a special `Legacy` badge (gray) to distinguish from NEW binders. Sample names are 3-5 cards from the legacy `unsorted` rows.

### Selection memory (locked by research)
- **D-09:** New zustand slice `useBinderImportStore` with `persist` middleware (existing pattern from `cart-store.ts`). Stored: `lastSelection: Record<string, boolean>` keyed by normalized binder name. On picker render, default state for each binder is `lastSelection[binder.name] ?? binder.isNew` (NEW defaults to checked; existing defaults to last selection).
- **D-10:** localStorage key: `viki-binder-import-selection`. Versioned in case the schema needs to change (`{ v: 1, lastSelection: { ... }, lastUsedAt: ISO }`).

### Will-delete panel (auto-mode)
- **D-11:** When the upload is MISSING binders that were in the previous selection (i.e., operator imported A01..A14 last time, but A07 is missing this time), show a separate "Will delete" panel ABOVE the picker:
  ```
  ⚠ 1 binder is missing from this upload but was selected last time:
    [✓] A07 (107 rows)  ← will be DELETED if you commit
  
  Uncheck to keep the existing rows intact.
  ```
  Default-CHECKED so the operator must explicitly uncheck to preserve. Forces conscious decision.
- **D-12:** Will-delete panel renders ONLY when `missingBinders.length > 0`. Empty state is noise; suppress.

### Confirmation flow (auto-mode)
- **D-13:** **Inline destructive confirmation** mirroring Phase 10's pattern at `src/app/admin/import/_components/import-client.tsx` (the existing replace-all confirm). NO separate modal. The "Commit import" button transitions to an inline confirmation:
  ```
  This will:
    - Add: 470 rows to "foundation box"
    - Replace: 481 rows in "final fantasy" (was 481, will be 481)
    - Delete: 107 rows in "A07" (binder missing from this upload)
    - Add: 11 rows to "A14" [NEW]
  
  Total after import: 12,749 rows across 30 binders.
  
  [Commit import — type "REPLACE" to confirm] [Cancel]
  ```
  Existing pattern uses a typed phrase ("REPLACE") to prevent autopilot click-through. Reuse same phrase for consistency. (D-12 from Phase 10 — adopt verbatim.)
- **D-14:** Confirmation displays the per-binder ADD/REPLACE/DELETE breakdown so operator sees the consequences before clicking. Computed client-side from `BinderSummary[]` + the operator's selection.

### Server commit (`replaceCardsForBinders`) (locked by architecture)
- **D-15:** New helper `replaceCardsForBinders(cards: Card[], selectedBinders: string[], audit: AuditContext): Promise<{ deleted: number; inserted: number; importHistoryId: number }>` in `src/db/queries.ts`. Internally:
  ```
  db.batch([
    sql\`DELETE FROM cards WHERE binder = ANY(${selectedBinders})\`,
    sql\`INSERT INTO cards (...) VALUES (...) ON CONFLICT (id) DO UPDATE ...\`,
    sql\`INSERT INTO admin_audit_log (...)\`,
    sql\`INSERT INTO import_history (...)\`,
  ])
  ```
  Atomic; one network round-trip. Replaces existing `replaceAllCards` (renamed; old function deleted in same commit).
- **D-16:** `selectedBinders` validation: server rejects if any name fails the parser's normalization function (calls `normalizeBinderName()` from Phase 17 to confirm shape). Defense against client tampering.

### Audit + import_history metadata shape (locked by PITFALLS Pitfall 13)
- **D-17:** Bounded shape `ScopedImportAuditMetadata`:
  ```ts
  {
    selectedBinders: string[];           // truncate to first 50 if longer; rare
    totalBindersInExport: number;
    scopedReplaceCounts: {
      before: Record<string, number>;    // before counts per selected binder
      after: Record<string, number>;     // after counts per selected binder
      deletedFromUnselected: 0;          // literal-typed invariant
    };
    totalCardsAfterImport: number;
    newBindersInExport: string[];        // capped at 50
    missingBindersFromExport: string[];  // capped at 50
  }
  ```
  Estimated ~1.5KB serialized for typical (30 binders, ~10 selected). Fits 4KB cap (PITFALLS Pitfall 13).
- **D-18:** `deletedFromUnselected: 0` is a typed invariant. The helper THROWS before the batch executes if any DELETE would touch unselected binders. Belt-and-suspenders against a query-construction bug.

### Rate limiting + auth (preserved from v1.2)
- **D-19:** No new rate limit bucket. Reuse `RATE_LIMIT_BUCKETS.ADMIN_BULK` (already wired on `/api/admin/import/commit` per Phase 15 D-01). Per Phase 22 (HARD-02 / D-DOS-01 resolution), Phase 22 will ADD a rate limit on `/api/admin/import/preview` (currently unprotected); not Phase 19's responsibility.
- **D-20:** `requireAdmin()` gate stays unchanged on both preview and commit routes.

### Claude's Discretion
- Exact Tailwind class names for picker styling
- Whether to render the BinderSummary's `sampleNames` as inline text or a small expand-on-hover popover
- Specific endpoint shape for stage-2 enrichment (`?stage=binders` query vs new endpoint)
- Test approach for the picker UI (component test + E2E test, or just component)
- Exact placement of the Will-delete panel relative to the main picker (above with separator vs collapsible)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/PITFALLS.md` — Pitfall 8 (picker latency); Pitfall 9 (remembered selection silently drops new binders); Pitfall 13 (audit metadata bounded under 4KB); Pitfall 10 (binder name typo)
- `.planning/research/ARCHITECTURE.md` — Two-stage NDJSON protocol design (Q5 walk-through); `replaceCardsForBinders` shape; per-binder selective replace pattern
- `.planning/research/FEATURES.md` — UX comparison with SortSwift; "operator selects what's in the import" is the differentiator from SortSwift

### Prior phase context
- `.planning/phases/16-schema-migration/16-CONTEXT.md` — D-10 (`unsorted` picker visibility behavior) — Phase 19 implements this
- `.planning/phases/17-parser-etched/17-CONTEXT.md` — `normalizeBinderName()` helper (D-12 Discretion); Phase 19 reuses for picker name display + server-side validation
- `.planning/phases/18-allocator/18-CONTEXT.md` — Phase 18 doesn't directly couple to Phase 19, but both write to `cards.binder` rows. The allocator handles concurrent reads while picker imports happen; the rate limit bucket (ADMIN_BULK) ensures imports don't starve checkouts.

### Existing codebase patterns to mirror / extend
- `src/app/api/admin/import/preview/route.ts` — Existing NDJSON streaming preview endpoint to extend with the new binders-stage message
- `src/app/api/admin/import/commit/route.ts` — Existing commit endpoint; calls `replaceAllCards`. Phase 19 changes the call to `replaceCardsForBinders(cards, selectedBinders, audit)`.
- `src/app/admin/import/_components/import-client.tsx` — Existing client component with NDJSON reader, three-zone preview, destructive replace-all confirm (Phase 10 D-13). Phase 19 adds the binder picker step BEFORE the existing confirm.
- `src/components/filter-rail.tsx` — The "multi-select-with-counts" pattern Phase 19's binder picker mirrors
- `src/lib/store/cart-store.ts` — The `zustand persist` pattern for the new `useBinderImportStore`
- `src/db/queries.ts` `replaceAllCards` (lines 809+) — The function being REPLACED with `replaceCardsForBinders`. Same `db.batch` shape; new WHERE clause on the DELETE.
- `src/lib/import-contract.ts` — NDJSON message types; add `{ type: 'binders', binders: BinderSummary[] }` here

### Reference docs
- [zustand persist middleware](https://docs.pmnd.rs/zustand/integrations/persisting-store-data) — for `useBinderImportStore`
- [Drizzle Batch API](https://orm.drizzle.team/docs/batch-api) — for `replaceCardsForBinders`'s atomic batch

### Project docs
- `.planning/REQUIREMENTS.md` — IMP-01..06 are this phase's requirements
- `.planning/PROJECT.md` — "Import preview shows binder picker (every binder name + row count + checkbox + remembered selection via zustand persist)" — Current Milestone target

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `import-client.tsx` NDJSON reader (`reader.read()` loop) — extend to handle the new `binders` message type before the existing per-row progress messages
- `filter-rail.tsx` checkbox+count pattern — copy/adapt for the picker
- `cart-store.ts` zustand persist Map serializer — adapt for the binder selection (Map → Record<string, boolean>)
- `replaceAllCards` `db.batch` pattern — direct template for `replaceCardsForBinders`
- Phase 10 D-13 destructive confirmation pattern (typed REPLACE) — Phase 19 reuses for the binder-aware commit confirmation

### Established Patterns
- **Multi-select with counts** (`filter-rail.tsx`) — the canonical UI shape in this codebase
- **Atomic batch writes** (`db.batch`) — used for every multi-table mutation
- **NDJSON progress streaming** (Phase 10) — pattern for long-running admin operations
- **Typed-phrase destructive confirm** (Phase 10) — the operator-on-autopilot prevention

### Integration Points
- **Phase 16** (already discussed) — schema with `binder` column ready
- **Phase 17** (already discussed) — `normalizeBinderName()` helper Phase 19 reuses
- **Phase 18** (independent) — concurrent operation; ADMIN_BULK rate limit prevents collisions
- **Phase 20** (Storefront Aggregation) — independent; both consume the new `binder` column from different angles
- **Phase 21** (Admin Visibility & Audit) — reads the audit metadata Phase 19 writes; renders the new ScopedImportAuditMetadata fields
- **Phase 22** (Hardening & UAT) — adds rate limit to `/api/admin/import/preview` (D-DOS-01 resolution); Phase 19 doesn't add it

</code_context>

<specifics>
## Specific Ideas

- The binder picker is the operator's primary workflow upgrade in v1.3. Spend the polish budget here. A picker that takes 30 seconds to scan and check is the difference between "import binders" being a 1-minute task and a 5-minute task.
- The "Will delete" panel (D-11) catches the operator-on-autopilot Pitfall 9. If they always click through to commit, missing-binder rows would silently disappear. The panel forces conscious intent.
- Sample card names per binder (D-04, 3-5 names) are a memory aid: "oh right, A07 is the Theros binder". Costs nothing extra (already parsed into memory).
- The `binders` NDJSON message stage MUST fire under 2s for the 12,749-row real export (PITFALLS Pitfall 8 / HARD-03 perf pin in Phase 22). Parser is the only work between upload and this message. No Scryfall calls in stage 1.

</specifics>

<deferred>
## Deferred Ideas

- **Did-you-mean hint** for binder name typos within edit-distance 1 — research P2 (IMP-FUT-01); v1.3.x
- **Operator rename-at-upload** (type a custom name into a text field next to a binder in the picker) — explicitly NOT in v1.3; if ever needed, operator renames in Manabox
- **Save/load named selection presets** ("my chaos batches preset" vs "my themed binders preset") — research P3; v1.4+
- **Batch confirm without typed phrase** for power-user mode — explicitly rejected; the typed phrase is the operator-on-autopilot guard

</deferred>

---

*Phase: 19-Import Preview & Picker*
*Context gathered: 2026-05-11*
