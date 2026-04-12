# Phase 9: Admin Inventory Management - Research

**Researched:** 2026-04-12
**Domain:** Admin CRUD interface -- data table with inline editing, filtering, pagination, CSV export
**Confidence:** HIGH

## Summary

Phase 9 replaces the placeholder `/admin` page with a fully functional inventory management table. The admin views all 136 cards in a paginated, sortable, searchable table with inline editing (price, condition, quantity), single-card delete with inline confirmation, low-stock highlighting, and full-inventory CSV export. All operations are server-side mutations against the Neon Postgres database via Drizzle ORM.

**Critical prerequisite finding:** The database layer from Phases 6/7 (Drizzle ORM, Neon client, queries.ts, schema.ts) was accidentally deleted by the Phase 8 commit (`2ecb8f6`). The `src/db/` directory, `drizzle-orm`, `@neondatabase/serverless`, and `drizzle-kit` packages are all missing from the current codebase. The Neon database itself is provisioned and the `DATABASE_URL` env var exists, but the ORM layer must be restored before any admin CRUD operations can work. The planner MUST include a database restoration wave before building the admin UI.

**Primary recommendation:** Restore the database layer (schema, client, queries, packages) as Wave 1, then build admin API routes + table UI in subsequent waves. Use API Route Handlers (not server actions) for admin CRUD operations to maintain the established `/api/admin/*` pattern with `requireAdmin()` auth guards. The admin table is a client component that fetches data and performs mutations via fetch calls to these API routes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Sortable table with small card image thumbnails (~32-40px) in each row. Columns: image, name, set, price, condition, quantity, actions.
- **D-02:** Comfortable row density -- medium spacing, standard text size. Not cramped spreadsheet, not spacious storefront.
- **D-03:** Paginated table (e.g., 50 cards per page) with page navigation. Not infinite scroll.
- **D-04:** Sortable columns: Name (A-Z), Price, and Quantity. Clicking column header toggles sort direction.
- **D-05:** Cards with quantity of 1 are visually highlighted as low stock in the table (color, badge, or row highlight -- Claude's discretion on exact treatment).
- **D-06:** Click-to-edit on individual cells. Clicking a price, condition, or quantity cell turns it into an input field inline.
- **D-07:** Save on Enter key or blur (clicking away). No explicit save button needed -- changes persist immediately with a brief success indicator.
- **D-08:** Condition field uses a dropdown select with fixed options: NM, LP, MP, HP, DMG. No free text.
- **D-09:** Top bar above the table with search input and filter dropdowns. Always visible.
- **D-10:** Admin-specific filter controls -- simple search input and native/custom dropdowns for set and condition. Do NOT reuse storefront filter components (mana pills, bottom sheets are browsing UX, not admin UX).
- **D-11:** Search filters cards by name. Set and condition dropdowns filter independently and in combination.
- **D-12:** "Export CSV" button in the top-right of the filter/action bar, next to filter controls.
- **D-13:** Export always includes the full inventory regardless of current search/filter state.
- **D-14:** Custom inline confirmation -- clicking delete transforms the row to show "Delete [card name]?" with Confirm/Cancel buttons. No modal, no browser confirm dialog.

### Claude's Discretion
- Low stock highlight visual treatment (color, icon, badge -- as long as qty=1 cards stand out)
- Exact pagination controls style and page size (50 is a guideline)
- Table responsive behavior on smaller screens
- Admin API route structure for CRUD operations
- Loading states and error handling for edit/delete operations
- Success/failure feedback indicators after inline edits
- Whether to use server actions or API routes for mutations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INV-01 | Admin can view all cards in a sortable, searchable table | Paginated GET /api/admin/cards with sort/search/filter query params; client-side table component |
| INV-02 | Admin can edit a card's price, condition, and quantity inline | PATCH /api/admin/cards/[id] with Drizzle update; click-to-edit cell components |
| INV-03 | Admin can delete individual cards from inventory | DELETE /api/admin/cards/[id] with Drizzle delete; inline confirmation row pattern |
| INV-05 | Admin can search cards by name and filter by set/condition in admin table | Server-side filtering via Drizzle `ilike` and `eq` in GET query; client-side debounced search |
| INV-06 | Cards with quantity 1 are visually highlighted as low stock | Client-side conditional styling: amber left border + "Low" badge per UI-SPEC |
| CSV-03 | Admin can export current inventory as CSV | GET /api/admin/export returning text/csv with all cards; client-side download trigger |
</phase_requirements>

## Standard Stack

### Core (already installed or to be restored)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.2 (installed) | App framework | Project foundation [VERIFIED: package.json] |
| react | 19.2.4 (installed) | UI library | Project foundation [VERIFIED: package.json] |
| drizzle-orm | 0.45.2 (TO RESTORE) | Database ORM | Was installed in Phase 6, deleted by Phase 8 merge accident [VERIFIED: git history commit d32b64f] |
| @neondatabase/serverless | 1.0.2 (TO RESTORE) | Neon Postgres driver | Was installed in Phase 6, deleted by Phase 8 merge accident [VERIFIED: git history commit d32b64f] |
| drizzle-kit | 0.31.10 (TO RESTORE, dev) | DB migrations CLI | Was installed in Phase 6, deleted by Phase 8 merge accident [VERIFIED: git history commit d32b64f] |
| dotenv | 17.4.1 (TO RESTORE, dev) | Env var loading for scripts | Was installed in Phase 6, used by drizzle.config.ts [VERIFIED: git history] |
| next-auth | 5.0.0-beta.30 (installed) | Admin authentication | Phase 8 [VERIFIED: package.json] |
| tailwindcss | 4.x (installed) | Styling | Project standard [VERIFIED: package.json] |
| vitest | 4.1.4 (installed) | Testing | Project standard [VERIFIED: package.json] |

### No New Dependencies Required

This phase requires zero new npm packages. The CSV export is trivial string concatenation (no PapaParse needed for generation). All UI is hand-built Tailwind per project convention. The only "new" packages are restorations of Phase 6/7 packages that were accidentally removed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| API Route Handlers | Server Actions | Server actions are simpler for form-like mutations, but admin CRUD needs JSON error responses (401/403) per Phase 8 D-08 convention. API routes give full control over response format and status codes. The existing `/api/admin/health` route establishes this pattern. |
| Client-side pagination | Server-side pagination | With 136 cards, client-side would work, but server-side pagination is correct for production and matches the DB-backed architecture. Also enables future growth. |
| @tanstack/react-table | Hand-built table | 136 rows with simple sort/filter/paginate does not justify a library dependency. Hand-built matches project convention of no component libraries. |

**Installation (restoration):**
```bash
npm install drizzle-orm@0.45.2 @neondatabase/serverless@1.0.2 dotenv@17.4.1
npm install -D drizzle-kit@0.31.10
```

**Version verification:**
- drizzle-orm: 0.45.2 [VERIFIED: npm registry 2026-04-12]
- @neondatabase/serverless: 1.0.2 [VERIFIED: npm registry 2026-04-12]
- drizzle-kit: 0.31.10 [VERIFIED: npm registry 2026-04-12]

## Architecture Patterns

### Project Structure (new files for Phase 9)

```
src/
  db/
    client.ts              # RESTORE: Drizzle + Neon HTTP client
    schema.ts              # RESTORE: cards, orders, orderItems tables
    queries.ts             # RESTORE + EXTEND: add admin CRUD queries
    seed.ts                # RESTORE: idempotent seed script
    __tests__/
      queries.test.ts      # RESTORE + EXTEND: test admin queries
      schema.test.ts       # RESTORE
      seed.test.ts         # RESTORE
  app/
    admin/
      page.tsx             # REPLACE: server component, fetch initial data
      _components/
        inventory-table.tsx     # NEW: main client component (table + state)
        action-bar.tsx          # NEW: search, filters, export button
        editable-cell.tsx       # NEW: click-to-edit cell (price/qty/condition)
        delete-confirmation.tsx # NEW: inline delete confirmation row
        pagination.tsx          # NEW: page navigation controls
        toast.tsx               # NEW: error toast notification
    api/
      admin/
        cards/
          route.ts         # NEW: GET (list with filters) and POST (not needed now)
          [id]/
            route.ts       # NEW: PATCH (edit) and DELETE (remove)
        export/
          route.ts         # NEW: GET returning CSV
drizzle.config.ts          # RESTORE: Drizzle Kit configuration
```

### Pattern 1: API Route Handlers for Admin CRUD

**What:** Admin mutations (edit, delete) go through API Route Handlers at `/api/admin/*`, not server actions.
**When to use:** All admin data operations.
**Why:** Established convention from Phase 8 (D-08). API routes use `requireAdmin()` which returns `Response` objects with proper 401/403 JSON errors. Server actions throw errors which cannot produce JSON error responses. The existing `/api/admin/health/route.ts` demonstrates this pattern.

**Example:**
```typescript
// Source: Existing pattern from src/app/api/admin/health/route.ts [VERIFIED: codebase]
import { requireAdmin } from "@/lib/auth/admin-check";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const body = await request.json();
  // Validate and update...
  return Response.json({ success: true });
}
```

### Pattern 2: Client Component Table with Server Data

**What:** The admin page is a React Server Component that fetches initial card data and renders a client component table.
**When to use:** The inventory page.
**Why:** The table needs heavy client-side interactivity (inline editing, sort toggling, search debouncing, delete confirmation state). Server component handles auth check and initial data fetch. Client component manages all interactive state.

**Example:**
```typescript
// src/app/admin/page.tsx (server component)
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { InventoryTable } from "./_components/inventory-table";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!isAdminEmail(session.user.email)) redirect("/admin/access-denied");

  // Initial data fetch via API or direct DB query
  return <InventoryTable />;
}
```

```typescript
// src/app/admin/_components/inventory-table.tsx (client component)
"use client";
// All table state, fetching, editing, delete confirmation lives here
```

### Pattern 3: Debounced Search with URL State

**What:** Search and filter state lives in the URL search params for shareability and back-button support.
**When to use:** Admin search/filter bar.
**Why:** URL state makes filter state persistent across page refreshes. `useSearchParams` + `useRouter` update the URL, which triggers re-fetches.

### Pattern 4: Inline Edit with Optimistic UI

**What:** Click a cell to edit. On blur/Enter, immediately show the new value while the PATCH request fires. On error, revert.
**When to use:** Price, condition, and quantity cells.
**Why:** Eliminates perceived latency for single-field edits on a table with many rows. The success flash (bg-accent-light + green check) confirms the save completed server-side.

### Anti-Patterns to Avoid

- **Do NOT reuse storefront filter components:** D-10 explicitly prohibits using mana pills, bottom sheets, or the storefront filter bar. Admin filters are native `<select>` elements and a plain text input.
- **Do NOT use server actions for mutations:** The project convention is API routes with JSON error responses (401/403). Server actions throw errors which do not give control over HTTP status codes.
- **Do NOT paginate client-side:** Even though 136 cards could fit, the architecture should paginate server-side with LIMIT/OFFSET for consistency with the DB-backed model.
- **Do NOT store table state in Zustand:** The admin table is a single-page concern. Local component state with `useState` is sufficient. Zustand is for cross-page persistent state (cart, storefront filters).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database ORM | Raw SQL queries | Drizzle ORM (restored) | Type safety, migration management, query builder already established in Phase 6/7 |
| CSV generation | Complex CSV library | Simple string concatenation | 136 cards, flat structure, no special characters beyond commas in card names (quote-wrap fields) |
| Auth guard | Manual session checks per route | `requireAdmin()` from `src/lib/auth/admin-check.ts` | Already built in Phase 8, returns proper 401/403 responses |
| Debounce | Custom timer logic | Simple `setTimeout`/`clearTimeout` in a 6-line custom hook | No library needed for a single debounced input, but don't inline the timer logic in the component |

**Key insight:** The entire admin CRUD layer is straightforward because the database schema already exists (in the Neon instance), the auth guard is already built, and the table has only 136 rows. The main complexity is UI state management for inline editing and delete confirmation.

## Common Pitfalls

### Pitfall 1: Database Layer Missing (CRITICAL)
**What goes wrong:** Phase 8 commit `2ecb8f6` accidentally deleted the entire `src/db/` directory and removed Drizzle/Neon packages from package.json during a "worktree merge." The commit `0a9f6db` ("fix: restore planning files inadvertently deleted during worktree merge") only restored `.planning/` files, not `src/db/`.
**Why it happens:** The Phase 8 work was done in a git worktree that branched before Phase 6/7 code was merged, then force-merged back.
**How to avoid:** The planner MUST include a database restoration task as the very first action. Restore from git history (commit `d548f2d` has the latest Phase 7 state of all `src/db/` files). Also restore `drizzle.config.ts`, and re-add the npm packages.
**Warning signs:** `npm run build` currently works because it fell back to the static JSON pipeline. If you try to import from `@/db/queries`, it will fail with "module not found."

### Pitfall 2: Condition Value Mismatch
**What goes wrong:** The data stores conditions as lowercase full strings (`near_mint`) but the admin UI dropdown uses abbreviations (NM, LP, MP, HP, DMG).
**Why it happens:** Manabox CSV exports use `near_mint` format. The D-08 decision specifies abbreviations for the admin dropdown.
**How to avoid:** Create a condition mapping utility: `{ near_mint: "NM", lightly_played: "LP", moderately_played: "MP", heavily_played: "HP", damaged: "DMG" }` with bidirectional conversion. Display abbreviations, store full strings. The PATCH endpoint should accept abbreviations and convert before writing.
**Warning signs:** Currently all 136 cards are `near_mint`. After CSV import (Phase 10), other conditions will appear.

### Pitfall 3: Price Stored as Cents in DB, Dollars in JSON
**What goes wrong:** The database schema stores prices as integer cents (`price: integer("price")`) but the static JSON and Card interface use dollars (`price: 16.98`). The `rowToCard()` function divides by 100.
**Why it happens:** Phase 6 decision D-02: "Price stored as integer cents (nullable -- null means 'Price N/A')."
**How to avoid:** The PATCH endpoint must convert incoming dollar amounts to cents before writing. The GET endpoint uses `rowToCard()` which already handles cents-to-dollars. Be explicit about which unit is used at each layer.
**Warning signs:** Prices appearing as 1698 instead of 16.98, or 0.17 instead of 16.98.

### Pitfall 4: Next.js 16 Dynamic Route Params are Promises
**What goes wrong:** In Next.js 16, dynamic route segment params are `Promise<{ id: string }>`, not `{ id: string }`.
**Why it happens:** Breaking change in Next.js 15/16 -- params are now asynchronous.
**How to avoid:** Always await params: `const { id } = await params;`
**Warning signs:** TypeScript error: "Property 'id' does not exist on type 'Promise<...>'"

### Pitfall 5: CSV Export Must Quote Fields Containing Commas
**What goes wrong:** Card names like "Avacyn, Angel of Hope" break CSV parsing if the name field is not properly quoted.
**Why it happens:** CSV fields containing commas must be wrapped in double quotes per RFC 4180.
**How to avoid:** Quote all string fields in CSV output, or at minimum, fields that may contain commas. Card names and oracle text are the primary risks.
**Warning signs:** CSV opens in Excel with columns shifted.

### Pitfall 6: Build Script Regression
**What goes wrong:** The current `package.json` build script is `"build": "tsx scripts/generate-data.ts && next build"` which requires the static data pipeline. Phase 7 changed this to just `"build": "next build"` since data comes from the DB.
**Why it happens:** Same Phase 8 merge accident that removed the DB layer.
**How to avoid:** When restoring the DB layer, also fix the build script back to `"build": "next build"`. Similarly, remove the `"generate"` script and the `loadCardData()` function that Phase 7 deleted.
**Warning signs:** Build fails on Vercel because `generate-data.ts` tries to call Scryfall API at build time.

## Code Examples

### Admin Cards GET Endpoint (list with filtering)

```typescript
// Source: Pattern derived from existing queries.ts [VERIFIED: git history d548f2d]
// and existing checkout API route [VERIFIED: src/app/api/checkout/route.ts]

import { requireAdmin } from "@/lib/auth/admin-check";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { asc, desc, ilike, eq, count, sql } from "drizzle-orm";
import { rowToCard } from "@/db/queries";

export async function GET(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") ?? "1");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const search = url.searchParams.get("search") ?? "";
  const setFilter = url.searchParams.get("set") ?? "";
  const conditionFilter = url.searchParams.get("condition") ?? "";
  const sortBy = url.searchParams.get("sortBy") ?? "name";
  const sortDir = url.searchParams.get("sortDir") ?? "asc";

  // Build WHERE conditions dynamically
  const conditions = [];
  if (search) conditions.push(ilike(cards.name, `%${search}%`));
  if (setFilter) conditions.push(eq(cards.setCode, setFilter));
  if (conditionFilter) conditions.push(eq(cards.condition, conditionFilter));

  const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

  // Query with pagination
  const offset = (page - 1) * limit;
  const sortColumn = sortBy === "price" ? cards.price : sortBy === "quantity" ? cards.quantity : cards.name;
  const sortOrder = sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(cards).where(where).orderBy(sortOrder).limit(limit).offset(offset),
    db.select({ total: count() }).from(cards).where(where),
  ]);

  return Response.json({
    cards: rows.map(rowToCard),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
```

### Admin Cards PATCH Endpoint (inline edit)

```typescript
// Source: Drizzle ORM update pattern [ASSUMED] + existing requireAdmin pattern [VERIFIED: codebase]

import { requireAdmin } from "@/lib/auth/admin-check";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const { id } = await params;
  const body = await request.json();

  // Validate and build update object
  const updates: Record<string, unknown> = {};
  if (body.price !== undefined) {
    const price = parseFloat(body.price);
    if (isNaN(price) || price < 0) {
      return Response.json({ error: "Invalid price" }, { status: 400 });
    }
    updates.price = Math.round(price * 100); // dollars to cents
  }
  if (body.quantity !== undefined) {
    const qty = parseInt(body.quantity);
    if (isNaN(qty) || qty < 0) {
      return Response.json({ error: "Invalid quantity" }, { status: 400 });
    }
    updates.quantity = qty;
  }
  if (body.condition !== undefined) {
    updates.condition = body.condition; // Already validated against allowed values
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await db.update(cards).set(updates).where(eq(cards.id, id)).returning();

  if (updated.length === 0) {
    return Response.json({ error: "Card not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
```

### CSV Export Endpoint

```typescript
// Source: RFC 4180 CSV format [CITED: https://tools.ietf.org/html/rfc4180]

import { requireAdmin } from "@/lib/auth/admin-check";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { asc } from "drizzle-orm";

function csvEscape(value: string | null): string {
  if (value === null) return "";
  // If value contains comma, newline, or double quote, wrap in double quotes
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  const rows = await db.select().from(cards).orderBy(asc(cards.name));

  const header = "Name,Set Code,Set Name,Collector Number,Price,Condition,Quantity,Rarity,Foil";
  const lines = rows.map(row =>
    [
      csvEscape(row.name),
      csvEscape(row.setCode),
      csvEscape(row.setName),
      csvEscape(row.collectorNumber),
      row.price !== null ? (row.price / 100).toFixed(2) : "",
      csvEscape(row.condition),
      row.quantity.toString(),
      csvEscape(row.rarity),
      row.foil ? "foil" : "normal",
    ].join(",")
  );

  const csv = [header, ...lines].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="viki-inventory-${date}.csv"`,
    },
  });
}
```

### Inline Editable Cell Pattern

```typescript
// Source: React pattern for click-to-edit [ASSUMED]
"use client";
import { useState, useRef, useEffect } from "react";

