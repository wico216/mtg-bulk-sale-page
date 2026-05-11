# Phase 17: Parser & Etched - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Phase:** 17-Parser & Etched
**Areas discussed:** Etched literal verification (resolved early), Foil field backward compat, Zero-quantity row handling, Binder name display casing, Test fixture strategy
**Mode:** Auto (decisions made by Claude per auto-mode directive after multi-select)

---

## Etched literal verification (resolved during discuss prep)

| Option | Selected |
|--------|----------|
| Manabox emits literal `"etched"` in Foil column | ✓ (verified against `~/Downloads/ManaBox_Collection.csv` — 11 rows: Wrath of God, Cultist of the Absolute, Master Chef, Tor Wauki the Younger, Jasmine Boreal of the Seven, +6 more) |
| Manabox emits some other literal (e.g. `"Etched Foil"`) | (not applicable) |

**Resolution:** Research's MEDIUM-confidence flag is now HIGH-confidence. Parser test fixtures use the literal string `"etched"`.

---

## Foil field backward compat

| Option | Description | Selected |
|--------|-------------|----------|
| Rip it out cleanly | All `card.foil` consumers updated to `card.finish` in Phase 17. Phase 16 + 17 ship together. No deprecation shim. | ✓ |
| Keep `foil` as derived getter | `get foil() { return finish === 'foil' || finish === 'etched' }`. Permanent tech debt. | |
| One-release deprecation path | Add `foil` getter in v1.3, remove in v1.4. Migration cost spread but adds release coordination. | |

**Decision rationale (Claude, auto-mode):** Single-owner ~19,661 LOC codebase. All consumers under our control. Deprecation paths add permanent tech debt for no gain. Phase 17 sweeps everything; Phases 16 + 17 ship together.

---

## Zero-quantity row handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip with `SkippedRow.reason = 'zero quantity'` | Match Pitfall 15 research. Surface count in preview alongside existing skip reasons. | ✓ |
| Persist as 0-stock row | Keep visibility into empty slots; clutters storefront with unbuyable rows. | |
| Surface in preview but persist | Hybrid; adds complexity. | |

**Decision rationale (Claude, auto-mode):** A 0-stock row has no buyer-side purpose. Operators tracking empty slots in Manabox keep them there; they just don't sync to the store DB. Cleanest UX.

---

## Binder name display casing

| Option | Description | Selected |
|--------|-------------|----------|
| Store + display lowercase normalized | Canonical binder is `a02` (not `A02`); admin UI shows `a02` literally. Simplest. | ✓ |
| Store lowercase, display title-case | `bulk drawers` → display "Bulk Drawers" via `.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')`. Adds display layer. | |
| Add `binder_label` column for original casing | First-occurrence casing preserved as display field. Adds a column (violates Phase 16 D-09 "ONE new column anywhere" principle). | |

**Decision rationale (Claude, auto-mode):** KISS. If operator wants prettier display, they rename in Manabox to be presentation-ready. Adding a display-label column or display-time transformation adds permanent surface area for no real win.

---

## Test fixture strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-crafted small CSVs only | 6-8 fixtures in `src/lib/__tests__/fixtures/` covering: etched, multi-binder same card, non-binder skip, name normalization, zero quantity, multilingual binder, mixed Foil values, legacy no-binder-columns CSV. | ✓ |
| Real 12,749-row CSV checked in | 2MB file; gives scale + diversity. Privacy concern (operator's binder labels include personal Spanish names). | |
| Both — hand-crafted unit + real integration | Most coverage. Privacy concern same as above. | |

**Decision rationale (Claude, auto-mode):** Hand-crafted gives clear test intent — each fixture proves one specific behavior. Real file's privacy issue (operator's "compré titán" binder name) outweighs scale-test value. Real file stays in operator's Downloads for manual one-off smoke after Phase 17 implementation.

---

## Claude's Discretion

- Exact file location for test fixtures (planner verifies existing convention)
- Whether to inline `normalizeBinderName` helper or export from a shared module (likely the latter; Phase 19 picker UI also needs it)
- Etched badge CSS classes (suggestion: `bg-purple-200 text-purple-900`)

## Deferred Ideas

- Did-you-mean hint at import time for binder name typos → v1.3.x (research P2 differentiator IMP-FUT-01)
- Backward-compat `foil` derived getter → explicitly rejected per D-07
- Real 12,749-row file as checked-in fixture → privacy concern; rejected per D-11
- Binder name "display label" column for preserving original casing → rejected; lowercase canonical is both stored AND displayed
