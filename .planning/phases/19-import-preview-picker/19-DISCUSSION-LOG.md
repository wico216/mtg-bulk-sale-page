# Phase 19: Import Preview & Picker - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Phase:** 19-Import Preview & Picker
**Areas discussed:** Picker sort order, Row count display, NEW annotation, Will-delete panel visibility, Confirmation flow, Rename-at-upload
**Mode:** Auto (decisions made by Claude per auto-mode directive; no AskUserQuestion turns)

---

## Picker sort order

| Option | Selected |
|--------|----------|
| Alphabetical with NEW binders sorted to top | ✓ |
| Strictly alphabetical (no NEW priority) | |
| By row count descending (largest binders first) | |
| Operator-configurable | |

**Decision rationale:** NEW binders need attention; sorting them to top forces the operator's eye. Existing binders alphabetical for predictable scanning.

## Row count display

| Option | Selected |
|--------|----------|
| Full integer with thousands separator (`3,576`) | ✓ |
| Abbreviated (`3.5k`) | |
| Both (full on hover) | |

**Decision rationale:** Operator wants precision when deciding whether to include a 3,576-row binder; abbreviation hides decision-relevant info.

## NEW annotation

| Option | Selected |
|--------|----------|
| Small green pill `NEW` + sort-to-top | ✓ |
| Just sort-to-top, no badge | |
| Pulse animation on the row | |
| Background color change for the row | |

**Decision rationale:** Pill is the established Tailwind pattern in this codebase; combines with sort-to-top for double-emphasis.

## Will-delete panel visibility

| Option | Selected |
|--------|----------|
| Show only when `missingBinders.length > 0` | ✓ |
| Always show (empty state when none) | |
| Show but collapsed by default | |

**Decision rationale:** Empty state is noise; suppress when nothing to act on.

## Confirmation flow

| Option | Selected |
|--------|----------|
| Inline destructive confirmation (mirrors Phase 10 D-13 pattern with typed REPLACE) | ✓ |
| Separate modal with the same confirmation | |
| Two-stage: modal preview, then inline confirm | |

**Decision rationale:** Established Phase 10 pattern; reuses the operator's existing muscle memory ("type REPLACE"); avoids modal whiplash.

## Operator rename-at-upload

| Option | Selected |
|--------|----------|
| Defer; operator renames in Manabox if needed | ✓ |
| Add a text input next to each binder for custom rename | |
| Bulk rename pattern (find/replace) | |

**Decision rationale:** YAGNI; operator hasn't asked; adds complexity for unverified value.

## Claude's Discretion

- Tailwind class names for picker styling
- Sample card names UX (inline vs popover)
- Stage-2 endpoint shape (query param vs new route)
- Test approach (component vs E2E balance)
- Will-delete panel placement (above picker vs collapsible)

## Deferred Ideas

- Did-you-mean hint for binder name typos → v1.3.x
- Operator rename-at-upload → not in v1.3
- Save/load named selection presets → v1.4+
- Batch confirm without typed phrase → explicitly rejected
