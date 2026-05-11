# Requirements: Viki — MTG Bulk Store

**Defined:** 2026-05-11 (v1.3)
**Core Value:** Friends can easily find and order cards from the bulk collection without friction — browse, pick, checkout, done.
**Milestone Goal:** Every card in the storefront knows which physical binder it lives in, so the admin can fulfill orders without flipping through every binder.

## v1.3 Requirements

Requirements for the Binder-Aware Inventory & Pick Workflow milestone. Each maps to a roadmap phase.

### Schema & Migration

- [ ] **BIND-01**: The `cards` table composite ID includes a binder dimension so the same card listing can exist in multiple binders as separate stock rows
- [ ] **BIND-02**: Schema migration backfills all existing inventory rows with `binder = 'unsorted'` so cart and checkout keep working from the moment the schema lands
- [ ] **BIND-03**: The `order_items` table snapshots the source binder per line so order detail can render binder annotations without joining to live `cards`
- [ ] **BIND-04**: The `cards.quantity` column carries a `CHECK (quantity >= 0)` constraint as a schema-level safety net against any over-decrement bug
- [ ] **FIN-01**: The card finish becomes a 3-value enum (`normal` / `foil` / `etched`) replacing the existing `foil: boolean`, and migration backfills from the existing column without data loss

### CSV Parser

- [ ] **CSV-05**: Manabox CSV parser ingests `Binder Name` and `Binder Type` columns from the standard full-collection export
- [ ] **CSV-06**: Parser skips rows where `Binder Type != 'binder'` (i.e., decks and lists are excluded from physical inventory) and reports the skip count in the import preview
- [ ] **CSV-07**: Binder names are normalized at parse time (trim, lowercase, collapse internal whitespace, replace `-` with `_`) so name typos and the cart-key segment-strip migration both stay safe
- [ ] **CSV-08**: Cards with `Foil = etched` parse as `finish = etched` (fixes the latent v1.2 bug where etched cards were silently treated as `normal`, causing wrong prices and PK collisions with non-foil twins)

### Import Preview & Picker

- [ ] **IMP-01**: Import preview shows every binder name with its row count and a per-binder checkbox; admin selects which binders to include in this import
- [ ] **IMP-02**: The selection is remembered between imports (persisted client-side); subsequent imports default to the same binders selected last time
- [ ] **IMP-03**: New binders appearing in an upload (not in the previous selection) are flagged as `NEW` in the picker so the operator notices and decides
- [ ] **IMP-04**: Binders previously imported but missing from the current export appear in a separate `Will delete` panel; the operator must explicitly confirm before any deletion happens
- [ ] **IMP-05**: Import commit replaces only the inventory in selected binders; unselected binders' rows are untouched (`DELETE WHERE binder IN (selected)`, not `DELETE *`)
- [ ] **IMP-06**: Audit log and import_history record the selected binder names, per-binder before/after row counts, new binders, and missing binders — all within the existing 4KB metadata cap

### Storefront Aggregation

- [ ] **AGG-01**: Storefront card listings aggregate `SUM(quantity)` across binders for the same logical card (set + collector number + finish + condition); buyers see one row per logical card with the total stock
- [ ] **AGG-02**: Binder names never appear in any public-facing surface — storefront SSR responses, cart payloads, checkout payloads, stock-conflict responses, buyer confirmation emails, or any structured log emitted from a public route
- [ ] **AGG-03**: Existing buyer carts persisted under v1.2 composite keys silently reconcile to v1.3 aggregated keys on first visit (transfer the quantity into the matching aggregated card if present; clamp to current stock; silently drop if no match)

### Checkout Allocator

- [ ] **ALLOC-01**: Checkout commit deterministically allocates each buyer line across binder source rows using a smallest-quantity-first strategy with lexicographic binder-name tiebreaker
- [ ] **ALLOC-02**: A single buyer line for a card whose stock is split across multiple binders produces multiple `order_items` rows — one per binder source — each snapshotting the originating binder name
- [ ] **ALLOC-03**: Concurrent checkouts requesting overlapping binder stock are serialized atomically inside one SQL CTE chain such that the total stock decrement matches the total stock available — never an oversell, never a silent partial fulfillment that violates all-or-nothing semantics
- [ ] **ALLOC-04**: When stock is insufficient across all binders combined, the allocator returns the same `StockConflict` shape as today with `available` reporting the aggregated total — buyers never see a per-binder breakdown of where stock lives

### Admin Visibility

- [ ] **ADM-01**: Admin order detail shows a `[binder]` annotation on every line item, read from the `order_items.binder` snapshot column (not joined to live `cards`, so the annotation survives even if the source card row is later deleted)
- [ ] **ADM-02**: Admin inventory table includes a `Binder` column and a binder filter dropdown populated from the distinct set of binder names currently in inventory
- [ ] **ADM-03**: Admin audit/history page renders the new scoped-import metadata fields (selected binders, per-binder before/after counts, new/missing binders) in a compact, human-readable form

### Hardening & UAT

