---
phase: 7
reviewers: [gemini, codex, opencode]
reviewed_at: 2026-04-11T18:00:00Z
plans_reviewed: [07-01-PLAN.md, 07-02-PLAN.md]
---

# Cross-AI Plan Review — Phase 7

## Gemini Review

### 1. Summary
The implementation plans are highly comprehensive, technically sound, and demonstrate strict adherence to the 16 locked implementation decisions (D-01 through D-16). By splitting the migration into two waves—first establishing the Data Access Layer (DAL) and UI components, then migrating the API and cleaning up legacy scripts—the strategy ensures a stable transition with minimal risk of a broken build. The inclusion of TDD for data mapping and a clear threat model indicates a high-quality engineering approach that prioritizes both correctness and security.

### 2. Strengths
* **Decision Adherence:** The plans explicitly implement all user decisions, particularly `force-dynamic` (D-01), the centralized `queries.ts` (D-04), and the specific error handling requirements (D-09/D-10).
* **Separation of Concerns:** Creating a dedicated `rowToCard` mapper in the DAL ensures that the frontend `Card` type remains canonical while abstracting database-specific details (cents-to-dollars conversion, timestamp formatting).
* **Surgical Cleanup:** Plan 07-02 correctly identifies all defunct files and build scripts for deletion, preventing "code rot" and simplifying the CI/CD pipeline.
* **Robust Error Handling:** The distinction between a generic "Store temporarily unavailable" for browse pages and a 503 "Unable to process order" for the API is a user-friendly way to handle database downtime.
* **Type Safety:** Extending the `Card` interface with optional DB fields (`scryfallId`, etc.) allows the storefront to remain backwards compatible while enabling future features.

### 3. Concerns
* **Inventory Scaling & Fetch Size (Severity: MEDIUM):**
    The plans for `getCards()` do not mention pagination or result limiting. If the "bulk" inventory grows to thousands of rows, fetching the entire table on every home page load (especially with `force-dynamic`) may lead to increased latency and Neon/Vercel execution time costs.
* **Serialization of Database Types (Severity: LOW):**
    Next.js Server Components require data passed to Client Components to be serializable. Plan 07-02 mentions Date-to-ISO conversion, which is crucial, but ensure this is strictly enforced in the `rowToCard` mapper for all timestamp fields to avoid hydration errors.
* **Race Conditions in "Live" Updates (Severity: LOW):**
    While `force-dynamic` ensures fresh data, there is a theoretical window where a user sees a card as "In Stock" but the stock is depleted by the time they hit the Checkout API. The plan correctly handles stock validation in the API (D-02), but a "Conflict" (409) or specific "Out of Stock" UI flow during checkout might be needed for the best UX.

### 4. Suggestions
* **Add Integration Tests:** While Plan 07-02 includes unit tests for the `rowToCard` mapper, consider adding a basic integration test that verifies `getCards()` actually executes the Drizzle query correctly.
* **Inventory Caching/Filtering:** Since the home page uses client-side filtering, consider if `getCards()` should accept basic filters to reduce the payload size.
* **Logging Context:** In the `try/catch` blocks (D-11), ensure the `console.error` includes the specific query or operation that failed to aid in debugging.

### 5. Risk Assessment
**Risk Level: LOW**

The risk is low because dependencies are well-managed, legacy JSON can be restored as cleanup is last, TypeScript catches mapping errors, and no high-stakes payments are involved.

---

## Codex Review

## Plan 07-01: Data Access Layer and Page Migration

### Summary
This is a good first wave. It targets the right server-side boundaries, keeps the client components mostly untouched, and aligns with the locked decisions around `queries.ts`, `force-dynamic`, and async pages. The main weakness is that it treats the DB swap as mostly mechanical, while the current storefront still has a few implicit contracts around `meta`, empty-state behavior, and stable results that are not called out.

### Strengths
- The query-module boundary is well chosen: `src/db/queries.ts` centralizes DB access, row mapping, and price conversion instead of spreading DB details through pages.
- Keeping the `Card` frontend shape canonical matches D-06 through D-08 and minimizes churn in cart, filters, and checkout clients.
- Migrating only the three server pages in wave 1 is the right cut. It preserves the existing client-side behavior while swapping the data source underneath.
- `dynamic = "force-dynamic"` on the storefront pages directly supports the "no rebuild needed" success criterion and is consistent with D-01 in this repo's Next 16 setup.
- The generic DB failure message and `console.error` logging are appropriately scoped for v1.1.

