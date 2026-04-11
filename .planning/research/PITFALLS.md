# Pitfalls Research

**Domain:** Adding database, auth, admin panel, and inventory management to an existing static Next.js MTG card store
**Researched:** 2026-04-11
**Confidence:** HIGH (verified against Next.js 16 official docs, PostgreSQL documentation, Auth.js references, and multiple 2025-2026 sources)

## Critical Pitfalls

### Pitfall 1: Race Condition on Stock Decrement at Checkout

**What goes wrong:**
Two friends browse the store simultaneously. Both see 1 copy of a card available. Both add it to their carts. Both submit checkout. The naive pattern -- read current stock, check if sufficient, decrement, save -- allows both checkouts to succeed because neither transaction sees the other's in-flight write. Result: stock goes to -1, one friend gets a card that does not exist.

The current codebase reads inventory from a static JSON file (`loadCardData()` in `src/lib/load-cards.ts`) and does stock validation in the checkout API route (lines 40-53 of `src/app/api/checkout/route.ts`). When this moves to a database, the read-then-write pattern must become atomic.

**Why it happens:**
The read-modify-write anti-pattern is the default approach developers reach for: `SELECT quantity FROM cards WHERE id = ?`, check `quantity >= requested`, then `UPDATE cards SET quantity = quantity - requested`. Between the SELECT and UPDATE, another transaction can read the same stale value.

**How to avoid:**
Use an atomic UPDATE with a WHERE clause that enforces the constraint in a single SQL statement:

```sql
UPDATE cards
SET quantity = quantity - $requested_qty
WHERE id = $card_id
  AND quantity >= $requested_qty
RETURNING quantity;
```

If zero rows are returned, the stock was insufficient. No separate SELECT needed. This is atomic at all PostgreSQL isolation levels. Wrap the entire checkout (all items) in a single transaction so either all decrements succeed or none do.

Alternative: Use `SELECT ... FOR UPDATE` to lock the rows if you need to read other card data (name, price) during the same transaction. But the atomic UPDATE pattern is simpler and avoids lock contention entirely for this use case.

**Warning signs:**
- Any code path that does a SELECT followed by a separate UPDATE on inventory
- Tests that only exercise single-user checkout, never concurrent
- No database transaction wrapping the multi-item checkout

**Phase to address:**
Database setup and checkout migration phase. This must be designed into the schema and checkout API from the start -- retrofitting atomicity onto a broken pattern is painful.

---

### Pitfall 2: CSV "Full Replace" Import Destroys In-Flight Carts and Orders

**What goes wrong:**
The admin uploads a new CSV while a friend has items in their cart. The CSV import runs `DELETE FROM cards; INSERT INTO cards ...` (or `TRUNCATE + INSERT`). Card IDs change because the new CSV generates different composite keys. The friend's cart (stored in localStorage as card ID references) now points to nonexistent records. Checkout fails with cryptic errors, or worse -- if IDs collide with different cards -- the friend orders the wrong cards.

Even if card IDs remain stable, a full-replace import can wipe stock adjustments from recent orders. If the admin exported from Manabox, the export reflects the physical collection at time of scan, not accounting for orders placed since the last scan.

**Why it happens:**
"Full replace" is the simplest mental model for CSV import, and it matches how v1.0 works (rebuild replaces `cards.json` entirely). But in v1.0, there are no concurrent users and no persistent state. With a live database, the import is destructive.

**How to avoid:**
1. Wrap the entire import in a database transaction. If any step fails, the old data remains intact.
2. Use a "soft swap" pattern: insert new data into a staging table, validate it, then swap in a single transaction (`DELETE FROM cards; INSERT INTO cards SELECT * FROM cards_staging` -- all within one transaction, or use table renaming).
3. Preserve the card ID scheme (`${setCode}-${collectorNumber}-${foil}-${condition}`) from v1.0's `types.ts` as the primary key, so IDs remain stable across imports.
4. Before deleting, check for any pending orders placed since the last import and warn the admin.
5. Add a confirmation step in the admin UI: "This will replace X cards. Y orders were placed since the last import. Proceed?"

