# Phase 20: Storefront Aggregation & Cart Migration - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Storefront listings aggregate `SUM(quantity) GROUP BY (setCode, collectorNumber, finish, condition)` so buyers see one row per logical card with the total stock across all binders. `PublicCard` (no binder field) and `AdminCard` (with binder field) split at the type level so TypeScript catches binder leaks to public surfaces at compile time. v1.2 buyer carts (4-segment composite keys) silently reconcile forward to v1.3 aggregated keys via the existing Phase 10-03 reconciliation pattern, plus a one-time informational toast on first v1.3 visit.

</domain>

<decisions>
## Implementation Decisions

### Aggregation query (locked by architecture)
- **D-01:** New `getCardsAggregated()` in `src/db/queries.ts`:
  ```sql
  SELECT
    set_code || '-' || collector_number || '-' || finish || '-' || condition AS id,
    set_code, collector_number, name, image_url, color_identity,
    finish, condition,
    SUM(quantity) AS quantity,
    AVG(price)::int AS price,             -- planner verifies this rounding
    array_agg(DISTINCT binder ORDER BY binder ASC) AS binders,  -- ADMIN-only field; stripped before public response
    MAX(rarity) AS rarity,                 -- consistent across rows for same logical card
    MAX(oracle_text) AS oracle_text
  FROM cards
  GROUP BY set_code, collector_number, name, image_url, color_identity, finish, condition
  ```
