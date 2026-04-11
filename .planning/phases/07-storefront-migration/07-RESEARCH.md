# Phase 7: Storefront Migration - Research

**Researched:** 2026-04-11
**Domain:** Next.js 16 async server components + Drizzle ORM database queries replacing static JSON
**Confidence:** HIGH

## Summary

This phase replaces the static JSON data source (`data/generated/cards.json` loaded by `src/lib/load-cards.ts`) with live Postgres queries via Drizzle ORM. The migration touches exactly 4 call sites (home page, cart page, checkout page, checkout API route) plus the build pipeline. The existing database layer (`src/db/client.ts`, `src/db/schema.ts`) is already set up from Phase 6 and the Neon HTTP driver is configured.

The core work is: (1) create a queries module at `src/db/queries.ts` that maps DB rows (cents, snake_case) to `Card` objects (dollars, camelCase), (2) convert 3 synchronous server component pages to `async` functions that `await` the query, (3) update the checkout API route to query the DB instead of reading JSON, (4) delete `src/lib/load-cards.ts`, `scripts/generate-data.ts`, and `data/generated/`, (5) update the build script.

**Primary recommendation:** This is a straightforward data source swap. The Drizzle client, schema, and Neon connection are already in place. The main risk is the cents-to-dollars price conversion and ensuring the `Card` interface contract is maintained exactly so downstream client components see zero change.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Always-fresh dynamic rendering -- every page load queries the database directly. No ISR caching, no time-based revalidation.
- **D-02:** Checkout API validates stock against the live database (not static JSON).
- **D-03:** CardData meta (lastUpdated, totalCards, totalSkipped, totalMissingPrices) computed from the database on each load using COUNT(*) and MAX(updated_at).
- **D-04:** Create `src/db/queries.ts` as the single queries module. Functions: `getCards()`, `getCardById()`, `getCardsMeta()`. All pages and API routes import from this one file.
- **D-05:** Price conversion (cents to dollars) happens inside `src/db/queries.ts`. The `getCards()` function returns `Card[]` with prices already in dollars.
- **D-06:** `src/db/queries.ts` maps DB rows to `Card` objects, handling field name differences (e.g., `set_code` to `setCode`, `color_identity` to `colorIdentity`).
- **D-07:** Extend the `Card` interface with optional DB fields: `scryfallId?: string | null`, `createdAt?: string`, `updatedAt?: string`.
- **D-08:** The `Card` interface in `src/lib/types.ts` remains the canonical frontend type.
- **D-09:** When the database is unreachable, show "Store temporarily unavailable, try again soon." No fallback to stale data.
- **D-10:** Checkout fails with "Unable to process order right now, please try again" if the DB is down.
- **D-11:** Error logging via `console.error` only.
- **D-12:** Delete `scripts/generate-data.ts` entirely.
- **D-13:** Delete the `data/generated/` directory.
- **D-14:** Keep `src/lib/csv-parser.ts` and `src/lib/scryfall.ts` for Phase 10.
- **D-15:** Delete `src/lib/load-cards.ts` entirely. All 4 call sites switch to `src/db/queries.ts`.
- **D-16:** Pages become async server components.

### Claude's Discretion
- Exact Drizzle query syntax and any query optimizations
- How to structure the async server component pattern (direct await in component body vs separate data fetch)
- Whether to keep or remove the `CardData` wrapper type (may be simplified to just Card[] + meta)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DB-03 | Storefront reads card data from database instead of static JSON | Entire phase addresses this: queries.ts module, async server components, checkout API migration, build pipeline cleanup |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 (installed) | Type-safe DB queries | Already in project, used by Phase 6 schema and seed [VERIFIED: package.json] |
| @neondatabase/serverless | 1.0.2 (installed) | Neon HTTP driver for serverless Postgres | Already configured in `src/db/client.ts` [VERIFIED: package.json] |
| next | 16.2.2 (installed) | App Router with async server components | Project framework [VERIFIED: package.json] |

