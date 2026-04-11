# Phase 7: Storefront Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 07-storefront-migration
**Areas discussed:** Revalidation timing, DB unavailability, Build pipeline cleanup, Data access layer shape, Type compatibility, loadCardData replacement

---

## Revalidation timing

| Option | Description | Selected |
|--------|-------------|----------|
| Always fresh (dynamic) | Every page load queries the DB directly. Friends always see current stock. Slightly slower loads (~200ms on Neon) but simplest. | ✓ |
| Cached with short TTL (60s) | Next.js ISR caches pages for 60 seconds. Fast loads, data at most 1 minute stale. | |
| You decide | Claude picks best approach. | |

**User's choice:** Always fresh (dynamic)
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, live DB stock check (Recommended) | Checkout reads current stock from DB. Prevents selling cards that were removed/out-of-stock since page load. | ✓ |
| Keep current behavior for now | Checkout still validates against whatever the page loaded. | |

**User's choice:** Yes, live DB stock check
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| DB query layer (Recommended) | A mapping function in src/db/ converts DB rows to Card objects with dollars. All existing frontend code stays unchanged. | ✓ |
| Keep cents everywhere | Change the Card interface to use cents. Update all frontend display code to divide by 100. | |
| You decide | Claude picks based on minimizing changes. | |

**User's choice:** DB query layer
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Compute from DB on each load | Query COUNT(*) and MAX(updated_at) from cards table. Always accurate. | ✓ |
| Drop meta entirely | Remove the meta display from the storefront. | |
| You decide | Claude picks simplest approach. | |

**User's choice:** Compute from DB on each load
**Notes:** None

---

## DB unavailability

| Option | Description | Selected |
|--------|-------------|----------|
| Simple error message | Show a friendly 'Store temporarily unavailable, try again soon' message. No fallback data. | ✓ |
| Empty state with message | Show the normal storefront layout but with 'No cards available right now'. | |
| You decide | Claude picks simplest error handling. | |

**User's choice:** Simple error message
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with clear message (Recommended) | Show 'Unable to process order right now, please try again' if DB query fails. No email sent, no partial state. | ✓ |
| Queue and retry later | Accept the order, send emails, and try the DB stock check later. | |
| You decide | Claude picks based on simplicity. | |

**User's choice:** Fail with clear message
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Console only (Recommended) | console.error in the API route. Vercel captures these in function logs automatically. | ✓ |
| You decide | Claude picks simplest approach. | |

**User's choice:** Console only
**Notes:** None

---

## Build pipeline cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Remove entirely (Recommended) | Delete generate-data.ts, remove from build script, delete data/generated/ directory. Clean break. | ✓ |
| Keep as manual backup tool | Keep generate-data.ts but remove from build script. Could still run manually. | |
| You decide | Claude picks based on keeping codebase clean. | |

**User's choice:** Remove entirely
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Keep csv-parser and scryfall client | Phase 10 CSV Import will need these. Only delete generate-data.ts and the build integration. | ✓ |
| Delete everything, rebuild in Phase 10 | Clean slate. Phase 10 may need different approaches. | |

**User's choice:** Keep csv-parser and scryfall client
**Notes:** None

---

## Data access layer shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single queries module (Recommended) | Create src/db/queries.ts with getCards(), getCardById(), getCardsMeta(). All pages import from one place. | ✓ |
| Inline in each page | Each page does its own Drizzle query directly. Simpler but duplicates query logic. | |
| You decide | Claude picks based on keeping it DRY. | |

**User's choice:** Single queries module
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Conversion inside queries.ts (Recommended) | getCards() returns Card[] with prices already in dollars. Callers never see cents. | ✓ |
| Separate mapper function | queries.ts returns raw DB rows, a toCard() mapper converts. More explicit but adds a layer. | |
| You decide | Claude picks based on simplicity. | |

**User's choice:** Conversion inside queries.ts
**Notes:** None

---

## Type compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Card as-is, map in queries | Card interface stays unchanged. queries.ts maps DB rows → Card objects, dropping DB-only fields. | |
| Extend Card with DB fields | Add scryfallId, createdAt, updatedAt to Card interface. Frontend ignores them but they're available. | ✓ |
| You decide | Claude picks based on zero visible changes requirement. | |

**User's choice:** Extend Card with DB fields
**Notes:** New fields will be optional so existing Card constructors don't break.

| Option | Description | Selected |
|--------|-------------|----------|
| Optional (Recommended) | scryfallId?: string | null, createdAt?: string, updatedAt?: string. Existing code doesn't break. | ✓ |
| Required | All Card objects must have these fields. More type-safe but more changes needed. | |

**User's choice:** Optional
**Notes:** None

---

## loadCardData replacement

| Option | Description | Selected |
|--------|-------------|----------|
| Delete and replace callers (Recommended) | Delete src/lib/load-cards.ts entirely. Each page/route imports from src/db/queries.ts directly. | ✓ |
| Rewrite in-place as async wrapper | Keep load-cards.ts but rewrite loadCardData() to call DB queries internally. | |
| You decide | Claude picks based on clean migration. | |

**User's choice:** Delete and replace callers
**Notes:** None

---

## Claude's Discretion

- Exact Drizzle query syntax and optimizations
- Async server component pattern (direct await vs separate data fetch)
- Whether to simplify the CardData wrapper type

## Deferred Ideas

None — discussion stayed within phase scope