### Concerns
- **HIGH**: `getCardsMeta()` is underspecified relative to the current type contract. `card-grid.tsx` still expects `CardData["meta"]`, and `types.ts` currently defines `lastUpdated`, `totalCards`, `totalSkipped`, and `totalMissingPrices`. The plan only mentions `COUNT/MAX`, so it is unclear whether the type will be changed or those fields will be synthesized.
- **MEDIUM**: Empty inventory and DB outage are different states, but the plan only describes the outage path. `MAX(updated_at)` can be `null`, and the storefront needs a defined behavior when the cards table is valid but empty.
- **MEDIUM**: The plan does not define a deterministic ordering contract for `getCards()`. The filter store defaults to client-side `price-desc` sorting, so unstable DB row order will show up as jitter for price ties and `null` prices.
- **LOW**: The threat model mentions preventing `DATABASE_URL` leakage, but the plan does not mention marking `queries.ts` as server-only.

### Suggestions
- Define the exact storefront meta contract before implementation.
- Separate "inventory is empty" from "database is unavailable" in the page-level behavior.
- Give `getCards()` an explicit stable ordering, or at least a deterministic secondary sort for price ties.
- Add `import "server-only"` to `src/db/queries.ts` to enforce the server boundary.
- If `getCards()` and `getCardsMeta()` are both retained on the home page, fetch them in parallel.

## Plan 07-02: Checkout API, Tests, and Pipeline Cleanup

### Summary
The API migration itself is sensible, and putting cleanup after wave 1 is the right dependency order. The weak point is the cleanup scope: it removes the JSON generation path without accounting for the current seed workflow that still depends on `data/generated/cards.json`. The test plan also focuses too narrowly on the pure mapper and does not cover the higher-risk integration behavior.

### Strengths
- Moving the checkout route after page migration keeps runtime call sites ordered cleanly.
- Preserving stock validation, order building, and notification flow reduces regression risk in the most business-critical path.
- The proposed mapper tests cover the right data-conversion edge cases.
- Updating `package.json` to remove the prebuild generate step is consistent with the new DB-backed runtime model.

### Concerns
- **HIGH**: The cleanup plan breaks the current bootstrap/reseed path unless `src/db/seed.ts` is changed. `seed.ts` still requires `data/generated/cards.json` and tells developers to run `npm run generate`, so deleting `scripts/generate-data.ts` and `data/generated/` leaves a broken dev workflow.
- **MEDIUM**: The tests only cover `rowToCard()`. Critical functions like `getCards()`, `getCardById()`, `getCardsMeta()`, and the checkout route's 503 response have no tests.
- **MEDIUM**: The plan keeps checkout stock validation by calling `getCards()` for the full inventory on every POST. That is acceptable for a small bounded inventory, but it should be treated as an explicit small-store assumption.
- **LOW**: Calling the tests "TDD" is inconsistent with the stated dependency on 07-01.

### Suggestions
- Do not delete the JSON pipeline until either `seed.ts` is rewritten or the team explicitly accepts losing the current reseed path.
- Expand tests beyond the mapper: add query-layer tests and checkout route tests.
- Document the "bounded inventory" assumption.
- Clean up remaining stale references to generated JSON in comments and types.

### Risk Assessment
**MEDIUM-HIGH**. The route migration is low-complexity, but the cleanup as written can strand local provisioning, and the planned tests are not broad enough to catch integration regressions.

---

## OpenCode Review

## Plan 07-01: Data Access Layer and Page Migration

### Summary
Plan 07-01 creates a proper data access layer (`queries.ts`) and migrates three pages from static JSON loading to live database queries. The plan correctly follows the locked decisions but misses critical details about meta structure changes and pagination strategy.

### Strengths
- Clean separation with dedicated `rowToCard()` mapper function
- Price conversion (cents to dollars) isolated to one place (D-05)
- Proper async server component conversion with `force-dynamic` (D-01, D-16)
- User-friendly error messaging per D-09
- Addresses CardGrid empty state text referencing deleted `generate` script

### Concerns

