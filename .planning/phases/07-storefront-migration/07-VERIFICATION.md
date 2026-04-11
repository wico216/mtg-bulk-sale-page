---
phase: 07-storefront-migration
verified: 2026-04-11T15:25:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Load the storefront home page and verify cards display from the database"
    expected: "Card grid renders with card images, names, prices, and all metadata identical to pre-migration appearance"
    why_human: "Visual parity cannot be verified programmatically -- requires comparing layout and rendered data"
  - test: "Use search, color filter, set filter, rarity filter, and sort options on the storefront"
    expected: "All filtering and sorting features work identically to pre-migration behavior"
    why_human: "Client-side interactive behavior requires browser testing"
  - test: "Add items to cart, navigate to cart page, then checkout page"
    expected: "Cart and checkout pages load card data from DB with no visible difference from previous static JSON behavior"
    why_human: "End-to-end user flow across multiple pages requires human interaction"
  - test: "Submit a test checkout order"
    expected: "Order processes successfully with email notifications, stock validation works against live DB"
    why_human: "Full checkout flow involves external email service and real DB write path"
---

# Phase 7: Storefront Migration Verification Report

**Phase Goal:** Friends browse and shop from live database inventory with zero visible changes to the storefront experience
**Verified:** 2026-04-11T15:25:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The storefront home page loads card data from the database (not static JSON) | VERIFIED | `src/app/page.tsx` imports `getCards, getCardsMeta` from `@/db/queries` (line 4). Uses `await Promise.all([getCards(), getCardsMeta()])` (line 10). `export const dynamic = "force-dynamic"` (line 6). No import of `loadCardData` or `load-cards` anywhere in src/. |
| 2 | All existing storefront features work identically: browse, search, filter, sort, cart, checkout | VERIFIED (code-level) | All 4 data sources (home, cart, checkout pages + checkout API) now import from `@/db/queries`. `getCards()` returns `Card[]` with same interface shape. CardGrid, FilterBar, CartPageClient, CheckoutClient receive same prop types. TypeScript compiles cleanly. Zero type errors. Functional parity verified at code level -- visual parity requires human testing. |
| 3 | Card data updates in the database are reflected on the storefront after revalidation (no rebuild needed) | VERIFIED | All pages use `export const dynamic = "force-dynamic"` which forces server-side rendering on every request. No caching layer. Database queries execute per-request. Build script is now `"next build"` with no generate step. |
| 4 | getCards() returns Card[] with prices in dollars (not cents), ordered by name ASC | VERIFIED | `src/db/queries.ts` line 29: `row.price !== null ? row.price / 100 : null`. Line 48: `orderBy(asc(cards.name))`. Unit tests confirm: 1299->12.99, 0->0, null->null, 99999->999.99. |
| 5 | getCardById() returns a single Card or null | VERIFIED | `src/db/queries.ts` lines 56-63: queries with `eq(cards.id, id).limit(1)`, returns `rowToCard(rows[0])` or `null`. |
| 6 | getCardsMeta() returns CardData["meta"] shape exactly | VERIFIED | `src/db/queries.ts` lines 70-84: Return type annotated as `Promise<CardData["meta"]>`. Returns `{ lastUpdated, totalCards, totalSkipped: 0, totalMissingPrices: 0 }`. Unit tests verify all 4 fields present with correct types. |
| 7 | Home, cart, checkout pages query DB on every request (no static JSON) | VERIFIED | All 3 pages: `export const dynamic = "force-dynamic"`, `export default async function`, `await getCards()`. Zero references to `loadCardData` or `load-cards` in src/. |
| 8 | DB connection failure shows "Store temporarily unavailable, try again soon." | VERIFIED | All 3 pages have try/catch with `console.error("[HOME/CART/CHECKOUT] Database error:", error)` and render `"Store temporarily unavailable, try again soon."` in error shell. |
| 9 | Empty inventory (0 cards, DB reachable) shows "No cards available yet." | VERIFIED | `src/components/card-grid.tsx` lines 49-57: `if (cards.length === 0)` renders "No cards available yet." No reference to "npm run generate". |
| 10 | Checkout API validates stock against live database (not static JSON) | VERIFIED | `src/app/api/checkout/route.ts` line 2: `import { getCards } from "@/db/queries"`. Line 37: `cards = await getCards()`. Inner try/catch at lines 36-44 for DB errors. |
| 11 | Checkout API returns 503 with DB error message | VERIFIED | `src/app/api/checkout/route.ts` lines 40-43: returns `Response.json({ success: false, error: "Unable to process order right now, please try again" }, { status: 503 })`. |
| 12 | load-cards.ts, generate-data.ts deleted; csv-parser.ts, scryfall.ts preserved | VERIFIED | `src/lib/load-cards.ts` does not exist. `scripts/generate-data.ts` does not exist. `src/lib/csv-parser.ts` exists. `src/lib/scryfall.ts` exists. `data/generated/` exists on disk but is gitignored and never tracked -- no functional code references it. |
| 13 | Build succeeds with "next build" only (no generate-data.ts step) | VERIFIED | `package.json` line 7: `"build": "next build"`. No `"generate"` script. `npx tsc --noEmit` exits 0. All 31 tests pass. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/queries.ts` | Data access layer with getCards, getCardById, getCardsMeta, rowToCard | VERIFIED | 85 lines, all 4 exports present, `import "server-only"`, cents-to-dollars conversion, orderBy ASC |
| `src/lib/types.ts` | Extended Card interface with scryfallId, createdAt, updatedAt | VERIFIED | Lines 49-51: `scryfallId?: string \| null`, `createdAt?: string`, `updatedAt?: string` |
| `src/app/page.tsx` | Async server component querying DB | VERIFIED | 34 lines, `force-dynamic`, async Home(), getCards+getCardsMeta, try/catch error handling |
| `src/app/cart/page.tsx` | Async server component querying DB | VERIFIED | 36 lines, `force-dynamic`, async CartPage(), getCards, try/catch error handling |
| `src/app/checkout/page.tsx` | Async server component querying DB | VERIFIED | 36 lines, `force-dynamic`, async CheckoutPage(), getCards, try/catch error handling |
| `src/app/api/checkout/route.ts` | Checkout API route using DB queries | VERIFIED | 91 lines, imports getCards from @/db/queries, inner DB try/catch with 503, stock validation against live data |
| `src/db/__tests__/queries.test.ts` | Unit tests for rowToCard and getCardsMeta | VERIFIED | 168 lines, 9 rowToCard tests + 3 getCardsMeta tests, all 12 pass |
| `src/db/seed.ts` | Updated seed without data/generated dependency | VERIFIED | No readFileSync/existsSync, no functional reference to data/generated/cards.json, cardToRow kept for tests |
| `package.json` | Build script: "next build" only | VERIFIED | `"build": "next build"`, no "generate" script, db:seed still present |
| `src/components/card-grid.tsx` | Updated empty state copy | VERIFIED | Line 53: "No cards available yet." -- no "npm run generate" reference |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/db/queries.ts | src/db/client.ts | `import { db } from "@/db/client"` | WIRED | Pattern found in source (line 4) |
| src/db/queries.ts | src/db/schema.ts | `import { cards } from "@/db/schema"` | WIRED | Pattern found in source (line 5) |
| src/app/page.tsx | src/db/queries.ts | `import { getCards, getCardsMeta } from "@/db/queries"` | WIRED | Pattern found in source (line 4) |
| src/app/cart/page.tsx | src/db/queries.ts | `import { getCards } from "@/db/queries"` | WIRED | Pattern found in source (line 3) |
| src/app/checkout/page.tsx | src/db/queries.ts | `import { getCards } from "@/db/queries"` | WIRED | Pattern found in source (line 3) |
| src/app/api/checkout/route.ts | src/db/queries.ts | `import { getCards } from "@/db/queries"` | WIRED | Pattern found in source (line 2) |
| src/db/__tests__/queries.test.ts | src/db/queries.ts | `import { rowToCard } from "../queries"` | WIRED | Pattern found in source (line 13) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| src/app/page.tsx | cards, meta | getCards(), getCardsMeta() | DB query via `db.select().from(cards)` and aggregate COUNT/MAX | FLOWING |
| src/app/cart/page.tsx | cards | getCards() | DB query via `db.select().from(cards)` | FLOWING |
| src/app/checkout/page.tsx | cards | getCards() | DB query via `db.select().from(cards)` | FLOWING |
| src/app/api/checkout/route.ts | cards | getCards() | DB query via `db.select().from(cards)` | FLOWING |
| src/components/card-grid.tsx | cards prop | Received from page.tsx | Props passed with real DB data (not hardcoded empty) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles | `npx tsc --noEmit` | Exit 0, no errors | PASS |
| All tests pass | `npx vitest run --reporter=verbose` | 31 tests pass (3 files: schema 12, seed 7, queries 12) | PASS |
| No loadCardData references in src/ | `grep -r "loadCardData\|load-cards" src/` | Zero matches | PASS |
| Build script is "next build" | grep package.json | `"build": "next build"` confirmed | PASS |
| load-cards.ts deleted | `ls src/lib/load-cards.ts` | "No such file or directory" | PASS |
| generate-data.ts deleted | `ls scripts/generate-data.ts` | "No such file or directory" | PASS |
| csv-parser.ts preserved | `ls src/lib/csv-parser.ts` | File exists | PASS |
| scryfall.ts preserved | `ls src/lib/scryfall.ts` | File exists | PASS |
| Commits verified | `git log --oneline` for bc264b0, 9d5ba4c, 6292b1d, d548f2d, 9bdb866 | All 5 commits exist | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DB-03 | 07-01, 07-02 | Storefront reads card data from database instead of static JSON | SATISFIED | All 4 data sources (3 pages + checkout API) import from `src/db/queries.ts`. Zero references to `loadCardData` or static JSON remain in src/. Build script simplified to `"next build"`. Tests verify query contract. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No TODO, FIXME, placeholder, or stub patterns found in any modified file |

### Human Verification Required

### 1. Visual Parity Check

**Test:** Load the storefront home page in a browser and verify cards display correctly from the database.
**Expected:** Card grid renders with card images, names, prices, condition badges, quantity, and all metadata. Layout, spacing, and appearance are identical to pre-migration behavior.
**Why human:** Visual rendering cannot be verified programmatically -- requires comparing rendered output against expected appearance.

### 2. Interactive Feature Parity

**Test:** Use search, color filter (WUBRG), set filter, rarity filter, and sort options on the storefront. Click a card to open detail modal.
**Expected:** All filtering, sorting, and modal features work identically to pre-migration behavior. No jitter or unexpected re-rendering.
**Why human:** Client-side interactive behavior requires browser testing with real user interaction.

### 3. Cart and Checkout Flow

**Test:** Add items to cart, navigate to cart page, adjust quantities, proceed to checkout page, verify order summary.
**Expected:** Cart persists across page refreshes, checkout page loads card data from DB, order summary is accurate.
**Why human:** End-to-end user flow across multiple pages requires human interaction and visual confirmation.

### 4. Checkout Submission

**Test:** Submit a test checkout order with valid buyer info.
**Expected:** Order processes successfully, seller receives notification email, buyer receives confirmation email, stock validation works against live database inventory.
**Why human:** Full checkout flow involves external email service (Resend) and requires verifying email delivery.

### Gaps Summary

No code-level gaps found. All 13 observable truths verified through static analysis, grep-based verification, and automated test results. All artifacts exist, are substantive, and are properly wired. All key links verified. All 31 tests pass and TypeScript compiles cleanly.

Four human verification items remain to confirm visual parity and end-to-end interactive behavior, which cannot be tested programmatically. These are standard for a migration phase where the goal includes "zero visible changes."

---

_Verified: 2026-04-11T15:25:00Z_
_Verifier: Claude (gsd-verifier)_
