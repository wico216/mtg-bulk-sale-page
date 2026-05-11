# Phase 20: Storefront Aggregation & Cart Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Phase:** 20-Storefront Aggregation & Cart Migration
**Areas discussed:** Cart hydration UX, Cart version sentinel, Type split file structure, Aggregation query shape (binders[] field), Empty-cart edge case
**Mode:** Auto (decisions made by Claude per auto-mode directive)

---

## Cart hydration UX

| Option | Selected |
|--------|----------|
| Silent clamp + ONE-TIME informational toast on first v1.3 visit | ✓ |
| Silent clamp every time, no toast | |
| Per-item toast for each dropped/clamped item | |
| Hard reset cart on first v1.3 visit | |

**Decision rationale:** Friendly buyer mental model + recoverable ("if anything looks off, refresh"). Per-item toast clutters; silent-only leaves users wondering what happened.

---

## Cart version sentinel

| Option | Selected |
|--------|----------|
| `viki-cart-version: '1.3'` in localStorage; bumped on each migration | ✓ |
| Track in zustand state with persist | |
| No tracking; rely on cart-key shape detection | |

**Decision rationale:** Forward-looking; future migrations reuse the pattern.

---

## Type split file structure

| Option | Selected |
|--------|----------|
| Single `src/lib/types.ts` with `PublicCard` + `AdminCard` interfaces | ✓ |
| Separate files (`src/lib/types/public-card.ts`, `src/lib/types/admin-card.ts`) | |
| Single `Card` with optional binders + runtime stripping | |

**Decision rationale:** Single file matches existing project convention. Optional `binders` defeats the compile-time guarantee.

---

## Aggregation query shape (binders[] field)

| Option | Selected |
|--------|----------|
| Single `getCardsAggregated()` returns `binders: string[]`; PublicCard type omits it | ✓ |
| Two separate functions `getCardsAggregated()` (public, no binders) + `getAdminCardsAggregated()` (with binders) | |

**Decision rationale:** Same query shape; type system strips for public consumers. Single source of truth. Planner can split later if performance shows the array materialization is wasteful for public reads.

---

## Empty-cart edge case

| Option | Selected |
|--------|----------|
| Falls under same one-time toast; no special handling | ✓ |
| Special "your cart was emptied" toast | |
| Redirect to /cart with explanation modal | |

**Decision rationale:** General toast covers the case; modals are too heavy for an edge.

---

## Claude's Discretion

- Toast styling (use existing system or add minimal new component)
- PR bundling (likely combine type split + aggregation query in same commit)
- AVG-vs-MIN-vs-MAX price aggregation
- Whether to materialize `binders[]` in the public query or split

## Deferred Ideas

- Per-binder stock display on storefront → explicitly REJECTED per AGG-02 + earlier user choice
- Materialized view → not needed at current scale; revisit at 100k+ logical cards
- Per-item cart-migration toast → rejected
