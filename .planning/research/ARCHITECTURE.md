# Architecture Research

**Domain:** Admin panel & inventory management for existing MTG card store
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against Next.js 16 docs, current ecosystem status)

## System Overview

This milestone evolves the existing static-JSON architecture into a hybrid: the storefront reads from a database instead of a JSON file, and a new admin panel provides authenticated CRUD for inventory and order tracking.

```
                           EXISTING (keep)                        NEW (add)
                    +---------------------------+         +---------------------------+
                    |       Public Storefront    |         |       Admin Panel         |
                    |                            |         |                           |
                    |  / (catalog)               |         |  /admin (dashboard)       |
                    |  /cart                      |         |  /admin/inventory         |
                    |  /checkout                  |         |  /admin/orders            |
                    |  /confirmation              |         |  /admin/import            |
                    |                            |         |                           |
                    +-------------+--------------+         +-----------+---------------+
                                  |                                    |
                                  |  reads cards                       |  CRUD cards/orders
                                  |                                    |  CSV import
                                  v                                    v
                    +-------------------------------------------------------+
                    |                    Data Access Layer                    |
                    |                   src/lib/db/                           |
                    |  queries.ts (read) | mutations.ts (write) | schema.ts  |
                    +---------------------------+---------------------------+
                                                |
                                                v
                    +-------------------------------------------------------+
                    |             Neon Postgres (via Drizzle ORM)             |
                    |                                                         |
                    |  cards table  |  orders table  |  order_items table     |
                    +-------------------------------------------------------+

    Auth boundary: proxy.ts redirects /admin/* to /auth/login if no session
    Auth flow: GitHub OAuth via Auth.js v5 -> session cookie
```

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| Public storefront pages | Browse, search, filter, cart, checkout | **MODIFY** -- read from DB instead of JSON |
| `loadCardData()` | Load card data for storefront | **REPLACE** -- swap JSON read for DB query |
| `/api/checkout` route | Validate order, send emails | **MODIFY** -- add stock decrement + order storage |
| Zustand cart store | Client-side cart state | **KEEP** -- no changes needed |
| Filter store | Client-side search/filter state | **KEEP** -- no changes needed |
| Email templates | Render order HTML | **KEEP** -- no changes needed |
| `proxy.ts` | Route protection for /admin/* | **NEW** |
| Auth.js config | GitHub OAuth, session management | **NEW** |
| Admin dashboard page | Inventory stats overview | **NEW** |
| Admin inventory page | Card CRUD, bulk operations | **NEW** |
| Admin orders page | Order history list | **NEW** |
| Admin import page | CSV upload + processing | **NEW** |
| Data access layer | DB queries and mutations via Drizzle | **NEW** |
| Database schema | Cards, orders, order_items tables | **NEW** |
| Auth login page | GitHub OAuth login button | **NEW** |

## Migration Path: Static JSON to Database

The migration has a clean boundary. Currently, all card data flows through one function: `loadCardData()` in `src/lib/load-cards.ts`. This function reads `data/generated/cards.json` from disk. Every consumer (the home page, checkout page, and checkout API route) calls this function.

### Step 1: Create the database schema and connection

Set up Drizzle ORM with Neon Postgres. Define tables that mirror the existing `Card` interface.

### Step 2: Build the data access layer

Create `src/lib/db/queries.ts` with a `getAllCards()` function that returns the same `Card[]` shape. Create `src/lib/db/mutations.ts` for write operations.

### Step 3: Swap `loadCardData()` for database queries

Replace the file-system read with a database query. Because the return type stays the same (`Card[]`), downstream components (CardGrid, filter store, checkout) require zero changes.

```
BEFORE:  page.tsx -> loadCardData() -> readFileSync("cards.json") -> Card[]
AFTER:   page.tsx -> getAllCards()   -> db.select().from(cards)    -> Card[]
```

### Step 4: Migrate the CSV import to write to the database

The existing `scripts/generate-data.ts` pipeline (CSV parse -> Scryfall enrich -> write JSON) becomes an admin action that writes to the database instead of a JSON file. The parse and enrichment logic is reused.

### Step 5: Remove the build-time generate step

Once the database is the source of truth, `npm run generate` and the `data/generated/` directory are no longer needed. The build script in `package.json` simplifies from `tsx scripts/generate-data.ts && next build` to just `next build`.

## Recommended Project Structure

New and modified files are marked. Existing unchanged files are omitted.

```
src/
  app/
    page.tsx                          # MODIFY: call getAllCards() instead of loadCardData()
    checkout/
      page.tsx                        # MODIFY: call getAllCards() instead of loadCardData()
    api/
      checkout/
        route.ts                      # MODIFY: add stock decrement + order insert
      admin/
        cards/
          route.ts                    # NEW: GET (list), POST (create)
          [id]/
            route.ts                  # NEW: PATCH (update), DELETE (remove)
        cards/bulk-delete/
          route.ts                    # NEW: POST (bulk delete card IDs)
        import/
          route.ts                    # NEW: POST (CSV upload + process)
        orders/
          route.ts                    # NEW: GET (list orders)
        stats/
          route.ts                    # NEW: GET (inventory stats)
    admin/
      layout.tsx                      # NEW: admin shell (sidebar nav, auth check)
      page.tsx                        # NEW: dashboard with stats
      inventory/
        page.tsx                      # NEW: card list with edit/delete
      orders/
        page.tsx                      # NEW: order history table
      import/
        page.tsx                      # NEW: CSV upload form
    auth/
      login/
        page.tsx                      # NEW: GitHub login button
      [...nextauth]/                  # NOTE: Auth.js v5 uses route handler, see below
  components/
    admin/
      card-table.tsx                  # NEW: data table for inventory management
      card-edit-form.tsx              # NEW: inline or modal card editing
      csv-upload.tsx                  # NEW: file upload component
      stats-cards.tsx                 # NEW: dashboard stat cards
      order-table.tsx                 # NEW: order history table
      admin-sidebar.tsx               # NEW: admin navigation sidebar
  lib/
    db/
      index.ts                        # NEW: Drizzle client + Neon connection
      schema.ts                       # NEW: table definitions
      queries.ts                      # NEW: read operations (getAllCards, getOrders, getStats)
      mutations.ts                    # NEW: write operations (upsertCards, deleteCards, insertOrder, decrementStock)
    auth.ts                           # NEW: Auth.js v5 config (GitHub provider)
    load-cards.ts                     # DELETE: replaced by db/queries.ts
    csv-parser.ts                     # KEEP: reused for admin CSV import
    enrichment.ts                     # KEEP: reused for admin CSV import
    scryfall.ts                       # KEEP: reused for enrichment
    cache.ts                          # KEEP: reused for Scryfall cache during import

src/proxy.ts                          # NEW: auth check for /admin/* routes
drizzle.config.ts                     # NEW: Drizzle Kit configuration
```

### Structure Rationale

- **`lib/db/`:** All database concerns in one directory. Schema, queries (reads), and mutations (writes) are separate files because reads are used by both storefront and admin while writes are admin-only.
- **`app/admin/`:** Route group for admin pages. Gets its own layout with sidebar navigation.
- **`app/api/admin/`:** API routes for admin operations. These are separate from the public `/api/checkout` endpoint.
- **`components/admin/`:** Admin-specific components. Keeps the public storefront components clean.
- **`proxy.ts`:** At project root (or `src/` root). Handles auth redirect for all `/admin/*` paths.

## Architectural Patterns

### Pattern 1: Data Access Layer Abstraction

**What:** All database operations go through `src/lib/db/queries.ts` and `src/lib/db/mutations.ts`. No raw SQL or Drizzle calls in page components or API routes.
**When to use:** Every database interaction.
**Trade-offs:** Adds a layer of indirection, but the Card type contract stays stable. If the database provider changes, only the DAL changes.

```typescript
// src/lib/db/queries.ts
import { db } from "./index";
import { cards } from "./schema";
import type { Card } from "@/lib/types";

export async function getAllCards(): Promise<Card[]> {
  const rows = await db.select().from(cards).orderBy(cards.name);
  return rows.map(rowToCard); // transform DB row to Card interface
}
```

### Pattern 2: Auth.js v5 Universal `auth()` Function

**What:** Auth.js v5 exports a single `auth()` function that works in server components, route handlers, and server actions. Use it everywhere instead of checking sessions differently in each context.
**When to use:** Every admin page and admin API route.
**Trade-offs:** Simple API. One function to learn. The proxy.ts handles the redirect, but `auth()` should also be checked inside server actions and API routes as defense-in-depth.

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    authorized({ auth }) {
      // Only allow the configured admin GitHub user
      return auth?.user?.email === process.env.ADMIN_EMAIL;
    },
  },
});
```

### Pattern 3: Transactional Checkout (Decrement + Insert)

**What:** The checkout API route wraps stock decrement and order insertion in a single database transaction.
**When to use:** Every checkout submission.
**Trade-offs:** Prevents partial writes (order stored but stock not decremented, or vice versa). Neon supports transactions via the WebSocket driver.

```typescript
// In /api/checkout/route.ts
import { db } from "@/lib/db";
import { cards, orders, orderItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

await db.transaction(async (tx) => {
  // Insert order
  const [order] = await tx.insert(orders).values({ ... }).returning();

  // Insert order items + decrement stock
  for (const item of validatedItems) {
    await tx.insert(orderItems).values({ orderId: order.id, ... });
    await tx
      .update(cards)
      .set({ quantity: sql`${cards.quantity} - ${item.quantity}` })
      .where(eq(cards.id, item.cardId));
  }
});
```

### Pattern 4: CSV Import as Full Replace

**What:** CSV import deletes all existing cards and inserts the new set. This matches the current mental model where a Manabox export is the complete source of truth.
**When to use:** Admin CSV import.
**Trade-offs:** Simple and predictable. Downside: any manual edits made to individual cards are wiped on re-import. This is acceptable because the admin can edit cards individually for small changes, and the CSV import is for bulk refresh.

### Pattern 5: Admin Layout with Auth Gate

**What:** The admin route group (`/admin/*`) has its own layout that checks auth and renders a sidebar. If not authenticated, the proxy.ts redirects to `/auth/login`.
**When to use:** All admin pages.
**Trade-offs:** Two layers of protection -- proxy.ts for fast redirect, layout-level auth check for defense-in-depth.

```typescript
// src/app/admin/layout.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

## Data Flow

### Storefront Read Flow (modified)

```
User visits /
    |
    v
page.tsx (server component)
    |
    v
getAllCards()  -- src/lib/db/queries.ts
    |
    v
Drizzle ORM SELECT * FROM cards
    |
    v
Neon Postgres (HTTP driver, single query)
    |
    v
Card[] returned to page.tsx
    |
    v
Passed as props to <CardGrid cards={data} />
    |
    v
Client-side filter store handles search/filter/sort (unchanged)
```

### Checkout Flow (modified)

```
User submits checkout form
    |
    v
POST /api/checkout  { buyerName, buyerEmail, items }
    |
    v
1. Validate inputs (existing logic, unchanged)
    |
    v
2. Load cards from DB (replaces loadCardData())
    |
    v
3. Validate stock against DB quantities
    |
    v
4. BEGIN TRANSACTION
   |-- Insert order row
   |-- Insert order_item rows
   |-- Decrement card quantities
   COMMIT
    |
    v
5. Build order data (existing buildOrderData(), unchanged)
    |
    v
6. Send emails via Resend (existing notifyOrder(), unchanged)
    |
    v
7. Return CheckoutResponse (unchanged)
```

### Admin CSV Import Flow (new)

```
Admin uploads CSV file on /admin/import
    |
    v
Client sends FormData to POST /api/admin/import
    |
    v
1. Auth check (verify session)
    |
    v
2. Parse CSV using existing parseAllCsvFiles() logic
   (adapted for in-memory buffer instead of file path)
    |
    v
3. Enrich with Scryfall using existing enrichCards()
   (sequential, rate-limited, with cache)
    |
    v
4. BEGIN TRANSACTION
   |-- DELETE all existing cards
   |-- INSERT new enriched cards
   COMMIT
    |
    v
5. Return { inserted: N, skipped: M }
```

### Auth Flow (new)

```
User visits /admin/*
    |
    v
proxy.ts checks for session cookie
    |
    +-- No session --> redirect to /auth/login
    |
    +-- Has session --> NextResponse.next()
         |
         v
    Admin layout checks auth() again
         |
         +-- Invalid/expired --> redirect to /auth/login
         |
         +-- Valid session --> render admin page
              |
              v
         Admin email matches ADMIN_EMAIL env var? --> render content
         Otherwise --> show "Unauthorized" message
```

## Database Schema

```
cards
  id              TEXT PRIMARY KEY    -- composite: setCode-collectorNumber-foil-condition
  name            TEXT NOT NULL
  set_code        TEXT NOT NULL
  set_name        TEXT NOT NULL
  collector_number TEXT NOT NULL
  price           REAL               -- nullable, null = "Price N/A"
  condition       TEXT NOT NULL
  quantity        INTEGER NOT NULL DEFAULT 0
  color_identity  TEXT[]              -- Postgres array: {"G"}, {"W","U"}
  image_url       TEXT
  oracle_text     TEXT
  rarity          TEXT NOT NULL
  foil            BOOLEAN NOT NULL DEFAULT false
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()

orders
  id              SERIAL PRIMARY KEY
  order_ref       TEXT NOT NULL UNIQUE  -- e.g. ORD-20260411-1430
  buyer_name      TEXT NOT NULL
  buyer_email     TEXT NOT NULL
  message         TEXT
  total_items     INTEGER NOT NULL
  total_price     REAL NOT NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

order_items
  id              SERIAL PRIMARY KEY
  order_id        INTEGER NOT NULL REFERENCES orders(id)
  card_id         TEXT NOT NULL        -- references cards.id at time of order
  card_name       TEXT NOT NULL        -- denormalized for history
  set_name        TEXT NOT NULL        -- denormalized
  set_code        TEXT NOT NULL        -- denormalized
  collector_number TEXT NOT NULL       -- denormalized
  condition       TEXT NOT NULL        -- denormalized
  price           REAL                 -- price at time of order
  quantity        INTEGER NOT NULL
  line_total      REAL                 -- price * quantity at time of order
```

**Why denormalize order_items:** Orders are historical records. If a card is deleted or re-imported with a different price, past order data must remain accurate. Denormalizing card details into order_items ensures this.

## Integration Points

### Existing Code That Changes

| File | What Changes | Why |
|------|-------------|-----|
| `src/app/page.tsx` | Replace `loadCardData()` call with `getAllCards()` | DB is now source of truth |
| `src/app/checkout/page.tsx` | Replace `loadCardData()` call with `getAllCards()` | Same reason |
| `src/app/api/checkout/route.ts` | Add transaction: decrement stock + insert order | Auto-decrement and order tracking |
| `package.json` | Remove `generate` from `build` script, add drizzle deps | No more build-time JSON generation |

### Existing Code That Does NOT Change

| File | Why Unchanged |
|------|--------------|
| `src/lib/store/cart-store.ts` | Cart is client-side, unaware of data source |
| `src/lib/store/filter-store.ts` | Filters operate on Card[] regardless of source |
| `src/components/card-grid.tsx` | Receives Card[] as props, source-agnostic |
| `src/components/card-tile.tsx` | Renders a Card, source-agnostic |
| `src/components/card-modal.tsx` | Renders a Card, source-agnostic |
| `src/lib/email/seller-email.ts` | Consumes OrderData, unaware of storage |
| `src/lib/email/buyer-email.ts` | Same |
| `src/lib/order.ts` | Pure functions: escapeHtml, generateOrderRef, buildOrderData |
| `src/lib/notifications.ts` | Sends emails via Resend, no data source dependency |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Neon Postgres | `@neondatabase/serverless` via Drizzle ORM | HTTP for reads, WebSocket for transactions. Replaces `@vercel/postgres` which is deprecated. |
| GitHub OAuth | Auth.js v5 (`next-auth@5`) with GitHub provider | Auto-infers `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` env vars |
| Scryfall API | Existing fetch + rate-limit logic (reused during CSV import) | No changes to API usage |
| Resend | Existing email sending logic (unchanged) | No changes |
| Vercel | Hosting + Neon Postgres marketplace integration | Neon free tier via Vercel marketplace, auto-provisions `DATABASE_URL` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Storefront <-> DB | Read-only queries via `queries.ts` | Storefront never writes to DB |
| Admin UI <-> Admin API | Fetch calls to `/api/admin/*` routes | All mutations go through API routes, not server actions, for clearer auth boundaries |
| Admin API <-> DB | Read + write via `queries.ts` + `mutations.ts` | All writes wrapped in auth checks |
| Proxy <-> Auth.js | Session cookie check | Proxy runs on every /admin/* request |
| Checkout API <-> DB | Transaction: read stock, decrement, insert order | Single transaction for consistency |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k cards, <10 orders/day | Current architecture is perfect. Neon free tier handles this. |
| 1k-10k cards | Add DB indexes on cards.name, cards.set_code. Consider pagination for admin inventory table. |
| 10k+ cards | Add server-side pagination for storefront. Current client-side filtering won't work with 10k+ cards in memory. |

### Scaling Priorities

1. **First bottleneck:** Storefront page load with large card sets. Fix: server-side pagination (but this project targets ~500-5000 cards, so unlikely).
2. **Second bottleneck:** CSV import with Scryfall enrichment for large sets. Fix: already has caching, rate limiting. For very large imports, could add progress streaming.

## Anti-Patterns

### Anti-Pattern 1: Using Server Actions for Admin Mutations

**What people do:** Define `'use server'` functions in admin page components for card CRUD.
**Why it's wrong:** Server actions share the route matcher of the page they're on. The proxy.ts matcher for `/admin/*` would also need to cover server action POST endpoints. API routes give clearer, explicit auth boundaries and are easier to reason about for mutations.
**Do this instead:** Use API routes (`/api/admin/*`) for all admin mutations. Check auth inside each route handler.

### Anti-Pattern 2: Skipping Transactions for Checkout

**What people do:** Decrement stock, then insert order as separate queries.
**Why it's wrong:** If the order insert fails after stock was decremented, inventory is corrupted. If stock decrement fails after order insert, customer has an order for unavailable cards.
**Do this instead:** Wrap in a single database transaction. Use Neon's WebSocket driver (`neon()` with `{ pooling: false }`) for transaction support.

### Anti-Pattern 3: Using @vercel/postgres

**What people do:** Use the `@vercel/postgres` package because old tutorials reference it.
**Why it's wrong:** Vercel deprecated this package in late 2024. Vercel Postgres databases were migrated to Neon. The package is no longer maintained.
**Do this instead:** Use `@neondatabase/serverless` with `drizzle-orm/neon-http` for queries and `drizzle-orm/neon-serverless` for transactions.

### Anti-Pattern 4: Foreign Key from order_items to cards

**What people do:** Add `REFERENCES cards(id)` on `order_items.card_id`.
**Why it's wrong:** CSV import does a full replace (DELETE all + INSERT new). If order_items has a FK to cards, the DELETE cascades and wipes order history, or the DELETE fails due to FK constraints.
**Do this instead:** Denormalize card details into order_items. Store card_name, set_name, price, etc. directly. The card_id is informational, not a foreign key.

### Anti-Pattern 5: Relying Only on Proxy for Auth

**What people do:** Put all auth logic in proxy.ts and assume admin routes are protected.
**Why it's wrong:** Next.js 16 docs explicitly warn that server functions (server actions) are handled as POST requests to the route they're on, so proxy matchers may not cover them. Also, proxy runs in a separate context and bugs there silently expose routes.
**Do this instead:** Defense-in-depth. Proxy.ts for fast redirect, `auth()` check in admin layout, `auth()` check in each API route handler.

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Drizzle ORM over Prisma | Lighter weight, no binary engine, faster cold starts on Vercel serverless. TypeScript-first with SQL-like API. |
| Neon over Supabase | Simpler. Just need Postgres, not a full BaaS. Neon is the default Vercel Postgres provider now. Free tier sufficient. |
| Auth.js v5 over custom OAuth | Battle-tested, GitHub provider built in, session management included. Single `auth()` function works everywhere in Next.js. |
| API routes over server actions for admin CRUD | Clearer auth boundaries, explicit HTTP methods, easier to test and reason about. |
| Denormalized order_items over FK to cards | Preserves order history through CSV re-imports. Cards are ephemeral (re-imported), orders are permanent. |
| `proxy.ts` (not middleware.ts) | Next.js 16 renamed middleware to proxy. Using the current convention. |
| HTTP driver for reads, WebSocket for transactions | Neon's HTTP driver is faster for simple SELECT queries. WebSocket driver is needed for multi-statement transactions (checkout). |

## Suggested Build Order

Based on dependency analysis, the recommended implementation order:

1. **Database + Schema** -- Everything depends on this. Set up Neon, Drizzle config, schema, initial migration.
2. **Data Access Layer** -- queries.ts and mutations.ts. Can be tested independently.
3. **Storefront Migration** -- Swap loadCardData() for DB queries. Validates the schema works for the existing UI.
4. **Auth (Auth.js + proxy.ts)** -- Needed before any admin routes. Can be tested with a simple protected page.
5. **Admin Layout + Dashboard** -- Shell with sidebar, basic stats page. Validates auth + DB reads together.
6. **Inventory CRUD** -- Admin card listing, edit, delete, bulk delete. The core admin feature.
7. **CSV Import** -- Reuses existing parse + enrich logic. Writes to DB instead of JSON.
8. **Checkout Upgrade** -- Add transaction for stock decrement + order storage. Modifies existing route.
9. **Order History** -- Read-only admin page showing stored orders. Last because it depends on orders being stored.

## Sources

- Next.js 16 proxy.ts docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (HIGH confidence -- read directly)
- Next.js 16 route handlers: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (HIGH confidence -- read directly)
- Next.js 16 authentication guide: `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (HIGH confidence -- read directly)
- Neon replaces @vercel/postgres: [Neon Transition Guide](https://neon.com/docs/guides/vercel-postgres-transition-guide) (HIGH confidence -- multiple sources confirm)
- Auth.js v5 with Next.js: [Auth.js reference](https://authjs.dev/reference/nextjs), [Auth.js v5 with Next.js 16 guide](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg) (HIGH confidence)
- Drizzle ORM with Neon: [Drizzle + Neon docs](https://orm.drizzle.team/docs/connect-neon), [Drizzle Neon tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) (HIGH confidence)
- Existing codebase analysis: read all source files directly (HIGH confidence)

---
*Architecture research for: Admin panel & inventory management (v1.1 milestone)*
*Researched: 2026-04-11*
