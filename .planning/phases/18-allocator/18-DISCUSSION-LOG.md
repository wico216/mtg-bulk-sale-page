# Phase 18: Allocator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-11
**Phase:** 18-Allocator
**Areas discussed:** Pick order, Fulfillment semantics, Multi-binder split visibility, CHECK violation HTTP code, Audit log binder breakdown
**Mode:** Auto (decisions made by Claude per auto-mode directive; no AskUserQuestion turns)

---

## Pick order

| Option | Description | Selected |
|--------|-------------|----------|
| Smallest-quantity-first + lexicographic tiebreaker | Depletes weak binders first → matches operator's "consolidate A02 into A07" intuition. SortSwift / SAP / Extensiv WMS validation. | ✓ |
| Largest-quantity-first | Preserves depth in big binders; minimizes pick count per order. | |
| FIFO by import date | Oldest stock goes first; requires tracking import order per row. Adds storage. | |
| Random / first-found | Non-deterministic; concurrent checkouts could pick differently. | |

**Decision rationale (Claude, auto-mode):** Research-locked + matches operator's stated workflow.

---

## Fulfillment semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Strict all-or-nothing | Any unfulfillable line → entire order fails with StockConflict. Preserves Phase 11 invariant + StockConflict shape. | ✓ |
| Partial fulfillment | Decrement what's available; return error for shortfall. Buyer might receive partial order; complex UX. | |

**Decision rationale (Claude, auto-mode):** Phase 11 invariant must be preserved. Buyers expect cart-as-transaction semantics.

---

## Multi-binder split visibility to buyer

| Option | Description | Selected |
|--------|-------------|----------|
| Never expose to buyer; admin-only via order_items.binder snapshot | StockConflict.available is SUM across binders; buyer sees aggregated. Admin sees the per-binder split via Phase 21's order detail. | ✓ |
| Expose split to buyer in confirmation email | Buyer sees "Lightning Bolt × 1 from binder A02, × 2 from binder A05". Leaks physical organization. | |
| Expose split in checkout page during cart review | Same leak; clutters UX. | |

**Decision rationale (Claude, auto-mode):** PITFALLS Pitfall 6 / I-DISC-05 — binder is a physical-world identifier; never leak to buyer-facing surfaces.

---

## CHECK violation HTTP code

| Option | Description | Selected |
|--------|-------------|----------|
| 503 Service Unavailable | Signals transient/retry-safe to clients and load balancers. Matches research recommendation. | ✓ |
| 500 Internal Server Error | More generic; doesn't signal retry-safety. | |
| 409 Conflict | Reuses existing stock_conflict semantics; semantically wrong (CHECK trip is system state, not buyer request conflict). | |

**Decision rationale (Claude, auto-mode):** Research recommendation; 503 + Phase 15 rate limiter together prevent attackers from mapping the system via CHECK trips.

---

## Audit log binder breakdown

| Option | Description | Selected |
|--------|-------------|----------|
| No per-binder breakdown in audit metadata | Audit records orderId + totalItems + totalPrice. Per-binder data is in order_items.binder snapshot (Phase 21 reads from there). | ✓ |
| Include per-line binder allocation in audit metadata | Bloats the 4KB cap on multi-line multi-binder orders. Duplicates data already captured in order_items. | |
| Compact summary (binderCount + binderList) in audit metadata | Some signal without full bloat. Still duplicative of order_items. | |

**Decision rationale (Claude, auto-mode):** Avoid 4KB metadata cap risk + avoid duplicating order_items data. Phase 21 surfaces the per-binder info from the snapshot column. Add the lighter `binderSourceCount` to the structured log instead (D-13) — that's where operational signals belong.

---

## Claude's Discretion

- Exact CTE syntax (Drizzle `sql` template literal style; planner verifies existing `placeCheckoutOrder` idioms)
- `FOR UPDATE OF cards` explicit table reference (planner verifies if Postgres requires it for multi-table CTE)
- Naming for the new `binderSourceCount` structured log field
- Edge case test fixtures (single-binder, all-zero, boundary cases, mixed conditions)

## Deferred Ideas

- Configurable allocator strategy → v1.4+
- Allocator preview in admin order detail → v1.3.x
- Audit log per-line binder breakdown → explicitly rejected
- SERIALIZABLE isolation level → explicitly rejected (READ COMMITTED + FOR UPDATE sufficient)