- **D-02:** Performance: 12,749 rows × 30 binders ≈ 382k rows worst case; Postgres hash aggregate completes in single-digit ms (per ARCHITECTURE research). NO materialized view needed. Verify with `EXPLAIN ANALYZE` during planning if anyone is paranoid; otherwise, ship.
- **D-03:** `app/page.tsx` swaps `getCards()` → `getCardsAggregated()`. `app/cart/page.tsx` and `app/checkout/page.tsx` KEEP `getCards()` (they need disaggregated rows for cart-side display + checkout-side allocator input).
- **D-04:** Aggregation aggregates `price` as the AVERAGE across binders (rounded). Justification: binders may have inadvertently different prices for the same logical card (e.g., operator manually edited one binder's price); the buyer sees a single price; AVG is the safest middle ground. Alternative (MIN, MAX, MODE) bias-on each side; AVG is neutral. If the operator notices a rounding-down issue post-deploy, they can normalize prices via admin edit. Planner verifies AVG is the most defensible choice or proposes alternative.

### Type split for binder leak prevention (locked by PITFALLS Pitfall 6 / I-DISC-05)
- **D-05:** `src/lib/types.ts` declares TWO Card interfaces:
  ```ts
  export interface PublicCard {
    id: string;             // 4-segment aggregated id
    setCode: string;
    collectorNumber: string;
    name: string;
    imageUrl: string;
    colorIdentity: string[];
    finish: 'normal' | 'foil' | 'etched';
    condition: Condition;
    quantity: number;
    price: number;
    rarity: Rarity;
    oracleText?: string;
    // NO `binder` field. NO `binders` field.
  }
  
  export interface AdminCard extends PublicCard {
    binders: string[];      // distinct binders for this aggregated key (from D-01)
  }
  ```
- **D-06:** Public route handlers and storefront components type their data as `PublicCard[]`. Admin route handlers and admin components type as `AdminCard[]`. TypeScript at compile time prevents `binders` from sneaking into a public-facing response. **This is the load-bearing privacy guarantee for v1.3.**
- **D-07:** Per-route invariant tests for `GET /`, `GET /cart`, `POST /api/checkout` (success and stock_conflict shapes). Test asserts `JSON.stringify(response).includes('binder') === false`. Belt-and-suspenders against runtime leak even if a future code change breaks the type split.

### Cart reconciliation (locked by ARCHITECTURE Q4)
- **D-08:** Extend the existing Phase 10-03 silent reconciliation `useEffect` at `src/app/cart/cart-page-client.tsx:38-47`. Two new lines BEFORE the existing silent-removal fallback:
  1. **Segment-strip:** if cart key has 5 segments (v1.2 was 4; v1.3 buyer-facing is also 4 BUT during the migration window users might have v1.2's "we used to embed binder somewhere" remnants — defensive strip)
  2. **Quantity transfer + clamp:** find the aggregated candidate in `cardMap` (keyed by 4-segment id); if present, transfer the stale-key quantity into the aggregated entry; clamp final quantity to `cardMap[id].quantity` (current stock)
- **D-09:** **Existing silent-removal fallback preserved.** If no aggregated candidate found, drop the item silently (matches Phase 10 D-13 pattern). The buyer experiences the migration as "my cart looks the same" (with maybe 1-2 items quietly removed if they were stale).
- **D-10:** **NOT a Zustand `migrate` hook.** PITFALLS Pitfall 5: zustand migrate runs at hydration time without access to `cardMap`. The existing `useEffect` reconciliation IS the right extension point because it sees both the persisted state AND the live `cardMap`.
- **D-11:** Binder name normalization (Phase 17 D-03) replaces `-` with `_` in binder names at parse time. This guarantees the segment-strip in D-08 step 1 is unambiguous: hyphen is the segment delimiter; binder names contain no hyphens; stripping the trailing `-{token}` always strips a binder, never part of a binder name.

### Cart migration UX (auto-mode)
- **D-12:** ONE-TIME informational toast on first v1.3 visit:
  > "We updated your cart for our improved inventory system. If anything looks off, give it a refresh."
  Friendly tone; non-alarmist; gives the buyer the "refresh" mental model if anything is wrong.
- **D-13:** Persist `viki-cart-version: '1.3'` in localStorage as a sentinel. Toast fires when sentinel is missing OR < `1.3` (semver compare not needed; string compare suffices since we ship one version at a time). After firing, set sentinel to `1.3`.
- **D-14:** **NO per-item toast** for individually dropped/clamped items. Operator-side reasoning: an entire-cart toast covers the user mental model; per-item toasts would be UI noise (and might leak info about WHY each item was dropped).
- **D-15:** Empty cart edge case: if reconciliation results in zero items, the same one-time toast fires + the cart page renders the existing empty state. No special "your cart was emptied" toast.

### Storefront component changes (planner derives specifics)
- **D-16:** `app/page.tsx` and the catalog component type their data as `PublicCard[]`. Reads `card.quantity` (now a SUM); reads `card.price` (now AVG); `card.id` is the aggregated 4-segment id used as React key.
- **D-17:** No changes to filter/sort logic in the catalog — filters work on `setCode`, `condition`, `finish`, `colorIdentity` (all preserved on `PublicCard`).
- **D-18:** Cart UI shows `card.binders` ONLY if the cart-item is in admin context (which it never is — cart is buyer-facing). So no UI changes for binder display in the cart.

### Claude's Discretion
- Exact toast styling (use existing toast system from Phase 10/13 or add minimal new component)
- Whether to bundle the type split into the same PR as the aggregation query change (likely yes — they're tightly coupled)
- AVG-vs-MIN price aggregation (planner reconsiders if AVG produces noticeably weird results in tests)
- The `binders: string[]` field on AdminCard — whether to materialize it in the same `getCardsAggregated` call or have a separate admin-only `getAdminCardsAggregated` (D-01 chose the former; planner can split if testing shows it bloats the public-facing query unnecessarily)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Research outputs (this milestone)
- `.planning/research/PITFALLS.md` — **Pitfall 5 (cart-key migration silent empty)**; **Pitfall 6 (binder leak via API/email/log)**; Pitfall 11 (stock changes mid-cart — clamp to current)
- `.planning/research/ARCHITECTURE.md` — Q2 (storefront aggregation SQL); Q4 (cart-key migration extending Phase 10-03 reconciliation, NOT zustand migrate)
- `.planning/research/SUMMARY.md` — Phase 20 section; PublicCard/AdminCard type split

### Prior phase context
- `.planning/phases/16-schema-migration/16-CONTEXT.md` — `binder` column + 5-segment cards.id
- `.planning/phases/17-parser-etched/17-CONTEXT.md` — `normalizeBinderName` (D-03 hyphen-to-underscore) makes the cart-key segment-strip safe
- `.planning/phases/18-allocator/18-CONTEXT.md` — `StockConflict.cardId` is the aggregated id (matches PublicCard.id format)
- `.planning/phases/19-import-preview-picker/19-CONTEXT.md` — independent of this phase but both consume Phase 16's binder column

### Existing codebase patterns to mirror / extend
- `src/db/queries.ts` `getCards()` — current query; Phase 20 keeps it for cart/checkout, adds `getCardsAggregated()` alongside
- `src/app/cart/cart-page-client.tsx:38-47` — Phase 10-03 D-13 silent-reconciliation `useEffect`; Phase 20 EXTENDS with the segment-strip + quantity-transfer-and-clamp branch
- `src/lib/store/cart-store.ts:67` — zustand persist key `viki-cart`; Phase 20 adds `viki-cart-version: '1.3'` sentinel
- `src/lib/types.ts` — current `Card` interface; Phase 20 splits into `PublicCard` and `AdminCard`
- `src/app/page.tsx` — server-rendered catalog; type signature flips to `PublicCard[]`
- Phase 13 toast pattern (success message after order workflow update) — reuse for the one-time cart migration toast

### Project docs
- `.planning/REQUIREMENTS.md` — AGG-01..03 are this phase's requirements
- `.planning/PROJECT.md` — "Storefront unchanged for buyers — listings aggregate quantity across binders; binder hidden from public pages" + "Cart entries from v1.2 keys reconcile silently into v1.3 aggregated keys (or are silently removed)" — Current Milestone targets

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/queries.ts` `getCards()` shape — direct template for `getCardsAggregated()`; same return columns plus `binders: string[]` for admin
- `cart-page-client.tsx:38-47` reconciliation `useEffect` — the exact extension point
- Phase 10-03 D-13 silent reconciliation pattern — the existing precedent for "drop unmatchable cart items quietly"
- `cart-store.ts` zustand persist Map serializer — uses a custom `partialize`; same pattern works for the new version sentinel

### Established Patterns
- **Server-rendered catalog** (`app/page.tsx`) — async server component reading from DB; Phase 20 keeps this shape, just changes the read function
- **Cart is client-side state** (`cart-store.ts`) — zustand with localStorage persist; reconciliation runs in `useEffect` on mount
- **Type discipline at the route boundary** — Public routes return shapes that buyer-facing code depends on; admin routes return strictly-typed admin shapes. Phase 20 enforces this at compile time with the split.

### Integration Points
- **Phase 16** (already discussed) — schema with binder column ready
- **Phase 17** (already discussed) — `normalizeBinderName` makes segment-strip safe
- **Phase 18** (already discussed) — `StockConflict.cardId` matches `PublicCard.id` (aggregated 4-segment); contract preserved
- **Phase 19** (already discussed) — independent; both write/read on the same `cards.binder` rows
- **Phase 21** (Admin Visibility & Audit) — consumes `AdminCard.binders` for the inventory table column + filter dropdown
- **Phase 22** (Hardening & UAT) — verifies the per-route binder-leak invariant tests pass; STRIDE delta documents I-DISC-05

</code_context>

<specifics>
## Specific Ideas

- The **`PublicCard`/`AdminCard` type split** is the most important architectural decision in v1.3 from a privacy/security standpoint. Without it, ANY future code change could leak binder names by typing data as `Card` (the old combined type) and serializing to a public response. The split makes leak prevention a compile error, not a runtime test that someone might forget to write.
- The cart migration toast is **friendly, not technical**. Buyers don't know what "binders" or "schema migration" mean. The toast says "we updated your cart for our improved inventory system" — gives them the mental model that something might be slightly different + an action ("refresh if it looks off") to recover.
- The `viki-cart-version` sentinel is forward-looking: future migrations bump the sentinel, fire the same toast (or a version-specific one). The infrastructure is in place even if no future migration ever uses it.
- **Performance: 12,749 cards × ~3 average binders/card** ≈ 38k underlying rows aggregating to ~12k distinct logical cards. Postgres hash-aggregate is sub-50ms. If for some reason the operator's collection grows 10x, revisit (materialized view).

</specifics>

<deferred>
## Deferred Ideas

- **Per-binder stock display on storefront** ("Lightning Bolt — 3 in A02, 2 in A05") — explicitly REJECTED per AGG-02 + Phase 16 D-10 + earlier user choice "Admin-only — buyers never see binder names". Not deferred; rejected.
- **Materialized view for storefront aggregation** — explicitly NOT NEEDED at current scale; revisit at 100k+ logical cards
- **Per-item cart-migration toast** — explicitly rejected per D-14 (UI clutter + leaks WHY each item dropped)
- **`getAdminCardsAggregated` separate from `getCardsAggregated`** — D-01 keeps them merged; planner can split if testing shows performance issue from materializing `binders[]` array on every public read

</deferred>

---

*Phase: 20-Storefront Aggregation & Cart Migration*
*Context gathered: 2026-05-11*
