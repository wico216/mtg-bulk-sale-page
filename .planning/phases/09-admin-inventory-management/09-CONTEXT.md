# Phase 9: Admin Inventory Management - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The seller can view, search, edit, and remove cards through an admin panel table, plus export the inventory as CSV. This replaces the placeholder `/admin` page with a fully functional inventory management interface. Bulk select/delete belongs in Phase 12. CSV import belongs in Phase 10. Order tracking belongs in Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Table Layout
- **D-01:** Sortable table with small card image thumbnails (~32-40px) in each row. Columns: image, name, set, price, condition, quantity, actions.
- **D-02:** Comfortable row density — medium spacing, standard text size. Not cramped spreadsheet, not spacious storefront.
- **D-03:** Paginated table (e.g., 50 cards per page) with page navigation. Not infinite scroll.
- **D-04:** Sortable columns: Name (A-Z), Price, and Quantity. Clicking column header toggles sort direction.
- **D-05:** Cards with quantity of 1 are visually highlighted as low stock in the table (color, badge, or row highlight — Claude's discretion on exact treatment).

### Inline Editing
- **D-06:** Click-to-edit on individual cells. Clicking a price, condition, or quantity cell turns it into an input field inline.
- **D-07:** Save on Enter key or blur (clicking away). No explicit save button needed — changes persist immediately with a brief success indicator.
- **D-08:** Condition field uses a dropdown select with fixed options: NM, LP, MP, HP, DMG. No free text.

### Admin Search & Filters
- **D-09:** Top bar above the table with search input and filter dropdowns. Always visible.
- **D-10:** Admin-specific filter controls — simple search input and native/custom dropdowns for set and condition. Do NOT reuse storefront filter components (mana pills, bottom sheets are browsing UX, not admin UX).
- **D-11:** Search filters cards by name. Set and condition dropdowns filter independently and in combination.

### CSV Export
- **D-12:** "Export CSV" button in the top-right of the filter/action bar, next to filter controls.
- **D-13:** Export always includes the full inventory regardless of current search/filter state.

### Delete Behavior
- **D-14:** Custom inline confirmation — clicking delete transforms the row to show "Delete [card name]?" with Confirm/Cancel buttons. No modal, no browser confirm dialog.

### Claude's Discretion
- Low stock highlight visual treatment (color, icon, badge — as long as qty=1 cards stand out)
- Exact pagination controls style and page size (50 is a guideline)
- Table responsive behavior on smaller screens
- Admin API route structure for CRUD operations
- Loading states and error handling for edit/delete operations
- Success/failure feedback indicators after inline edits
- Whether to use server actions or API routes for mutations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — INV-01, INV-02, INV-03, INV-05, INV-06 (admin inventory), CSV-03 (export)

### Prior phase decisions
- `.planning/phases/08-authentication/08-CONTEXT.md` — Admin layout (D-09, D-10), auth patterns (auth() + isAdminEmail()), API route auth (D-08)

### Existing admin code
- `src/app/admin/layout.tsx` — Admin shell layout with header, auth check, max-w-7xl container
- `src/app/admin/page.tsx` — Current placeholder page (to be replaced)
- `src/lib/auth/helpers.ts` — isAdminEmail() and auth helpers

### Card data model
- `src/lib/types.ts` — Card interface with all fields (name, setCode, price, condition, quantity, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Admin layout (`src/app/admin/layout.tsx`): Header with auth, max-w-7xl container — inventory page renders inside this
- Card type (`src/lib/types.ts`): Full Card interface with all fields needed for the table
- Auth helpers (`src/lib/auth/helpers.ts`): isAdminEmail() for page-level and API-level auth checks
- Existing API route pattern (`src/app/api/checkout/route.ts`): POST handler with validation — model for admin API routes

### Established Patterns
- React Server Components for pages — admin pages follow this pattern
- Tailwind CSS 4 with Geist font, dark/light mode, accent colors
- `auth()` + `isAdminEmail()` for admin access checks (Phase 8 convention)
- Admin API routes at `/api/admin/*` return JSON errors (401/403) per Phase 8 D-08

### Integration Points
- `/admin` page.tsx: Replace placeholder with inventory table
- `/api/admin/cards`: New CRUD endpoints for card operations (GET list, PATCH edit, DELETE)
- `/api/admin/export`: CSV export endpoint
- Database queries layer (depends on Phase 6/7 being complete — db queries for cards)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-admin-inventory-management*
*Context gathered: 2026-04-12*