### Supporting
No new libraries needed. This phase uses only what is already installed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct Drizzle queries | unstable_cache wrapper | Decision D-01 locks always-fresh -- no caching |
| `export const dynamic = 'force-dynamic'` | Rely on auto-detection | Async DB call in component body already opts into dynamic rendering; explicit config is defense-in-depth |

**Installation:**
```bash
# No new packages needed
```

**Version verification:** All packages already installed and verified from package.json.
- drizzle-orm: 0.45.2 (latest on npm: 0.45.2) [VERIFIED: npm registry]
- @neondatabase/serverless: 1.0.2 (latest on npm: 1.0.2) [VERIFIED: npm registry]
- next: 16.2.2 (latest on npm: 16.2.3 -- minor patch, no upgrade needed) [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── client.ts           # Existing Drizzle + Neon client
│   ├── schema.ts           # Existing table definitions
│   └── queries.ts          # NEW: Data access layer (D-04)
├── lib/
│   ├── types.ts            # Card interface (extended per D-07)
│   ├── csv-parser.ts       # KEPT for Phase 10
│   ├── scryfall.ts         # KEPT for Phase 10
│   ├── order.ts            # Existing order building logic
│   └── load-cards.ts       # DELETED (D-15)
├── app/
│   ├── page.tsx            # MODIFIED: async + queries.ts
│   ├── cart/page.tsx        # MODIFIED: async + queries.ts
│   ├── checkout/page.tsx    # MODIFIED: async + queries.ts
│   └── api/checkout/route.ts # MODIFIED: queries.ts
scripts/
│   └── generate-data.ts    # DELETED (D-12)
data/
│   ├── inventory/          # KEPT (CSV source files)
│   └── generated/          # DELETED (D-13)
```

### Pattern 1: Data Access Layer (`queries.ts`)
**What:** Single module that encapsulates all DB reads, handles row-to-Card mapping and price conversion.
**When to use:** Every time the storefront needs card data.
**Example:**
```typescript
// Source: Next.js 16 docs + Drizzle ORM conventions [VERIFIED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md]
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { count, max } from "drizzle-orm";
import type { Card, CardData } from "@/lib/types";

export async function getCards(): Promise<Card[]> {
  const rows = await db.select().from(cards);
  return rows.map(rowToCard);
}

export async function getCardById(id: string): Promise<Card | null> {
  const rows = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  return rows.length > 0 ? rowToCard(rows[0]) : null;
}

export async function getCardsMeta(): Promise<CardData["meta"]> {
  // Use COUNT(*) and MAX(updated_at) per D-03
  const [result] = await db
    .select({
      totalCards: count(),
      lastUpdated: max(cards.updatedAt),
    })
    .from(cards);

  return {
    totalCards: result.totalCards,
    lastUpdated: result.lastUpdated?.toISOString() ?? new Date().toISOString(),
    totalSkipped: 0,       // Not applicable for DB source
    totalMissingPrices: 0, // Can be computed if needed
  };
}

function rowToCard(row: typeof cards.$inferSelect): Card {
  return {
    id: row.id,
    name: row.name,
    setCode: row.setCode,        // Drizzle handles set_code -> setCode via schema
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    price: row.price !== null ? row.price / 100 : null,  // D-05: cents to dollars
    condition: row.condition,
    quantity: row.quantity,
    colorIdentity: row.colorIdentity,
    imageUrl: row.imageUrl,
    oracleText: row.oracleText,
    rarity: row.rarity,
    foil: row.foil,
    // D-07: Optional DB fields
    scryfallId: row.scryfallId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

**Key insight on field mapping:** Drizzle ORM already maps snake_case DB columns to camelCase JS properties because the schema definition in `src/db/schema.ts` uses camelCase property names with explicit column name strings (e.g., `setCode: text("set_code")`). The `rowToCard` function does NOT need manual snake_case-to-camelCase conversion -- Drizzle returns objects with the JS property names from the schema. [VERIFIED: src/db/schema.ts]

### Pattern 2: Async Server Components
**What:** Convert synchronous page components to async functions that await database queries.
**When to use:** All 3 storefront pages (home, cart, checkout).
**Example:**
```typescript
// Source: Next.js 16 docs [VERIFIED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md]
// Before (synchronous, static JSON):
export default function Home() {
  const data = loadCardData();
  // ...
}

// After (async, database):
export default async function Home() {
  const [cards, meta] = await Promise.all([getCards(), getCardsMeta()]);
  // ...
}
```

### Pattern 3: Dynamic Rendering (No Caching)
**What:** Ensure pages are always dynamically rendered, never statically prerendered.
**When to use:** Per D-01, all storefront pages must query the database on every request.
**How it works:** In Next.js 16 without `cacheComponents` enabled, an async server component that performs a database query (not using `fetch`) will be dynamically rendered by default. The Drizzle query is not a `fetch` call, so Next.js cannot cache it via the fetch cache. However, Next.js may still attempt to prerender the page at build time -- which will fail if `DATABASE_URL` is not available during build. [VERIFIED: node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md]

**Recommendation:** Export `export const dynamic = 'force-dynamic'` from each page to explicitly opt out of prerendering. This is defense-in-depth: it guarantees the page is always rendered at request time regardless of Next.js heuristics. [VERIFIED: Next.js docs, route segment config]

### Anti-Patterns to Avoid
- **Calling database from client components:** Database queries must stay in server components/API routes. Client components receive data as props. [VERIFIED: Next.js docs]
- **Converting pages to client components:** The pages must remain server components. Only the interactive parts (`CardGrid`, `CartPageClient`, `CheckoutClient`) are client components.
- **Caching DB results:** Decision D-01 explicitly forbids ISR or any caching. Do not use `unstable_cache`, `use cache`, or `revalidate` config.
- **Wrapping DB calls in fetch:** Do not wrap Drizzle queries in a fetch API call. Call Drizzle directly as shown in the Next.js data fetching docs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB column to JS field mapping | Manual Object.keys() renaming | Drizzle schema inference (`cards.$inferSelect`) | Schema already defines the mapping; Drizzle returns correctly-named fields |
| Price conversion | Scattered conversion in each component | Single `rowToCard()` in queries.ts (D-05) | One place to get wrong, one place to test |
| SQL query building | Raw SQL strings | Drizzle query builder (`db.select().from(cards)`) | Type-safe, prevents SQL injection |
| Dynamic rendering | Complex revalidation logic | `export const dynamic = 'force-dynamic'` | One-line route segment config |

**Key insight:** The Drizzle schema already maps DB column names to JS property names. The `rowToCard` function only needs to handle: (1) cents-to-dollars price conversion, (2) Date-to-ISO-string timestamp conversion, and (3) adding the three new optional fields to match the extended Card interface.

## Common Pitfalls

### Pitfall 1: Build-time prerendering fails without DATABASE_URL
**What goes wrong:** Next.js attempts to prerender async pages at build time. If `DATABASE_URL` is not available in the build environment, the Drizzle query throws a connection error and the build fails.
**Why it happens:** Next.js 16 without `cacheComponents` tries to prerender pages that don't use request-time APIs (cookies, headers, searchParams).
**How to avoid:** Export `export const dynamic = 'force-dynamic'` from each migrated page. This tells Next.js to skip prerendering. On Vercel, `DATABASE_URL` is typically available at build time, but `force-dynamic` is correct anyway since D-01 requires always-fresh data.
**Warning signs:** Build fails with "Cannot connect to database" or similar Neon connection error.

### Pitfall 2: Floating-point precision in price conversion
**What goes wrong:** `1299 / 100` gives `12.99` correctly, but edge cases like `1999 / 100 = 19.99` are fine too. The real risk is if someone introduces multiplication back (dollars to cents) without `Math.round`.
**Why it happens:** JavaScript floating-point arithmetic.
**How to avoid:** The conversion in `queries.ts` is strictly `row.price / 100` (integer division yields clean decimals for two-digit cent values). The seed script already uses `Math.round(card.price * 100)` for the reverse. Keep these paired and tested.
**Warning signs:** Price displays as `12.990000000000002` or similar.

### Pitfall 3: CardData.meta fields that no longer apply
**What goes wrong:** The existing `CardData.meta` has `totalSkipped` and `totalMissingPrices` which were computed by the build-time data generation pipeline. These have no direct DB equivalent.
**Why it happens:** The meta fields were designed for the CSV-to-JSON pipeline, not live DB queries.
**How to avoid:** Per D-03, compute `totalCards` via `COUNT(*)` and `lastUpdated` via `MAX(updated_at)`. Set `totalSkipped: 0` and `totalMissingPrices: 0` as constants (or compute `totalMissingPrices` with a `COUNT(*) WHERE price IS NULL` query if the display is used). The CardGrid component receives meta but mainly uses `totalCards` for display. Check what the component actually reads.
**Warning signs:** UI shows "0 cards skipped" when it previously showed a meaningful number.

### Pitfall 4: Checkout API race condition with buildOrderData
**What goes wrong:** The `buildOrderData` function in `src/lib/order.ts` takes a `Card[]` array and builds a `Map` for lookup. The prices in this array must be in dollars (not cents), otherwise order totals will be 100x too large.
**Why it happens:** `getCards()` returns dollars per D-05, but if someone accidentally passes raw DB rows to `buildOrderData`, prices would be in cents.
**How to avoid:** The checkout API route should call `getCards()` from queries.ts (which returns dollars) and pass that to `buildOrderData`. Never pass raw Drizzle result rows to functions expecting Card objects.
**Warning signs:** Order confirmation email shows prices like "$1299.00" instead of "$12.99".

### Pitfall 5: Missing error handling for DB connection failures
**What goes wrong:** Unhandled promise rejection crashes the server component, showing a Next.js error page instead of the user-friendly message from D-09.
**Why it happens:** Neon HTTP driver throws on connection failure. If not caught, it bubbles to the Next.js error boundary.
**How to avoid:** Wrap DB calls in try/catch in the page components. Return the friendly error message UI on catch. For the API route, return a JSON error response.
**Warning signs:** Users see a generic Next.js error page or stack trace instead of "Store temporarily unavailable."

### Pitfall 6: Not removing generate-data.ts from build script
**What goes wrong:** Build fails because `tsx scripts/generate-data.ts` is no longer present but the `build` script in package.json still references it.
**Why it happens:** Easy to forget the package.json build script when deleting the generation script.
**How to avoid:** Update `package.json` build script from `"tsx scripts/generate-data.ts && next build"` to just `"next build"`. Also remove the `"generate"` script entry.
**Warning signs:** CI/CD pipeline fails with "Cannot find module scripts/generate-data.ts".

## Code Examples

Verified patterns from the actual codebase and official docs:

### Async Server Component with DB Query
```typescript
// Source: Next.js 16 docs + project conventions
// [VERIFIED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md]
import Header from "@/components/header";
import FilterBar from "@/components/filter-bar";
import CardGrid from "@/components/card-grid";
import { getCards, getCardsMeta } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [cards, meta] = await Promise.all([getCards(), getCardsMeta()]);

    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <FilterBar />
        <main className="pt-6">
          <CardGrid cards={cards} meta={meta} />
        </main>
      </div>
    );
  } catch (error) {
    console.error("[HOME] Database error:", error);
    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-16 text-center">
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Store temporarily unavailable, try again soon.
          </p>
        </main>
      </div>
    );
  }
}
```

### Drizzle Select All Cards
```typescript
// Source: Drizzle ORM + project schema
// [VERIFIED: src/db/schema.ts, src/db/client.ts]
import { db } from "@/db/client";
import { cards } from "@/db/schema";

// Returns all rows with Drizzle-mapped camelCase field names
const rows = await db.select().from(cards);
// rows[0].setCode  -- already camelCase from schema definition
// rows[0].price    -- integer cents from DB
```

### Drizzle Count and Max Aggregate
```typescript
// Source: Drizzle ORM aggregate functions
// [ASSUMED: Drizzle count/max syntax based on training data]
import { count, max, sql } from "drizzle-orm";

const [result] = await db
  .select({
    totalCards: count(),
    lastUpdated: max(cards.updatedAt),
  })
  .from(cards);
```

### Checkout API Route with DB
```typescript
// Source: Project convention + D-02, D-10
// [VERIFIED: src/app/api/checkout/route.ts existing pattern]
import { getCards } from "@/db/queries";

export async function POST(request: NextRequest) {
  try {
    // ... validation ...

    let cards: Card[];
    try {
      cards = await getCards();
    } catch (dbError) {
      console.error("[CHECKOUT] Database error:", dbError);
      return Response.json(
        { success: false, error: "Unable to process order right now, please try again" },
        { status: 503 },
      );
    }

    const cardMap = new Map(cards.map((c) => [c.id, c]));
    // ... stock validation and order building (same as current) ...
  } catch (error) {
    // ... existing error handling ...
  }
}
```

### Extended Card Interface
```typescript
// Source: Decision D-07
// [VERIFIED: src/lib/types.ts current interface]
export interface Card {
  // ... existing fields unchanged ...
  id: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  price: number | null;
  condition: string;
  quantity: number;
  colorIdentity: string[];
  imageUrl: string | null;
  oracleText: string | null;
  rarity: string;
  foil: boolean;
  // D-07: New optional DB fields
  scryfallId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `readFileSync` of static JSON at render | Async Drizzle query in server component | This phase | Pages become async; data always fresh |
| Build-time data pipeline (`tsx scripts/generate-data.ts && next build`) | Direct DB reads at request time | This phase | Simpler build; no JSON generation step |
| `loadCardData()` returns `CardData \| null` | `getCards()` returns `Promise<Card[]>`, `getCardsMeta()` returns `Promise<meta>` | This phase | Separate card and meta fetching; more granular |

**Deprecated/outdated:**
- `src/lib/load-cards.ts`: Replaced by `src/db/queries.ts`. Delete entirely.
- `scripts/generate-data.ts`: No longer needed. Delete entirely.
- `data/generated/cards.json`: No longer the source of truth. Delete directory.
- `npm run generate` script: Remove from package.json.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle `count()` and `max()` aggregate functions work as shown in Code Examples | Code Examples | LOW -- syntax may vary slightly; verify at implementation time. If `count()` isn't directly importable, use `sql<number>\`COUNT(*)\`` instead. |
| A2 | `totalSkipped: 0` is acceptable for the meta display | Common Pitfalls (Pitfall 3) | LOW -- CardGrid displays this value; if prominently shown, the "0" might look odd but is semantically correct for DB-sourced data. |
| A3 | `export const dynamic = 'force-dynamic'` prevents build-time prerendering for non-fetch async operations in Next.js 16.2.2 without cacheComponents | Architecture Patterns | LOW -- This is well-documented in Next.js docs. Even without it, the Drizzle query would trigger dynamic rendering, but explicit is better. |

**If this table is empty:** All claims in this research were verified or cited -- no user confirmation needed.

## Open Questions

1. **Does `CardGrid` prominently display `totalSkipped` and `totalMissingPrices`?**
   - What we know: The meta object is passed to `<CardGrid cards={data.cards} meta={data.meta} />`. The `CardGrid` component receives `meta: CardData["meta"]`.
   - What's unclear: Whether totalSkipped and totalMissingPrices are rendered in the UI or just available.
   - Recommendation: Check `CardGrid` component during implementation. If displayed, either compute `totalMissingPrices` from DB (`COUNT(*) WHERE price IS NULL`) or remove from UI. Setting to 0 is safe if not displayed.

2. **Should the `generate` npm script be fully removed or repurposed?**
   - What we know: D-12 says delete `scripts/generate-data.ts`. The `generate` script in package.json calls it.
   - What's unclear: Whether any developer workflow depends on `npm run generate`.
   - Recommendation: Remove the `generate` script from package.json entirely. The seed script (`npm run db:seed`) serves the equivalent purpose now.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-03a | `getCards()` returns Card[] with dollars, correct field mapping | unit | `npx vitest run src/db/__tests__/queries.test.ts -t "getCards"` | Wave 0 |
| DB-03b | `getCardById()` returns single Card or null | unit | `npx vitest run src/db/__tests__/queries.test.ts -t "getCardById"` | Wave 0 |
| DB-03c | `getCardsMeta()` returns correct counts | unit | `npx vitest run src/db/__tests__/queries.test.ts -t "getCardsMeta"` | Wave 0 |
| DB-03d | `rowToCard()` price conversion cents to dollars | unit | `npx vitest run src/db/__tests__/queries.test.ts -t "rowToCard"` | Wave 0 |
| DB-03e | Pages load without errors (async server components) | manual | Visit each page on `npm run dev` | manual-only: requires running Next.js dev server with live DB |
| DB-03f | Build succeeds without generate-data.ts | smoke | `npm run build` | manual-only: requires DATABASE_URL in build environment or force-dynamic |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual page verification before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/db/__tests__/queries.test.ts` -- unit tests for `rowToCard`, `getCards`, `getCardById`, `getCardsMeta` (requires mocking `db`)
- [ ] Tests for price conversion edge cases (0 cents, null price, large values)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A -- public storefront, no auth |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A -- read-only public queries |
| V5 Input Validation | yes | Drizzle parameterized queries prevent SQL injection. Checkout validates request body. |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via card ID lookup | Tampering | Drizzle ORM parameterized queries (never raw string interpolation) [VERIFIED: Drizzle default behavior] |
| DB credential exposure to client | Information Disclosure | Server components keep DB queries server-side; `DATABASE_URL` is not prefixed with `NEXT_PUBLIC_` [VERIFIED: Next.js docs] |
| Denial of service via expensive queries | Denial of Service | Queries are simple SELECT * and COUNT -- no user-controlled WHERE clauses on public pages. Checkout validates items array. |

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` -- Server component data fetching with ORM
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` -- Async server components, data passing to client components
- `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` -- Route segment config (`dynamic`, `revalidate`) for non-cacheComponents projects
- `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` -- Error boundaries and error handling patterns
- `src/db/schema.ts` -- Actual Drizzle schema with column mappings
- `src/db/client.ts` -- Actual Drizzle client configuration
- `src/lib/types.ts` -- Current Card and CardData interfaces
- `src/app/page.tsx`, `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/api/checkout/route.ts` -- Current call sites
- npm registry -- Package version verification

### Secondary (MEDIUM confidence)
- `src/db/seed.ts` -- Reference for row-to-card mapping patterns (reverse direction: Card to row)

### Tertiary (LOW confidence)
- Drizzle `count()` and `max()` aggregate function syntax -- based on training data, not verified against current docs [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages already installed and verified; no new dependencies
- Architecture: HIGH -- Pattern is well-documented in Next.js 16 docs bundled with the project; all 4 call sites inspected
- Pitfalls: HIGH -- Based on direct code inspection and known JS floating-point issues
- Queries module: MEDIUM -- Drizzle aggregate syntax is assumed but low-risk (easy to adjust at implementation time)

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- no fast-moving dependencies)