- [ ] **HARD-01**: A multi-binder concurrent-checkout proof harness extends the Phase 11 baseline, demonstrating that two simultaneous orders requesting overlapping binder stock cannot both succeed
- [ ] **HARD-02**: A STRIDE delta document records the new I-DISC-05 (binder leak) finding and resolves the deferred D-DOS-01 (import preview rate-limit) since v1.3 amplifies its per-call cost
- [ ] **HARD-03**: Parsing the production-scale 12,749-row Manabox CSV completes in under 2 seconds (perf pin in unit tests); binder picker renders in the admin browser within 3 seconds of upload
- [ ] **HARD-04**: Live-deployment UAT scenarios documented and passed: operator-on-autopilot binder picker, v1.2→v1.3 cart hydration, over-decrement detection via CHECK constraint trip, public-page binder-name leak grep

## Future Requirements

Deferred to v1.3.x or later milestones; tracked but not in this roadmap.

### Allocator Enhancements

- **ALLOC-FUT-01**: Configurable allocator strategy (largest-first, lexicographic-only, FIFO by import date) chosen per-import or per-store
- **ADM-FUT-01**: Allocator preview in admin order detail (read-only `[binder × qty]` per line BEFORE the operator confirms order workflow status)

### Operator Workflow

- **ADM-FUT-02**: Bulk-edit binder column on selected inventory rows with merge-on-collision modal (handles the user's stated "consolidate A02 into A07" workflow without re-importing)
- **ADM-FUT-03**: `unsorted` filter chip on admin inventory (one-click filter to show all rows still on the migration default binder)
- **ADM-FUT-04**: Audit log captures per-line allocated binder for each completed checkout

### Import Quality of Life

- **IMP-FUT-01**: Did-you-mean hint at import time for binder names within edit-distance 1 of an existing binder (catches "A02 " vs "A02" before the operator commits)

### Buyer Accounts (carried over from v1.2)

- **BUYER-01**: Friends can sign in with Google to view their own order history
- **BUYER-02**: Checkout auto-fills name/email from Google profile

### Visual Polish (carried over from v1.2)

- **VISP-01**: Visual WUBRG mana icons on filter buttons
- **VISP-02**: Cart count badge in header/nav
- **VISP-03**: Inventory freshness indicator ("Last updated" date)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Separate "pick view" / printable pick list page | Admin order detail IS the pick view — per-line `[binder]` annotation is sufficient. SortSwift docs confirm this is the standard pattern. |
| Per-binder buyer-facing display on storefront | Friends don't care which binder a card lives in; surfacing it leaks physical organization details and clutters listings |
| Binder-name regex validation or naming-pattern enforcement | Breaks the user's real binder set (`Bulk Drawers`, `lord of the rings`, `compré titán`, `A01`-`A14`); free-text binder names is the right model |
| Drag-and-drop binder visualization | Cost vs benefit absurd at this scale; bulk-edit (deferred to v1.3.x) covers the only real need |
| Per-binder capacity tracking | Friends store; no SLA on "binder full" or pack-density optimization |
| Mobile pick-mode UI | Admin tasks are desktop workflows; storefront stays mobile-responsive |
| Configurable allocator strategy in v1.3 | Smallest-first + lex tiebreaker is the SortSwift-validated default; revisit only if real fulfillment friction emerges |
| Auto-sync from Manabox API | No public Manabox API; CSV upload is the contract |
| Binder transfer history (audit log of cards moving between binders) | Out of scope for v1.3; can be derived later from sequential audit log entries if needed |

## Traceability

Which phases cover which requirements. Continues phase numbering from v1.2 (last phase: 15).

| Requirement | Phase | Status |
|-------------|-------|--------|
| BIND-01 | Phase 16 | Pending |
| BIND-02 | Phase 16 | Pending |
| BIND-03 | Phase 16 | Pending |
| BIND-04 | Phase 16 | Pending |
| FIN-01 | Phase 16 | Pending |
| CSV-05 | Phase 17 | Pending |
| CSV-06 | Phase 17 | Pending |
| CSV-07 | Phase 17 | Pending |
| CSV-08 | Phase 17 | Pending |
| ALLOC-01 | Phase 18 | Pending |
| ALLOC-02 | Phase 18 | Pending |
| ALLOC-03 | Phase 18 | Pending |
| ALLOC-04 | Phase 18 | Pending |
| IMP-01 | Phase 19 | Pending |
| IMP-02 | Phase 19 | Pending |
| IMP-03 | Phase 19 | Pending |
| IMP-04 | Phase 19 | Pending |
| IMP-05 | Phase 19 | Pending |
| IMP-06 | Phase 19 | Pending |
| AGG-01 | Phase 20 | Pending |
| AGG-02 | Phase 20 | Pending |
| AGG-03 | Phase 20 | Pending |
| ADM-01 | Phase 21 | Pending |
| ADM-02 | Phase 21 | Pending |
| ADM-03 | Phase 21 | Pending |
| HARD-01 | Phase 22 | Pending |
| HARD-02 | Phase 22 | Pending |
| HARD-03 | Phase 22 | Pending |
| HARD-04 | Phase 22 | Pending |

**Coverage:**
- v1.3 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-05-11 (v1.3)*
*Carried over from prior milestones: BUYER-* (v1.2), VISP-* (v1.2)*
