---
phase: 07-storefront-migration
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - package.json
  - src/app/api/checkout/route.ts
  - src/app/cart/page.tsx
  - src/app/checkout/page.tsx
  - src/app/page.tsx
  - src/components/card-grid.tsx
  - src/db/queries.ts
  - src/db/seed.ts
  - src/db/__tests__/queries.test.ts
  - src/lib/types.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-11T12:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the storefront source files covering the main pages (home, cart, checkout), the checkout API route, the database query layer, the seed script, types, and tests. The codebase is generally well-structured with good error handling patterns -- all server components have try/catch with user-friendly fallback UI, the checkout route validates required fields, and the notification layer correctly prioritizes seller emails.

Key concerns: (1) The checkout API route performs an unsafe type cast on the request body without validating individual item fields, which allows malformed payloads to bypass stock validation and potentially cause downstream errors. (2) The order reference generator produces minute-resolution timestamps that can collide under concurrent requests. (3) Minor issues around input validation gaps and dead code.

## Critical Issues

### CR-01: Checkout API does not validate item field types within the items array

**File:** `src/app/api/checkout/route.ts:9`
**Issue:** The request body is cast with `as CheckoutRequest` (line 9) and while `buyerName`, `buyerEmail`, and the `items` array are validated at a high level, the individual items within the array are never validated for correct types. A malicious client could send `{ cardId: 123, quantity: "abc" }` or `{ cardId: null, quantity: -1 }`. The `item.quantity > card.quantity` comparison (line 53) would produce unexpected results with non-numeric types (e.g., `"abc" > 3` is `false` in JS, so it silently passes). Similarly, `item.cardId` is used as a Map lookup key without checking it is a string, and `item.quantity <= 0` (line 55) returns `false` for `"abc"`, allowing the item to pass all stock checks uncaught. This could lead to malformed order data being emailed to the seller.
**Fix:** Add item-level validation before the stock-check loop:

```typescript
// After line 22 (items array check), add:
for (const item of body.items) {
  if (typeof item.cardId !== "string" || !item.cardId.trim()) {
    return Response.json(
      { success: false, error: "Each item must have a valid cardId" },
      { status: 400 },
    );
  }
  if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    return Response.json(
      { success: false, error: `Invalid quantity for card "${item.cardId}"` },
      { status: 400 },
    );
  }
}
```

This also allows the `item.quantity <= 0` check on line 55 to be removed from the stock loop since it becomes redundant.

## Warnings

### WR-01: Order reference collision risk under concurrent requests

**File:** `src/lib/order.ts:20-24` (called from `src/app/api/checkout/route.ts:64`)
**Issue:** `generateOrderRef()` produces references with minute-level granularity (format `ORD-YYYYMMDD-HHMM`). Two orders placed within the same minute will receive identical `orderRef` values. Per `src/db/schema.ts:65`, `orders.id` is a text primary key -- a duplicate orderRef would cause a database constraint violation if/when orders are persisted to the DB. Currently orders are only emailed (not written to the orders table), so this is not an active crash, but it is a latent bug that will surface when the orders table is populated.
**Fix:** Append a random suffix to ensure uniqueness:

```typescript
export function generateOrderRef(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 16).replace(":", "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${date}-${time}-${rand}`;
}
```

Or use seconds + milliseconds for finer granularity, though random suffix is more robust.

### WR-02: Non-null assertion on DATABASE_URL without runtime check

**File:** `src/db/client.ts:4`
**Issue:** `process.env.DATABASE_URL!` uses a non-null assertion. If the environment variable is missing, this passes `undefined` to `drizzle()` which will produce a confusing runtime error deep in the Neon driver rather than a clear, early failure. The checkout route (line 25-32) already demonstrates the pattern of checking env vars before use, but this module-level initialization has no such guard.
**Fix:** Add a runtime check:

```typescript
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
export const db = drizzle(databaseUrl, { schema });
```

### WR-03: Checkout request.json() type assertion hides shape mismatches

**File:** `src/app/api/checkout/route.ts:9`
**Issue:** `(await request.json()) as CheckoutRequest` is a bare type assertion that provides no runtime guarantees. While downstream checks validate some fields, `body.message` (optional string) is passed through to `buildOrderData` without any type or sanitization check. A non-string value (e.g., `message: { toString: "..." }`) would flow into the order data and email templates. The `escapeHtml` function in `order.ts` expects a string and would throw on non-string input if `message` is used in email rendering.
**Fix:** Add a type guard for optional fields after the existing validations:

```typescript
if (body.message !== undefined && typeof body.message !== "string") {
  return Response.json(
    { success: false, error: "Message must be a string" },
    { status: 400 },
  );
}
```

## Info

### IN-01: Exported `cardToRow` function in seed script is effectively dead code

**File:** `src/db/seed.ts:13-30`
**Issue:** The `cardToRow` function is exported and the comment at line 12 says "Exported for unit testing," but the seed script's `seed()` function no longer performs any seeding -- it only verifies database connectivity. The `cardToRow` function is not imported by any test file currently (`queries.test.ts` tests `rowToCard`, not `cardToRow`). This is dead code that could mislead future developers.
**Fix:** Either remove `cardToRow` entirely, or if it will be needed for a future Phase 10 CSV import, add a comment clarifying its intended future use and consider moving it to a shared utility module.

### IN-02: Lightbox URL replacement assumes Scryfall image URL structure

**File:** `src/components/card-grid.tsx:89`
**Issue:** `.replace("/normal/", "/large/")` is used to construct the lightbox URL from the card's `imageUrl`. If the URL structure from Scryfall changes or a card has a non-standard URL, the replacement is a no-op and the lightbox shows the normal-resolution image. This is benign (graceful degradation) but worth documenting as an assumption.
**Fix:** No code change required. Consider adding a comment:

```typescript
// Scryfall image URLs use /normal/ and /large/ path segments; if pattern
// doesn't match, falls back to showing the original (normal) image.
setLightboxUrl(selectedCard.imageUrl.replace("/normal/", "/large/"));
```

---

_Reviewed: 2026-04-11T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
