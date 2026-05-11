# Phase 21: Admin Visibility & Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Mode:** Auto

---

## Inventory binder filter UX

| Option | Selected |
|--------|----------|
| Single-select dropdown above the table (matches existing Set/Condition filters) | ✓ |
| Multi-select chips | |
| Search-as-you-type | |

**Rationale:** Consistency with established admin filter pattern.

## [binder] annotation display style

| Option | Selected |
|--------|----------|
| Small gray pill `[A02]` matching existing condition pill style | ✓ |
| Inline plain text | |
| Tooltip on row hover | |

**Rationale:** Established pill pattern; visible without being loud.

## Audit page metadata rendering

| Option | Selected |
|--------|----------|
| Collapsed by default with "Show details" expander | ✓ |
| Always-expanded panel | |
| Custom panel layout per action type | |

**Rationale:** Audit page lists many entries; expanders prevent vertical bloat.

## Historical pre-v1.3 rows

| Option | Selected |
|--------|----------|
| Render as `[unsorted]` (explicit) | ✓ |
| Omit annotation entirely | |
| Italic note "(pre-v1.3 order)" | |

**Rationale:** Honest disclosure; operator gets the signal that old orders predate the binder system.

## Bulk-edit binder column (research P2 ADM-FUT-02)

| Option | Selected |
|--------|----------|
| Defer to v1.3.x | ✓ |
| Include in Phase 21 | |

**Rationale:** Allocator's smallest-first pick (Phase 18 D-01) passively consolidates over time; manual bulk-edit is nice-to-have, not v1.3-critical.

## Dashboard "By binder" breakdown tile (added in scope)

| Option | Selected |
|--------|----------|
| Include alongside existing By set / By color / By rarity tiles | ✓ |
| Defer | |

**Rationale:** ~50-line addition; directly supports chaos-sort fulfillment workflow; dovetails with the inventory binder column.