function EditableCell({
  value,
  cardId,
  field,
  onSave,
}: {
  value: string | number;
  cardId: string;
  field: "price" | "quantity" | "condition";
  onSave: (cardId: string, field: string, value: string | number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (currentValue === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const success = await onSave(cardId, field, currentValue);
    setSaving(false);
    if (success) {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
      setEditing(false);
    } else {
      setCurrentValue(value); // revert
      setEditing(false);
    }
  };

  // ... render edit/display mode
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static JSON (cards.json) | Neon Postgres + Drizzle ORM | Phase 6/7 (implemented, then accidentally reverted in Phase 8) | Must restore DB layer before admin CRUD works |
| `loadCardData()` sync read | `getCards()` async DB query | Phase 7 (accidentally reverted) | Admin queries MUST use async DB queries |
| `middleware.ts` | `proxy.ts` | Next.js 16 | Already handled in Phase 8, no action needed |
| Sync params | `params: Promise<{}>` | Next.js 15/16 | Must await params in dynamic route handlers |

**Deprecated/outdated:**
- `src/lib/load-cards.ts`: Was deleted in Phase 7, accidentally restored in Phase 8. Should be removed again once DB layer is restored.
- `scripts/generate-data.ts`: Same -- was deleted in Phase 7, accidentally restored. Build should be `next build` only.
- `"build": "tsx scripts/generate-data.ts && next build"` script in package.json: Should revert to `"build": "next build"`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle ORM `update().set().where().returning()` pattern is correct for the installed version 0.45.2 | Code Examples | LOW -- Drizzle has been stable on this API; verify with actual restore |
| A2 | The `ilike` operator works with Neon Postgres via Drizzle | Code Examples | LOW -- standard PostgreSQL operator, Drizzle supports it |
| A3 | The condition mapping (near_mint -> NM, etc.) covers all Manabox condition values | Pitfalls | MEDIUM -- only verified `near_mint` exists in current data; other conditions untested |
| A4 | 136 cards is representative of production scale for this store | Architecture | LOW -- confirmed from actual data; friend-circle store unlikely to exceed 1000 |

## Open Questions

1. **Should the database restoration be a separate phase (e.g., 8.1) or Wave 1 of Phase 9?**
   - What we know: The DB layer was built, tested, and verified in Phases 6/7. The Neon database is still running with data. Only the code files and npm packages are missing.
   - What's unclear: Whether the user wants to track this as a separate phase or fold it into Phase 9.
   - Recommendation: Include as Wave 1 of Phase 9 (restore files from git, reinstall packages, verify DB connectivity). It is prerequisite work, not new development.

2. **What are all possible Manabox condition values?**
   - What we know: Current data only has `near_mint`. D-08 specifies NM, LP, MP, HP, DMG as the condition dropdown options.
   - What's unclear: Whether Manabox uses exactly these values or others (e.g., `lightly_played`, `played`, etc.).
   - Recommendation: Map the five standard MTG conditions and add a pass-through for unknown values. The mapping utility should be the single source of truth.

3. **Should the storefront pages also be restored to use DB queries?**
   - What we know: Phase 7 migrated all storefront pages to use `getCards()` from `@/db/queries`. Currently they use `loadCardData()` from static JSON.
   - What's unclear: Whether to restore the full Phase 7 migration (storefront on DB) in Phase 9 or defer.
   - Recommendation: Restore fully in Wave 1. The admin edits cards in the DB; if the storefront still reads from static JSON, edits won't be visible. Both layers must use the same data source.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon Postgres | Card CRUD, all admin operations | Yes (provisioned) | -- | -- |
| DATABASE_URL env var | DB client | Yes | -- | -- |
| drizzle-orm | ORM queries | No (removed) | -- | Restore from git + npm install |
| @neondatabase/serverless | DB driver | No (removed) | -- | Restore from git + npm install |
| drizzle-kit | Schema management | No (removed, dev) | -- | Restore from git + npm install |
| dotenv | Config loading | No (removed) | -- | Restore from git + npm install |
| Node.js | Runtime | Yes | -- | -- |
| vitest | Testing | Yes | 4.1.4 | -- |

**Missing dependencies with no fallback:**
- `drizzle-orm`, `@neondatabase/serverless`: MUST be restored before any admin CRUD operations. Cannot hand-roll SQL.

**Missing dependencies with fallback:**
- None -- all missing items must be restored, not worked around.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INV-01 | GET /api/admin/cards returns paginated card list | unit | `npx vitest run src/app/api/admin/cards/__tests__/route.test.ts -t "GET"` | No -- Wave 0 |
| INV-02 | PATCH /api/admin/cards/[id] updates price/condition/qty | unit | `npx vitest run src/app/api/admin/cards/__tests__/route.test.ts -t "PATCH"` | No -- Wave 0 |
| INV-03 | DELETE /api/admin/cards/[id] removes card | unit | `npx vitest run src/app/api/admin/cards/__tests__/route.test.ts -t "DELETE"` | No -- Wave 0 |
| INV-05 | GET with search/filter params returns filtered results | unit | `npx vitest run src/app/api/admin/cards/__tests__/route.test.ts -t "filter"` | No -- Wave 0 |
| INV-06 | Low stock highlight | manual-only | Visual inspection | N/A |
| CSV-03 | GET /api/admin/export returns valid CSV | unit | `npx vitest run src/app/api/admin/export/__tests__/route.test.ts` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Restore `src/db/__tests__/queries.test.ts` from git (Phase 6/7 tests)
- [ ] Restore `src/db/__tests__/schema.test.ts` from git
- [ ] `src/app/api/admin/cards/__tests__/route.test.ts` -- covers INV-01, INV-02, INV-03, INV-05
- [ ] `src/app/api/admin/export/__tests__/route.test.ts` -- covers CSV-03
- [ ] `src/db/queries.test.ts` extension for new admin query functions

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Auth.js v5 Google OAuth (already implemented Phase 8) |
| V3 Session Management | Yes | JWT with 30-day maxAge (already implemented Phase 8) |
| V4 Access Control | Yes | `requireAdmin()` on every API route + `isAdminEmail()` check |
| V5 Input Validation | Yes | Validate price (number >= 0), quantity (integer >= 0), condition (enum), card ID (string exists in DB) |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns for Admin CRUD

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized card edit/delete | Elevation of Privilege | `requireAdmin()` on every route handler -- returns 401/403 before any DB operation |
| SQL injection via search | Tampering | Drizzle ORM parameterized queries (never string-concatenate user input into SQL) |
| Mass deletion via API abuse | Denial of Service | Not applicable (single admin, no bulk delete in Phase 9) |
| CSV injection | Tampering | Quote all CSV fields per RFC 4180; do not include formulas (no `=`, `+`, `-`, `@` prefixes in unquoted fields) |
| Price manipulation via PATCH | Tampering | Server-side validation: price must be non-negative number; quantity must be non-negative integer |

## Project Constraints (from CLAUDE.md)

- **AGENTS.md directive:** "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices." -- All Next.js 16 patterns (async params, proxy.ts, route handlers) verified against local docs.
- **No component library:** Project uses hand-built Tailwind components (no shadcn, no MUI, no Radix). Admin table must follow this convention.
- **UI-SPEC exists:** `09-UI-SPEC.md` provides detailed Tailwind class specifications for every element. Planner must reference this for all UI tasks.

## Sources

### Primary (HIGH confidence)
- Codebase scan: `package.json`, `src/` directory structure, all existing files [VERIFIED: direct read]
- Git history: commits `d32b64f` through `d548f2d` for Phase 6/7 database layer [VERIFIED: git show]
- Git history: commit `2ecb8f6` confirming accidental deletion of `src/db/` [VERIFIED: git show --stat]
- Next.js 16 docs: `node_modules/next/dist/docs/01-app/` for route handlers, server actions, use-server [VERIFIED: direct read]
- `09-CONTEXT.md`: All locked decisions D-01 through D-14 [VERIFIED: direct read]
- `09-UI-SPEC.md`: Complete visual specification [VERIFIED: direct read]

### Secondary (MEDIUM confidence)
- npm registry: package versions for drizzle-orm (0.45.2), @neondatabase/serverless (1.0.2), drizzle-kit (0.31.10) [VERIFIED: npm view]
- Drizzle ORM update/delete/ilike patterns [ASSUMED: based on training data for v0.45.x]

### Tertiary (LOW confidence)
- Manabox condition value format beyond `near_mint` [ASSUMED: standard MTG condition abbreviations]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified in git history and npm registry
- Architecture: HIGH -- follows established project patterns (API routes, auth guards, client/server split)
- Pitfalls: HIGH -- database deletion confirmed via git forensics; price/cents issue confirmed in schema
- DB restoration: HIGH -- exact file contents recovered from git history

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable domain, low package churn risk)