**Warning signs:**
- Import deletes data outside of a transaction
- No confirmation dialog before destructive import
- Card IDs generated differently than the existing scheme
- No logging of what the import changed (how many added, removed, quantity changes)

**Phase to address:**
CSV import phase. The import transaction design is foundational -- it determines whether you can safely operate with concurrent users.

---

### Pitfall 3: Proxy-Only Auth (No Server-Side Verification in Routes and Actions)

**What goes wrong:**
Admin routes are "protected" by a `proxy.ts` (Next.js 16's renamed `middleware.ts`) that checks the session and redirects unauthenticated users. But the actual API routes and Server Actions for admin operations (edit card, delete card, import CSV, view orders) do not independently verify the session. An attacker can directly POST to `/api/admin/delete-card` bypassing the proxy entirely.

This is not theoretical. CVE-2025-29927 (CVSS 9.1, disclosed March 2025) allowed attackers to bypass Next.js middleware by sending an `x-middleware-subrequest` header. The vulnerability affected Next.js versions through 15.2.2. While v16 (which this project uses at 16.2.2) is patched, the architectural lesson remains: proxy/middleware is NOT a security boundary.

**Why it happens:**
Developers see the proxy redirect working in the browser and assume the route is protected. They do not realize that Server Actions and API routes are directly addressable via POST requests independent of the proxy.

**How to avoid:**
1. Every admin Server Action and API Route Handler must call `auth()` and verify the session independently. The official Next.js 16 data-security guide explicitly states: "A page-level authentication check does not extend to the Server Actions defined within it. Always re-verify inside the action."
2. Create a reusable `requireAdmin()` helper in a `server-only` Data Access Layer:
   ```typescript
   import 'server-only'
   import { auth } from '@/lib/auth'

   export async function requireAdmin() {
     const session = await auth()
     if (!session?.user) throw new Error('Unauthorized')
     // Verify this specific user is the admin
     if (session.user.email !== process.env.ADMIN_EMAIL) {
       throw new Error('Forbidden')
     }
     return session
   }
   ```
3. Use the `server-only` npm package in data access modules to prevent accidental client import.
4. Use `proxy.ts` only for UX (redirecting unauthenticated users to login) -- never as the sole security check.

**Warning signs:**
- Admin API routes or Server Actions that do not import and call `auth()`
- No `server-only` import in modules that access the database
- Auth checks only in proxy/middleware configuration
- Tests that skip auth headers when calling admin endpoints

**Phase to address:**
Auth setup phase. The `requireAdmin()` pattern must be established before any admin routes are built, so every subsequent admin feature inherits it.

---

### Pitfall 4: Stale Cart Data After Inventory Changes

**What goes wrong:**
The friend's cart is stored in localStorage (Zustand persist with `viki-cart` key, as seen in `src/lib/store/cart-store.ts`). When inventory changes (admin edits, stock decremented by another order, CSV re-import), the cart has no way to know. The friend may:
- Have a card in cart that no longer exists (deleted by admin or CSV import)
- Have quantity 3 in cart but only 1 remains in stock
- See stale prices from when they added the card

When they reach checkout, the server-side validation catches this -- but only at the final step, creating a frustrating user experience.

**Why it happens:**
In v1.0, inventory is static (built from JSON at deploy time), so staleness is expected and acceptable. In v1.1 with live database, inventory changes continuously, but the client-side cart does not know this.

**How to avoid:**
1. Validate cart against current database state at two points: when the cart page loads (not just at checkout) and again at checkout submission.
2. On cart page load, fetch current prices and stock for all items in cart. Display warnings for out-of-stock or reduced-quantity items. Remove nonexistent cards with a notice.
3. At checkout, re-validate server-side (the existing pattern in the checkout route) and return specific, actionable error messages per item.
4. Do NOT try to add real-time WebSocket updates for a friend-group store. A simple "check on cart load" is sufficient for this scale.

**Warning signs:**
- Cart page renders using only localStorage data without a server fetch
- Checkout fails with generic errors instead of per-item messages
- No handling for "card no longer exists" in cart

**Phase to address:**
Checkout migration phase (when checkout moves from static JSON validation to database validation). The cart-page validation can be added in the same phase or as an enhancement.

---

### Pitfall 5: Prisma Client Instantiation Leak in Development

**What goes wrong:**
During development, Next.js hot module replacement (HMR) re-executes module-level code. If `new PrismaClient()` (or equivalent database client) is instantiated at the module level in a file that gets re-imported on each hot reload, each reload creates a new client with its own connection pool. After several edits, the database connection limit is exhausted. Errors like "too many clients already" or "remaining connection slots are reserved" appear.

This is especially acute with Vercel Postgres free tier, which has strict connection limits.

**Why it happens:**
Developers write `const prisma = new PrismaClient()` in `lib/db.ts` without caching the instance. Works in production (cold start creates one instance), breaks in development (every HMR cycle creates another).

**How to avoid:**
Use the standard singleton pattern with `globalThis`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

This pattern works for any database client (Drizzle, raw pg, @vercel/postgres). The principle: cache the client on `globalThis` in development so HMR reuses the existing instance.

**Warning signs:**
- Database connection errors during development after a few file saves
- `db.ts` or `prisma.ts` creates a new client without checking `globalThis`
- Works fine on first start, breaks after 5-10 code changes

**Phase to address:**
Database setup phase. This is literally the first thing to get right when adding the database client.

---

### Pitfall 6: Static Page Now Needs Dynamic Data (Build vs Runtime Confusion)

**What goes wrong:**
The current homepage (`src/app/page.tsx`) calls `loadCardData()` which reads from the filesystem at build time. This is a Server Component that works because the data is static. When migrating to a database, developers might:
1. Keep the page as a static page but wonder why it shows stale data
2. Add a database call but not understand Next.js caching, so the page still appears stale
3. Make everything dynamic unnecessarily, losing SSG benefits for the public storefront

**Why it happens:**
Next.js 16 has sophisticated caching. Route Handlers with GET are cached by default. Server Components can be statically rendered. Moving from "build-time JSON" to "runtime database" requires understanding when Next.js re-renders and revalidates.

**How to avoid:**
1. For the public storefront: Use `revalidatePath` or `revalidateTag` after admin mutations (card edit, delete, import). This keeps the storefront pages cached but refreshes them when data changes.
2. For admin pages: Mark them as dynamic (they need fresh data every time): `export const dynamic = 'force-dynamic'` or use `cookies()` / `headers()` which automatically opt out of caching.
3. Understand the distinction: the storefront is read-heavy, rarely-changing data (revalidate on mutation). The admin panel is always-fresh data.
4. Do NOT add `export const dynamic = 'force-dynamic'` to the storefront -- it will make every page load hit the database.

**Warning signs:**
- Admin edits a card but the storefront still shows old data
- Every page load triggers a database query even for unchanged data
- `force-dynamic` on storefront pages

**Phase to address:**
Storefront migration phase (when the storefront switches from JSON to database). Must be coordinated with the admin panel so `revalidatePath` calls are wired correctly.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding admin email instead of a config table | No need for a users/roles table | Cannot add additional admins | Acceptable for v1.1 -- single admin is an explicit constraint |
| Using JSON columns for order items instead of a join table | Simpler schema, fewer queries | Cannot query "all orders containing card X" efficiently | Acceptable for friend-group scale -- orders are low volume |
| Skipping database migrations tool (manual SQL) | No migration tooling to learn | Cannot roll back schema changes, no version history | Never -- always use a migration tool (Prisma Migrate, Drizzle Kit) even for simple schemas |
| No rate limiting on admin endpoints | Faster to build | Admin endpoints can be hammered by mistake or attack | Acceptable for v1.1 only because auth limits exposure, but add rate limiting to checkout |
| Client-side cart without server-side reservation | No reservation table, simpler architecture | Two friends can "claim" the same last card until checkout | Acceptable for friend-group scale -- not an auction house |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Auth.js v5 + GitHub Provider | Missing `AUTH_SECRET` in production; using old `getServerSession()` v4 API | Set `AUTH_SECRET` env var (32-byte random). Use `auth()` from the v5 `auth.ts` config. v5 is a complete rewrite -- ignore v4 tutorials |
| Auth.js v5 + Next.js 16 | Placing middleware file as `middleware.ts` | Next.js 16 renamed middleware to `proxy.ts` with `export function proxy()`. Auth.js middleware wrapper must export as `proxy`, not `middleware` |
| Vercel Postgres | Importing `@vercel/postgres` directly in many files, creating multiple pool instances | Create a single `db.ts` module that exports the pool/client. Use `globalThis` caching for dev. All database access goes through this module |
| Vercel Postgres | Using `process.env.POSTGRES_URL` without checking which URL type (pooled vs direct) | Use `POSTGRES_URL` (pooled) for application queries. Use `POSTGRES_URL_NON_POOLED` (direct) for migrations only. Pooled connections go through PgBouncer |
| Resend (existing) + new checkout flow | Current checkout does not decrement stock (no database). Adding decrement without transactional email retry | Wrap stock decrement + order creation in a transaction. If email fails, the order (and decrement) still persists. Show order ref on confirmation page regardless of email status (existing pattern is good) |
| Scryfall API + database migration | Re-enriching all cards from Scryfall during CSV import, hitting rate limits | Import CSV data into database first (name, set, price from CSV). Enrich with Scryfall data lazily or in a background job. Keep the existing generated image URLs in the database |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries on card listing | Card grid page takes 2+ seconds, database shows 500+ queries per page load | Use a single `SELECT * FROM cards WHERE ...` with filters applied in SQL, not in JavaScript. If using an ORM, verify the generated query | At 100+ cards (which this app already has) |
| Full table scan on card search | Search becomes slow as inventory grows | Add indexes on `name` (for text search), `set_code`, `color_identity`, `quantity > 0` | At 1000+ cards -- not a concern for current scale but cheap to prevent |
| Loading all cards into admin table | Admin inventory page fetches entire inventory into the browser | Server-side pagination for the admin table. Fetch 50 cards per page. Search/filter via query params that become SQL WHERE clauses | At 500+ cards |
| Vercel Postgres connection exhaustion | "too many clients" errors under normal load | Use connection pooling (PgBouncer via `POSTGRES_URL`). Limit pool size. Use `globalThis` singleton pattern for client | Vercel free tier has limited connections -- can hit this even at low traffic if connections leak |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Admin routes accessible without auth check in Server Actions | Any user can create, edit, delete cards and import CSVs by sending POST requests directly | Every Server Action and Route Handler checks `auth()` independently. Never rely solely on proxy/middleware |
| Exposing `AUTH_SECRET` or database credentials via `NEXT_PUBLIC_` prefix | Secrets visible in client-side JavaScript | Only `AUTH_SECRET`, `POSTGRES_URL`, and `RESEND_API_KEY` should be non-public env vars. Audit for `NEXT_PUBLIC_` prefix on any secret |
| GitHub OAuth callback URL misconfiguration | OAuth flow fails in production but works locally; or worse, redirects to attacker's domain | Set exact callback URL in GitHub OAuth App settings: `https://your-domain.com/api/auth/callback/github`. Different for dev vs prod |
| SQL injection in card search or filter | Attacker can read/modify/delete database contents | Use parameterized queries always. Never interpolate user input into SQL strings. ORMs (Prisma, Drizzle) handle this by default. If using raw SQL via `@vercel/postgres`, use `sql` tagged template literals which auto-parameterize |
| CSV import without sanitization | Malicious CSV with script injection in card names renders XSS in admin panel | Sanitize/escape all CSV-imported string fields before storage. The existing `escapeHtml()` in `order.ts` handles output; also validate input at import time |
| Missing CSRF protection on admin forms | Attacker tricks admin into submitting a malicious form that deletes inventory | Use Server Actions (which have built-in CSRF protection via Origin header checking) instead of raw POST to API routes for admin mutations |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| CSV import with no progress indicator | Admin clicks "Import" and sees nothing for 10 seconds, clicks again, triggers duplicate import | Show upload progress, parsing progress ("Processing 500 cards..."), and a completion summary ("Added 450, updated 30, removed 20") |
| Editing a card with no optimistic update | Admin changes price, saves, page reloads, admin loses their place in a long card list | Use optimistic UI updates. Show the change immediately, revert if the server rejects it. Maintain scroll position after saves |
| Checkout fails with "out of stock" but no detail | Friend has 5 items in cart, 1 is out of stock, but error message does not say which | Return per-item validation results. Highlight the specific problem items. Allow the friend to remove just those items and retry |
| Admin deletes a card that is in someone's cart | Friend's cart silently contains a ghost item | On cart load, validate all items against database. Show "This item is no longer available" with a remove button |
| Order history with no search or filter | Admin scrolls through hundreds of orders to find one | Add search by order ref, buyer name, date range. Start with just order ref search -- it is the most common use case |

## "Looks Done But Isn't" Checklist

- [ ] **Auth:** Session check in proxy/middleware exists but Server Actions do NOT independently call `auth()` -- verify every admin Server Action has its own auth check
- [ ] **Checkout:** Stock decrement works for single user but was never tested with two concurrent checkouts -- verify with a concurrent test (even manual: open two browser windows)
- [ ] **CSV Import:** Import works but has no transaction rollback -- verify that a malformed row mid-import does not leave the database in a partial state (some cards deleted, new ones half-inserted)
- [ ] **CSV Import:** Import replaces data but does not warn about pending cart items or recent orders -- verify the admin sees a warning before destructive operations
- [ ] **Card Edit:** Editing a card updates the database but the public storefront still shows cached data -- verify `revalidatePath('/')` or equivalent is called after mutations
- [ ] **Environment Variables:** `AUTH_SECRET` is set in production Vercel dashboard -- verify by checking Vercel environment settings (not just `.env.local`)
- [ ] **GitHub OAuth:** Callback URL matches production domain exactly -- verify in GitHub Developer Settings (both dev and prod OAuth apps)
- [ ] **Database Singleton:** Database client uses `globalThis` caching -- verify by editing a file 10 times in dev mode and checking that the database does not throw connection errors
- [ ] **Order Reference:** `generateOrderRef()` uses timestamp-based refs (`ORD-YYYYMMDD-HHMM`) which can collide if two orders arrive in the same minute -- verify order refs are unique (add a random suffix or use database sequence)
- [ ] **Mobile Admin:** Admin panel works on desktop but is unusable on mobile -- verify basic responsiveness (the admin may want to quick-edit a price from their phone)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Oversold card (race condition) | LOW | Contact the friend whose order cannot be fulfilled. Mark one order as "out of stock" in order history. Fix the checkout to use atomic decrements |
| CSV import destroyed data | MEDIUM | If using transactions: automatic rollback. If not: re-import from the last known-good CSV. Orders placed between the bad import and recovery need manual reconciliation |
| Admin route accessed without auth | HIGH | Audit database for unauthorized changes. Rotate `AUTH_SECRET`. Add auth checks to all Server Actions. Review order history for suspicious entries |
| Database connection exhaustion | LOW | Restart the dev server (dev) or redeploy (prod). Fix the singleton pattern. Connections will be reclaimed as idle timeouts expire |
| Stale storefront after admin edit | LOW | Trigger manual revalidation (redeploy or visit a revalidation endpoint). Fix `revalidatePath` calls in admin mutations |
| Order ref collision | LOW | Both orders were placed successfully -- just have duplicate refs. Change ref generation to include random characters or a database-assigned sequence number |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Race condition on stock decrement | Database + Checkout migration | Write a test that runs two concurrent checkout requests for the last copy of a card. Only one should succeed |
| CSV full-replace destroys carts/orders | CSV Import feature | Import a CSV, verify cards appear. Import a broken CSV, verify old data is intact (transaction rollback). Import while a cart has items, verify cart validation handles it |
| Proxy-only auth (no server-side checks) | Auth setup | Attempt to call an admin API route/Server Action without a session cookie (e.g., with curl). Verify 401 response |
| Stale cart data | Checkout migration | Add item to cart, delete that card via admin, load cart page, verify a clear "item unavailable" message appears |
| Prisma/DB client connection leak | Database setup | Edit a source file 20 times in dev mode. Verify no "too many connections" errors. Check that only 1 database client instance exists |
| Build vs runtime confusion (caching) | Storefront migration | Edit a card price in admin, then load the storefront. Verify the new price appears without a redeploy |
| SQL injection | Database setup | Use parameterized queries from the start. Verify by searching for a card with name `'; DROP TABLE cards; --` and confirm no error |
| CSV import without progress feedback | CSV Import feature | Upload a CSV with 500+ rows. Verify the admin sees progress and a completion summary |
| Order ref collision | Order history feature | Verify order refs include randomness or a database sequence. Two orders in the same minute should have different refs |

## Sources

- Next.js 16 official docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` -- confirmed middleware renamed to proxy (HIGH confidence)
- Next.js 16 data-security guide: `node_modules/next/dist/docs/01-app/02-guides/data-security.md` -- Server Action auth patterns, Data Access Layer (HIGH confidence)
- Next.js 16 authentication guide: `node_modules/next/dist/docs/01-app/02-guides/authentication.md` -- session management, Auth.js integration (HIGH confidence)
- [CVE-2025-29927: Next.js Middleware Authorization Bypass](https://blogs.jsmon.sh/cve-2025-29927-explained-the-next-js-middleware-authorization-bypass/) -- confirmed middleware is not a security boundary (HIGH confidence)
- [Next.js Security Best Practices 2026](https://www.authgear.com/post/nextjs-security-best-practices) -- defense-in-depth auth patterns (MEDIUM confidence)
- [Atomic Increment/Decrement operations in SQL](https://blog.pjam.me/posts/atomic-operations-in-sql/) -- atomic UPDATE pattern for stock management (HIGH confidence)
- [How I Eliminated Inventory Race Conditions](https://medium.com/@chaturvediinitin/how-i-eliminated-inventory-race-conditions-in-a-production-e-commerce-system-2302ba81846b) -- SELECT FOR UPDATE vs atomic UPDATE comparison (MEDIUM confidence)
- [Connection Pooling with Vercel Functions](https://vercel.com/kb/guide/connection-pooling-with-functions) -- connection pool management in serverless (HIGH confidence)
- [Next.js + Prisma Complete Guide](https://eastondev.com/blog/en/posts/dev/20251220-nextjs-prisma-complete-guide/) -- Prisma singleton pattern, connection leak prevention (MEDIUM confidence)
- [Auth.js v5 with Next.js 16 Guide](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg) -- Auth.js v5 setup patterns (MEDIUM confidence)
- [Common mistakes with the Next.js App Router](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) -- caching behavior, route handler pitfalls (HIGH confidence)
- Codebase analysis: `src/app/api/checkout/route.ts`, `src/lib/load-cards.ts`, `src/lib/store/cart-store.ts`, `src/lib/types.ts` -- current architecture examined directly (HIGH confidence)

---
*Pitfalls research for: Adding database, auth, admin panel, and inventory management to existing static Next.js MTG card store*
*Researched: 2026-04-11*
