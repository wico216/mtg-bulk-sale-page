# Phase 9: Admin Inventory Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 09-admin-inventory-management
**Areas discussed:** Table layout, Inline editing, Admin search & filters, CSV export & actions

---

## Table Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Small thumbnails | Tiny card image (32-40px) in each row — helps visually identify cards at a glance | ✓ |
| No images | Text-only table — denser, faster to scan, more spreadsheet-like | |
| Image on hover | No image in row, hovering shows tooltip/popover with card image | |

**User's choice:** Small thumbnails
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Compact | Tight rows, small text — see more cards at once | |
| Comfortable | Medium spacing, standard text size — balanced for desktop admin use | ✓ |
| Spacious | Generous padding, larger touch targets | |

**User's choice:** Comfortable
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Paginated | Classic page navigation (e.g., 50 per page). Standard for admin tables. | ✓ |
| Infinite scroll | Cards load as you scroll. Storefront uses this pattern. | |
| Load more button | Initial batch shown, click for next batch. | |

**User's choice:** Paginated
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Name (A-Z) | Sort alphabetically by card name | ✓ |
| Price | Sort by price ascending/descending | ✓ |
| Quantity | Sort by stock count — useful for finding low/high stock | ✓ |
| Set | Sort/group by set code | |

**User's choice:** Name, Price, Quantity (not Set)
**Notes:** None

---

## Inline Editing

| Option | Description | Selected |
|--------|-------------|----------|
| Click cell to edit | Click a cell and it becomes an input. Tab between cells. Save with Enter. | ✓ |
| Edit button per row | Click edit button to switch whole row into edit mode. | |
| Modal/drawer form | Click edit to open side panel or modal with form. | |

**User's choice:** Click cell to edit
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Save on Enter/blur | Pressing Enter or clicking away saves immediately. Brief success indicator. | ✓ |
| Row save button | Save/cancel buttons appear on the row after editing. | |
| You decide | Claude picks the best approach. | |

**User's choice:** Save on Enter/blur
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown | Fixed options: NM, LP, MP, HP, DMG. Prevents typos. | ✓ |
| Free text | Admin types any condition. More flexible but risks inconsistency. | |

**User's choice:** Dropdown (NM/LP/MP/HP/DMG)
**Notes:** None

---

## Admin Search & Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Top bar above table | Search + filter dropdowns in horizontal bar above table. Always visible. | ✓ |
| Inline with table header | Search and filters embedded in table header row. More compact. | |
| You decide | Claude picks the best layout. | |

**User's choice:** Top bar above table
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-specific controls | Simple dropdowns and search tailored for admin. Storefront components don't fit. | ✓ |
| Reuse storefront components | Share filter-bar, multi-select, etc. Consistent but includes mobile-specific patterns. | |

**User's choice:** Admin-specific controls
**Notes:** None

---

## CSV Export & Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Full inventory always | Export all cards regardless of filters. Simple button. | ✓ |
| Current filtered view | Export only what's shown after search/filter. | |
| Choice at export time | Dialog asks: export all or current view. | |

**User's choice:** Full inventory always
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Top right, next to filters | In the filter/action bar above the table. Always visible. | ✓ |
| Below table | At the bottom after all rows. Less prominent. | |

**User's choice:** Top right, next to filters
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Custom inline confirm | Row transforms to show "Delete [name]?" with Confirm/Cancel. No modal. | ✓ |
| Browser confirm dialog | window.confirm(). Zero custom UI. | |
| Custom modal dialog | Centered modal overlay with card details. | |

**User's choice:** Custom inline confirm
**Notes:** None

---

## Claude's Discretion

- Low stock visual treatment (color/icon/badge for qty=1)
- Exact pagination controls and page size
- Table responsive behavior
- Admin API route structure
- Loading/error states
- Success/failure feedback indicators
- Server actions vs API routes for mutations

## Deferred Ideas

None — discussion stayed within phase scope