| Severity | Issue |
|----------|-------|
| **HIGH** | **Meta structure mismatch**: `CardGrid` expects `meta: CardData["meta"]` with `lastUpdated`, `totalCards`, `totalSkipped`, `totalMissingPrices`. The DB schema has no `totalSkipped` or `totalMissingPrices`. Plan doesn't define what `getCardsMeta()` returns or how `CardGrid` adapts. |
| **MEDIUM** | **Pagination gap**: `getCards()` with no parameters returns all cards. For bulk MTG collections (potentially thousands of cards), this could cause memory/performance issues. No pagination or LIMIT strategy defined. |
| **MEDIUM** | **Revalidation unspecified**: D-01 requires `force-dynamic`, but no mention of `revalidateTag()` calls after admin writes. The success criteria says "updates reflected after revalidation" but the plan doesn't show how admin writes trigger this. |
| **LOW** | **`db/index.ts` may not exist**: The plan creates `src/db/queries.ts` but there's no barrel file. Need to verify import paths. |

### Suggestions
1. Define `CardGridMeta` interface containing only DB-computable fields
2. Add `LIMIT 1000` or pagination params to `getCards()`
3. Document revalidation strategy
4. Ensure `queries.ts` imports from `db/client.ts` directly

### Risk Assessment: **MEDIUM**

## Plan 07-02: Checkout API, Tests, and Pipeline Cleanup

### Summary
Plan 07-02 migrates the checkout API to database queries, adds unit tests for the queries module, and cleans up defunct build pipeline files. The plan correctly removes the static data dependency but under-tests critical business logic.

### Strengths
- Checkout API gets proper 503 error handling per D-10
- Correct cleanup of files per D-12, D-13, D-15
- Preserves `csv-parser.ts` and `scryfall.ts` for Phase 10 (D-14)
- Build script simplified to single command
- TDD approach mentioned for test creation

### Concerns

| Severity | Issue |
|----------|-------|
| **HIGH** | **Insufficient test coverage**: Only `rowToCard` is tested. Critical functions like `getCards()`, `getCardById()`, and `getCardsMeta()` have no tests. |
| **MEDIUM** | **Checkout has no order persistence**: The checkout API validates stock, sends emails, but doesn't write to the `orders` table. |
| **MEDIUM** | **Cleanup ordering risk**: The plan deletes `load-cards.ts` but checkout API migration might not be complete yet. |
| **LOW** | **Email failure = lost order**: If stock validation passes but `notifyOrder()` fails, the order is rejected with no database record. |

### Suggestions
1. Add tests for `getCards()`, `getCardById()`, `getCardsMeta()` with mocked DB
2. Add test for checkout route 503 on DB failure
3. Add a TODO comment for future order persistence
4. Verify deletion happens AFTER checkout route uses queries.ts

### Risk Assessment: **MEDIUM**

---

## Consensus Summary

### Agreed Strengths
- **Centralized data access layer** (all 3): `queries.ts` as single module with `rowToCard` mapper is well-designed and follows locked decisions
- **Proper error handling** (all 3): Distinct user messages for browse vs checkout failures, console.error logging
- **Wave ordering** (all 3): Cleanup last (Wave 2) preserves rollback path; dependency structure is correct
- **Type safety** (Gemini + Codex): Canonical Card interface preserved, optional DB fields added non-breaking

### Agreed Concerns
- **Meta structure contract unclear** (Codex HIGH + OpenCode HIGH): `getCardsMeta()` must return `CardData["meta"]` shape including `totalSkipped` and `totalMissingPrices` — plan says these are 0 constants but doesn't clearly address the type contract in CardGrid
- **Test coverage too narrow** (Codex MEDIUM + OpenCode HIGH): Only `rowToCard` is tested; `getCards()`, `getCardById()`, `getCardsMeta()` and checkout 503 behavior have no tests
- **Pagination / unbounded getCards()** (Gemini MEDIUM + OpenCode MEDIUM): Full table scan on every page load; acceptable for ~136 cards but needs explicit "small-store" assumption
- **Seed workflow breakage** (Codex HIGH): Deleting `data/generated/` and `generate-data.ts` may break `seed.ts` if it depends on those files

### Divergent Views
- **Overall risk level**: Gemini rates LOW (citing rollback safety), Codex rates MEDIUM-HIGH (citing seed breakage), OpenCode rates MEDIUM (citing meta mismatch)
- **Revalidation strategy**: OpenCode flags admin write propagation as unclear; Gemini and Codex don't raise this (likely because `force-dynamic` makes revalidation unnecessary — every request hits DB fresh)
- **Order persistence**: OpenCode mentions checkout should write to orders table; others accept this is out of scope for Phase 7 (Phase 11 handles it)
- **Server-only import**: Codex suggests `import "server-only"` for queries.ts boundary enforcement; others don't raise it
