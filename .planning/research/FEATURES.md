# Feature Research

**Domain:** Binder-aware inventory + multi-source pick workflow for an MTG bulk-sale store (Next.js, single admin, friend-circle scale)
**Researched:** 2026-05-10
**Confidence:** HIGH for the comparable patterns (SortSwift, Shopify multi-location, Manabox CSV); MEDIUM for the "fewest research subjects" question of which allocator MTG sellers prefer specifically (no public data — all signal is from general WMS literature applied to the MTG single-seller case).

## Question-by-Question Findings

### Q1. Allocator strategy when stock is split across binders

Three deterministic strategies are documented in the wider WMS literature and they have **named, opposite consequences**. Source: SAP Bin Location optimization docs and Extensiv 3PL allocation logic — both explicitly describe this trade as a binary toggle.

| Strategy | One-line definition | Real-world consequence | Fit for this milestone |
|---|---|---|---|
| **Smallest-quantity-first** ("ascending qty") | Deplete the binder with the fewest copies first | Frees up empty bins, naturally consolidates as you sell. Costs more picks per order on average. | **RECOMMENDED.** A consolidation force is exactly what a hobbyist seller wants — over months, A02's last 1 copy and A07's last 1 copy get picked, and eventually the binder shows up empty. Aligns with the user's stated workflow ("I just consolidated A02 into A07"). |
| **Largest-quantity-first** ("descending qty") | Pick everything from the binder with the most copies | Minimum number of binders touched per order (best for seller's hands). Costs storage — small leftover stocks linger forever in many binders. | Better for a high-throughput pro shop. Wrong for a bulk-collection seller because it forever keeps tiny remainders sprinkled across binders. |
| **Lexicographic / FIFO by binder name** | Always pick from the alphabetically first binder containing the card | Most predictable. Simplest implementation (`ORDER BY binder ASC` then drain). Tends to favor whichever bin the operator named "A01". | Tempting but weakest behavior — entrenches bias toward `A01`-style names, never consolidates the long tail. Use as the **tiebreaker** inside the chosen strategy, not as the strategy itself. |

**Real example with the user's stock pattern (3 copies across 5 binders 3+2+1+1+1, buyer wants 3):**

- Smallest-first: pick 1 from each of three "1-copy" binders → eliminates 3 trailing remainders in one order. Pick list reads "binder A04, A09, A12 — 1 each."
- Largest-first: pick 3 from the "3-copy" binder → 1 binder touched, but remainders 2+1+1+1 still scattered next time.
- FIFO by name: pick 1 from A04 + 1 from A09 + 1 from A11 (whatever the alpha order is) — same touch count as smallest-first but no consolidation pressure.

**Recommendation for v1.3:** Smallest-first **with** lexicographic-name tiebreaker, codified as a single SQL `ORDER BY` (`stock ASC, binder ASC`). Keeps the algorithm in one place, deterministic, and testable.

### Q2. Binder-name conventions

**SortSwift uses free-text "Remarks"** as bin labels and explicitly accepts mixed forms in their own docs: `"A1"`, `"B3"`, `"Shelf-2"`, `"Back Room"`, `"Display Case"`. Their best-practice guidance is **consistency, not format** — i.e., whatever you type must match what you typed before for the same physical bin. They also handle empty/missing remarks by sorting them to the end and treating `"No Remark"` literally as empty.

This matches the user's real binder set perfectly: `A01`–`A14` (alphanumeric) coexist with `Bulk Drawers`, `foundation box`, `lord of the rings`, and `compré titán` (multilingual). The user has already named these things — the system should not rename them.

**Anti-pattern observed:** eBay sellers commonly stuff bin location into the `Custom Label (SKU)` field as a free-form prefix (e.g., `Box012 2#shp 1#5oz 10"x5"x4" ITM142KM`). This works for eBay because the SKU is the only writable per-listing field, but it's a hack — sorting/filtering becomes substring matching. **Don't do this.** Make `binder` a first-class column.

**Recommendations:**
- Free-text string, no validation beyond `trim()` + non-empty + length cap (suggest 64 chars — SortSwift implicitly handles up to label-printing length).
- Case-sensitive storage (operator's "A01" and "a01" are different intent), but **case-insensitive uniqueness check** at import time so the operator catches typos like `A01` vs `A01 ` (trailing space) — show a "did you mean?" hint.
- Sort lexicographically by default in admin views. Admin can toggle to sort by stock-count (helps spot near-empty binders) or by last-touched.
- Reserve **`unsorted`** (lowercase) as the system value for migration backfill so it sorts to the bottom in admin and is easily filterable.

### Q3. Pick-list UX in similar apps

The single most directly comparable system is **SortSwift** (a Shopify app for TCG card stores; their docs literally describe the same scenario):

> "Remarks are location identifiers stored with inventory stock... For warehouse efficiency, use 'Remark / Set / A-Z' or 'Remark / A-Z' sorting to group items by physical location (bin/remark), making picking faster and reducing travel time."

SortSwift's exact pattern (HIGH confidence — pulled from `sortswift.com/docs/inventory/picklist/location-grouping`):

1. **Pick list is one screen, grouped by remark/binder.** No separate view per location — operator scrolls one printable page.
2. **Items without remarks appear together at the end.** This is exactly what `unsorted` should do for us.
3. **Grouping is the consolidation mechanism**, not a special "pick view." This validates the user's locked decision to use **per-line annotation only**, no separate pick view. It's how the leading TCG-specific app does it.

**TCGplayer Pro** uses a different pattern — Quicklist/Kiosks model multiple "digital binders" but their inventory-pick affordance is documented per-listing (the Custom Label / SKU field again). Less directly comparable.

**eBay** has a printable "Pick List" document but **does not show photos**, which seller forums repeatedly complain about. For a card store this is a real gap because cards-by-name-only causes mispicks (foreign printings, alt arts, basic-land variants). Our admin order detail already shows card images — keep that on the picked-line view.

**Mana Pool / ShipStation** consolidate orders from multiple platforms but they delegate the actual pick UI to ShipStation, which is platform-agnostic and just shows a SKU + location field. Not informative for our case.

**Pattern to adopt (this is the locked decision, validated by SortSwift):**
- Admin order detail page, each `order_items` row shows `[binder]` next to card name + image.
- Sort lines so identical binders cluster together (`ORDER BY binder, card_name`).
- Visually separate the "unsorted" group at the bottom.
- No separate pick view, no print step, no checklist state.

### Q4. Buyer-facing aggregation

**Sum-the-quantities is the universal pattern.** TCGplayer aggregates across sellers (each seller stays a separate listing under a card detail page); Shopify aggregates across locations into a single available count; SortSwift's location summary aggregates per card. Nobody surfaces per-bin breakdowns to buyers. The user's locked decision (storefront aggregates qty, binder hidden) matches the dominant pattern.

**Threshold displays ("low stock!" / "many in stock") are an urgency tactic from large e-commerce platforms** (Magento has explicit "Only X left" thresholds, BigCommerce has it as a config). For a friend-circle store this is unnecessary and slightly tacky — friends don't need fake urgency. Show the actual integer.

**Edge cases worth handling:**
- A card with stock 3+2+1+1+1 across 5 binders should show `"In stock: 8"`. The aggregation must happen at query time, not via a denormalized cached column (otherwise we have to invalidate it on every binder edit).
- A buyer adding 5 to cart then 4 to cart then checking out for 9 must succeed even though no single binder holds 9. The allocator handles this on commit.
- A buyer adding 9 to cart when only 8 exist must fail at cart-add or checkout — same as today, just summed across binders.

### Q5. Multi-binder transitions

The user explicitly said "We're shipping the simplest version that works, but understanding the ceiling matters." Here's the ceiling and the floor:

**Floor (ship this):** Inline edit of the `binder` column on the admin inventory table, same as inline price/quantity editing. Operator types new binder name, hits enter, row updates. To "consolidate A02 into A07": filter by binder=A02, bulk-edit binder column to A07. The merge logic — same card key from two binders becoming one — needs explicit handling: either (a) error on collision and force the operator to delete-then-edit, or (b) sum quantities into the surviving row. **Recommend (b)** with a confirmation modal: "X rows will merge with existing rows in A07. Quantities will be summed."

**Mid-tier (defer to v1.4 if requested):** Bulk-select rows by checkbox, then a "Move to binder…" action button. Same merge logic. Better UX than per-row inline edit when moving 50+ cards.

**Ceiling (don't build):** Drag-and-drop between visual binder panes. Microsoft Dynamics 365 has "Item Reclassification Journals" with audit trails and approval flows; SortSwift has bin-to-bin transfer with capacity warnings. These are appropriate at warehouse scale and would feel absurd here.

**The "delete + re-import" path always exists** as a fallback (Manabox is the source of truth — re-export with new binder names), so even the floor implementation has an escape hatch.

---

## Feature Landscape

### Table Stakes (Users Expect These)

The "user" here = the seller (admin) doing fulfillment, plus secondary "users" = friends browsing the storefront. Missing any of these and the milestone goal ("pull orders without flipping every binder") fails.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| `binder` column on every stock row, displayed on admin order detail next to each line | This is the entire milestone goal — without per-line binder annotation, the seller still has to flip binders. | LOW | One column on `cards` table + adjustment to existing order detail render. Migration backfills `binder='unsorted'`. |
| Composite key change: `(card_id, binder)` (or equivalent) so same card can live in multiple binders as separate rows | User explicitly listed this as locked. Without it, the schema can't represent reality. | MEDIUM | Schema migration + every JOIN/upsert touching `cards` needs review. Affects checkout commit, CSV import upsert, admin bulk delete, audit log identifiers. |
| Manabox CSV: parse `Binder Name` + `Binder Type` columns; skip rows where `Binder Type != 'binder'` (i.e., skip `deck` and `list` rows) | Manabox has three container types (`binder`, `deck`, `list` — confirmed from manabox.app/guides). Decks contain reference-only entries that aren't physical stock; lists are wishlists. Importing them as inventory would inflate stock with cards the seller doesn't actually own. | LOW | One filter line in the parser. Show a row count in the preview ("Skipped 47 rows: 32 deck, 15 list"). |
| Storefront aggregates quantity across binders; binder hidden from public pages | Buyers don't care about physical organization. Universal pattern across TCGplayer / Shopify / SortSwift. | LOW | One `SUM(quantity) GROUP BY card_id` change in the storefront query. Public card detail page doesn't render binder field. |
| Server-side allocator at checkout commit decides which binders to decrement | Race-safe + deterministic + auditable. The user already has a Phase 11 atomic checkout — this extends it. Without server-side allocation, the cart can pass validation but commit can fail in non-obvious ways. | MEDIUM | Algorithm: smallest-first with lexicographic tiebreaker (see Q1). Inside the existing atomic transaction; one buyer line can spawn multiple `order_items` rows. |
| Admin inventory table: `Binder` column visible + filterable | Standard table affordance — once the data exists, admins immediately want to slice by it. SortSwift, Shopify, NetSuite all do this. | LOW | Add column + filter dropdown populated from `SELECT DISTINCT binder`. |
| Migration backfills existing rows with `binder='unsorted'` so checkout/cart don't break before first binder-aware import | Without this, the very first deploy after schema change either crashes or has NULL binders, which breaks the new uniqueness key. User explicitly listed this. | LOW | One migration step, idempotent. |
| `etched` becomes a valid `Foil` enum value | User listed it. Manabox emits this for special foil treatments (Double Masters foil-etched, Universes Beyond foil-etched). Without it, those rows fail import. | TRIVIAL | Enum + parser + display label. |

### Differentiators (Competitive Advantage)

These set this milestone apart from a naive "just add a binder column" — they're the operator-experience polish that turns a feature into a workflow. Not all are required; flagged below.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Import preview's "binder picker"** with checkboxes per discovered binder + row count + remembered selection | This is the user's locked decision and the right call. Replace-by-binder lets the seller import one binder's CSV without nuking unrelated binders. Memory across imports = no clicking 14 checkboxes every Sunday. | MEDIUM | Preview already exists; add per-binder grouping + checkbox state. Persist selection in `localStorage` (no DB needed — it's per-browser preference). |
| **Allocator preview in admin order detail** showing the SQL `ORDER BY` outcome before commit (i.e., "If this order ships now, A04 → 1, A09 → 1, A12 → 1") | Confidence-builder. The seller can verify the algorithm did the right thing on their first few orders. Once trust is built it's just visual confirmation. | LOW | Run the same allocator logic in read-only mode; render the results as `[binder×qty]` next to the line. Doesn't decrement anything. |
| **Bulk-edit binder column** on selected admin inventory rows (checkbox-select + "Move to binder…") with merge-on-collision | The user explicitly mentioned consolidation as a real workflow. Without this, consolidating A02 into A07 means delete + re-export from Manabox + re-import. | MEDIUM | UI is the heaviest part; the merge logic is just `INSERT ... ON CONFLICT (card_id, binder) DO UPDATE SET quantity = quantity + EXCLUDED.quantity`. Show a confirmation modal listing collisions. |
| **`unsorted` filter shortcut** on admin inventory | After the first binder-aware import, the operator wants to find what's still unsorted. SortSwift handles this implicitly by sorting blanks to the end; an explicit filter is one click instead of scrolling. | TRIVIAL | One predefined filter chip. |
| **Per-binder row count badges** in the binder picker preview ("A07 — 247 rows", "Bulk Drawers — 3576 rows") | Lets the operator spot anomalies — if `Bulk Drawers` shows 12 rows you know something went wrong with the export. | LOW | Already part of the locked scope ("every binder name + row count"). |
| **Audit log records which binders an order's allocator hit** (not just total decrement) | The seller already has audit logging from v1.2; extending it costs almost nothing and pays off at debug time when a buyer says "you said you had 3 but only sent me 2." | LOW | Add `binder` to the `order_items` audit metadata. Each `order_items` row already encodes one binder under the new schema, so the audit data is the same data the row already has. |

### Anti-Features (Commonly Requested, Often Problematic)

These are things that *sound* right for a binder-aware inventory feature but should be explicitly excluded so they don't sneak into scope. Each comes with a documented reason and the alternative.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Separate "pick view" / printable pick list page** | Mental model from warehouse fulfillment ("you print the list, take it to the floor"). | Adds a screen with no new information — admin order detail already shows binder per line. Two views = two things to keep in sync. SortSwift validates this: their pick list IS the inventory list, just sorted by remark. | The existing admin order detail page, with lines sorted by binder and the unsorted group at the bottom. Keep one source of truth. |
| **Per-binder buyer-facing display** ("In stock: 3 in A07, 2 in Bulk Drawers, 1 in lord of the rings") | "Transparency!" / "What if the buyer cares?" | Friends don't care about your binder taxonomy. Multilingual binder names are operator-private. Exposing binders is a low-grade information leak about the seller's organizational system. Universal pattern (TCGplayer, Shopify, SortSwift) hides bin info from buyers. | Aggregate the sum on storefront. Period. The locked decision already says this. |
| **Drag-and-drop UI for moving cards between binders** | "It would be cool" / "feels like Trello." | Costs days to build, doesn't scale to 3576-card "Bulk Drawers" anyway, and the actual fulfillment workflow (consolidating A02 into A07) is a one-time bulk action better served by a checkbox + "Move to binder…" button. | Bulk-select + move-to-binder action (the differentiator above), or delete + re-import for the brave. |
| **Configurable allocator strategy per-buyer or per-line** | "What if some lines should preserve depth?" | Complexity explosion for zero observed need. Friend-circle scale + bulk cards = no high-value items where strategy matters. | One strategy globally: smallest-first with lexicographic tiebreaker. Document it in admin help text. |
| **Real-time stock display per binder in the cart** | "Buyer should know which binder their cards are in." | Same anti-feature as above — buyers don't care, and the allocator only runs at commit, so any per-binder display in the cart would be a stale guess. | Cart shows total qty available; the binder breakdown only exists in the admin order detail after commit. |
| **Binder-name validation / regex enforcement** ("must be `[A-Z][0-9]{2}`") | "Consistency!" — feels right because some of the user's binders match this pattern. | Breaks the user's actual binder set: `Bulk Drawers`, `foundation box`, `lord of the rings`, `compré titán` would all fail. SortSwift's docs explicitly accept free-text. The user already gave the right answer here. | Free-text + trim + length cap. Show a "did you mean A07?" hint when a binder name within 1 char of an existing one appears at import time, but never block. |
| **"Move all stock from binder X to binder Y" cascade button** in the binder picker | Looks helpful for consolidation. | Destructive at scale (one click can reorganize 3576 rows), no undo, ambiguous merge semantics in UI. Bulk-edit on a filtered table is the same operation with visual confirmation. | Filter inventory by binder, select all, "Move to binder…" — the differentiator above. |
| **Per-binder reservation / hold for in-store pickup** | "What if a friend coming over Saturday wants to grab cards then?" | The whole product runs on email-to-pay-in-person; there's no "reserve" concept and adding one would touch every page. | Use the existing order workflow — order created with binder annotations, friend picks them up at the agreed time, admin marks shipped/fulfilled. No new mechanism needed. |
| **Auto-detect binder from card data** (e.g., "always put set X in binder Y") | "Less manual work for the seller!" | Cards in `Bulk Drawers` and themed binders (`lord of the rings`, `foundation box`) follow no rule — they were sorted by hand for reasons specific to the operator. Heuristics would be wrong constantly. | Trust the Manabox export. The seller already organized once; the system just records it. |
| **Foil-vs-non-foil-vs-etched as separate binder dimensions** in the schema | The new `etched` value might tempt a rethink of the composite key. | Foil/etched is already an attribute on the card (it's part of the existing finish enum). Same card, different finish = different SKU. Same SKU, different binder = the new dimension this milestone adds. Don't conflate them. | Composite key is `(scryfall_id, finish, condition, language, binder)` — same as today plus binder. |

## Feature Dependencies

```
[Manabox CSV parses Binder Name + Binder Type]
    └──required-by──> [Composite key includes binder dimension]
                          ├──required-by──> [Migration backfills 'unsorted']
                          ├──required-by──> [Server-side allocator at checkout]
                          │                     └──required-by──> [Allocator preview in admin]
                          │                     └──required-by──> [Audit log records picked binders]
                          ├──required-by──> [Admin order detail shows [binder] per line]
                          ├──required-by──> [Admin inventory column + filter]
                          │                     └──required-by──> [Bulk-edit binder + 'unsorted' filter chip]
                          └──required-by──> [Storefront aggregates quantity]

[Import preview binder picker] ──depends-on──> [Manabox CSV parses Binder Name]
[Import preview binder picker] ──depends-on──> [Composite key includes binder]  (so "include only A07" can be implemented as scoped replace)

[etched finish enum value] ──independent──> (no dependencies — pure parser/display change)
```

### Dependency Notes

- **Composite key is the keystone.** Almost every other feature requires it. Build the schema migration first; everything else is a downstream of it.
- **Migration backfill (`binder='unsorted'`) must run before the first binder-aware import**, otherwise the constraint creation fails. This is one transaction: alter table + backfill + add unique constraint.
- **Allocator preview enhances allocator** — it's the same code in read-only mode. Build the allocator first; preview is ~30 minutes of UI on top.
- **Bulk-edit depends on the inventory filter** because the workflow is "filter to the source binder, select all, move." Without the filter, bulk-edit is a needle in 19,661-row haystack.
- **Import preview binder picker depends on the composite key** for the "scoped replace" semantics. With the old single-row-per-card model there's no way to express "replace only A07's rows."
- **`etched` is fully independent** — can ship in any order, including before the schema migration if the team wants to land it as a warmup.

## MVP Definition

### Launch With (v1.3)

These are the locked decisions from the milestone description, restated as a checklist. This is the milestone — there is no separate "v1.3 MVP vs v1.3 full."

- [ ] Manabox CSV parser reads `Binder Name` + `Binder Type`; skips rows where `Binder Type != 'binder'` — without this, deck/list rows pollute inventory
- [ ] `cards` composite key gains `binder` dimension; same card across multiple binders = multiple stock rows — schema foundation
- [ ] Migration backfills existing rows with `binder='unsorted'` — keeps checkout working from the moment the schema lands
- [ ] Import preview shows binder picker (every binder name + row count + checkbox; selection remembered between imports via localStorage) — operator UX
- [ ] Replace semantics scoped to selected binders only — unselected binders left untouched on import
- [ ] Storefront aggregates `SUM(quantity) GROUP BY card_id`; binder hidden on public pages — buyer experience unchanged
- [ ] Server-side allocator at checkout commit picks binders using **smallest-quantity-first with lexicographic tiebreaker**; one buyer line → potentially multiple `order_items` rows — race-safe inside existing atomic transaction
- [ ] Admin order detail shows `[binder]` annotation on every line — the entire milestone goal
- [ ] Admin inventory table gains `Binder` column + filter — slicing-by-binder for daily ops
- [ ] `etched` becomes valid `Foil` finish enum value — unblocks Manabox rows that already use this

### Add After Validation (v1.3.x)

Useful but not required to ship the milestone. Add if the seller actually uses the system and asks for them.

- [ ] **Allocator preview in admin order detail** (read-only `[binder×qty]` next to each line before commit) — trigger: seller asks "did the algorithm pick the right binders?"
- [ ] **Bulk-edit binder column** with merge-on-collision modal — trigger: seller does their first manual consolidation and complains about the inline-edit-per-row workflow
- [ ] **`unsorted` filter chip** as a one-click shortcut on admin inventory — trigger: seller asks how to find unsorted rows quickly
- [ ] **Audit log includes per-line allocated binder** — trigger: any single buyer dispute about what was sent vs ordered
- [ ] **Did-you-mean hint at import time** for binder names within edit-distance 1 of an existing name — trigger: first observed typo (e.g., `A07` vs `A07 ` with trailing space)

### Future Consideration (v1.4+)

Defer until clear signal that they're worth the build cost.

- [ ] **Configurable allocator strategy** (smallest-first vs largest-first vs FIFO) — defer because no observed scenario requires it; current design has one strategy that fits the user's workflow
- [ ] **Drag-and-drop binder visualization** — defer because bulk-edit covers the same workflow at a fraction of the cost
- [ ] **Per-binder capacity tracking** ("A07 has 800 cards in a 480-pocket binder") — defer because the seller knows their physical capacity; the system doesn't need to
- [ ] **Mobile-friendly pick-mode UI** for fulfilling on-the-go — defer because the seller is at a desk with their binders; no mobile use case
- [ ] **Binder transfer history** (audit trail of moves between binders) — defer because the existing audit log already captures bulk-edit operations at a coarser level

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Composite key with binder dimension + migration | HIGH | MEDIUM | P1 |
| Manabox parser reads Binder Name + Binder Type, skips non-binder rows | HIGH | LOW | P1 |
| Server-side allocator (smallest-first + lex tiebreaker) at checkout commit | HIGH | MEDIUM | P1 |
| Admin order detail shows `[binder]` per line | HIGH | LOW | P1 |
| Storefront aggregates qty across binders | HIGH | LOW | P1 |
| Import preview binder picker with remembered selection | HIGH | MEDIUM | P1 |
| Replace-scoped-to-selected-binders semantics | HIGH | MEDIUM | P1 |
| Admin inventory `Binder` column + filter | MEDIUM | LOW | P1 |
| Migration backfill `unsorted` | HIGH | LOW | P1 (blocker) |
| `etched` foil enum value | MEDIUM | TRIVIAL | P1 (cheap, unblocks rows) |
| Allocator preview in admin order detail | MEDIUM | LOW | P2 |
| Bulk-edit binder column with merge | MEDIUM | MEDIUM | P2 |
| `unsorted` filter chip | LOW | TRIVIAL | P2 |
| Audit log per-line binder | MEDIUM | LOW | P2 |
| Did-you-mean import hint | LOW | LOW | P2 |
| Configurable allocator strategy | LOW | MEDIUM | P3 |
| Drag-and-drop binder UI | LOW | HIGH | P3 |
| Per-binder buyer display | NEGATIVE | LOW | **P0 anti-feature — explicitly do not build** |
| Separate pick view page | NEGATIVE | MEDIUM | **P0 anti-feature — explicitly do not build** |
| Binder name regex validation | NEGATIVE | LOW | **P0 anti-feature — explicitly do not build** |

**Priority key:**
- P1: Must ship as part of v1.3 milestone
- P2: Add after v1.3 lands and seller signals demand (within v1.3.x)
- P3: Defer to v1.4 or beyond, possibly never
- P0 anti-feature: Explicitly NOT to be built; documented to prevent accidental scope creep

## Competitor Feature Analysis

| Feature | TCGplayer Pro | SortSwift (Shopify TCG app) | Mana Pool / ShipStation | Our Approach (v1.3) |
|---|---|---|---|---|
| Binder/location field per stock row | "Custom Label" SKU field (free-form, hack-y) | "Remarks" — free-text bin label, first-class column | SKU field, delegated to ShipStation | First-class `binder` column on `cards` table, free-text |
| Multi-binder for same card | Multiple listings (one per condition/printing only) | Multiple stock rows per card, grouped on view | Per-listing | Composite key `(scryfall_id, finish, condition, language, binder)` — multiple rows allowed |
| Pick list UI | Separate Pick List doc, no photos | Single inventory view sorted by remark, with images | Delegated to ShipStation | Admin order detail with binder annotation per line, sorted by binder |
| Allocator strategy | N/A (one listing per copy) | Not documented (likely FIFO) | Per-listing | **Smallest-first + lex tiebreaker** (deliberately chosen for consolidation force) |
| Buyer-facing aggregation | Aggregates across sellers, not bins | Aggregated total | Per-listing visible | Sum across binders, binder hidden |
| Bulk-move between bins | Via CSV re-import | Bulk-edit + transfer with capacity warnings | Via CSV | v1.3: inline edit (floor); v1.3.x: bulk-edit with merge (planned) |
| Binder name validation | None (free-text in SKU) | None — accepts any string, sorts blanks last | Delegated | None — free-text, length cap, optional did-you-mean hint |
| Binder picker on import | No | Documented for advanced location mode | No | **Yes — distinguishing v1.3 feature** |

The **closest comparable system is SortSwift** (TCG-specific, Shopify-integrated, used by real card shops). Our v1.3 design tracks SortSwift's patterns almost exactly:

- Free-text bin labels (their "Remarks" = our `binder`)
- Group-by-bin on the pick view (their picklist sort = our admin order detail sort)
- Aggregate quantity, hide bin from buyer (universal)
- Bulk-edit / transfer between bins (our v1.3.x plan)

Where we **deviate intentionally** is the binder picker on import — SortSwift's import is per-card-record, so the question doesn't arise. Ours is full-CSV-replace, so per-binder scoping is the user's locked design choice and a real workflow win for the "import only the binder I changed today" pattern.

## Sources

### Direct competitor evidence (HIGH confidence)
- [SortSwift — Picklist Location Grouping docs](https://sortswift.com/docs/inventory/picklist/location-grouping) — primary source for free-text bin labels, sort-by-bin pick UX, "items without remarks at end" pattern
- [SortSwift — Location Summary docs](https://sortswift.com/docs/inventory/location-summary) — multi-bin same-card aggregation, transfer between locations, capacity warnings
- [SortSwift — Picklist Generating docs](https://sortswift.com/docs/inventory/picklist/generating-picklists) — bulk picking workflow
- [SortSwift Inventory Management feature page](https://sortswift.com/features/inventory) — "tag any stock with a bin or location, see per-bin capacity warnings"
- [TCGplayer — Selling from Multiple Physical Stores](https://help.tcgplayer.com/hc/en-us/articles/115005291707-Selling-from-Multiple-Physical-Stores) — "Total Qty" field semantics
- [Mana Pool — third-party seller tools](https://support.manapool.com/hc/en-us/articles/33523814988311-ShipStation-fulfill-your-Mana-Pool-orders-from-the-ShipStation-dashboard) — fulfillment is delegated to ShipStation; per-listing only

### Allocator strategy literature (HIGH confidence)
- [SAP Bin Location optimization](https://blogs.sap.com/2016/06/09/optimizing-bin-location-warehouse-storage-or-numbers-of-picks/) — explicit smallest-first vs largest-first toggle and named consequences
- [Extensiv — Understanding Allocation Logic](https://help.extensiv.com/3pl-warehouse-manager-inventory-management/understanding-allocation-logic) — production WMS allocation rules
- [Cadre Tech — FIFO vs LIFO vs FEFO comparison](https://www.cadretech.com/warehouse-order-picking-evaluation/) — multi-location FIFO trade-offs
- [Shopify — Smart Order Routing](https://www.shopify.com/blog/smart-order-routing) — ranked location prioritization, minimize-split-fulfillment
- [Shopify Help — Setting up order fulfillment for locations](https://help.shopify.com/en/manual/fulfillment/setup/locations/fulfillment) — order routing rules

### Manabox CSV format (HIGH for binder/deck/list enum; MEDIUM for full column list)
- [Manabox — Import and export the collection](https://www.manabox.app/guides/collection/import-export/) — "exported file will include all card properties as well as the binder/list name"
- [Manabox — Collection FAQ](https://www.manabox.app/guides/collection/faq/) — three container types (binder, deck, list)
- [Manabox — Decks FAQ](https://www.manabox.app/guides/decks/faq/) — deck-vs-collection-binder distinction
- [Mana Pool — CSV Inventory Export ManaBox Format](https://support.manapool.com/hc/en-us/articles/26131255560855-CSV-Inventory-Export-ManaBox-Format) — third-party confirmation of column shape

### eBay seller anti-pattern reference (MEDIUM confidence — community forum data)
- [eBay community — Item Location](https://community.ebay.com/t5/Selling/Item-Location/td-p/34113773) — sellers stuffing bin into Custom Label (SKU)
- [eBay community — Pick List Document](https://community.ebay.com/t5/Seller-Tools/quot-Pick-List-quot-Document/td-p/32157980) — eBay pick list lacks photos (anti-pattern observation)

### Stock display / urgency tactics (HIGH confidence — Magento/BigCommerce widely documented)
- [Adobe Commerce — Catalog Inventory](https://experienceleague.adobe.com/docs/commerce-admin/config/catalog/inventory.html) — "Only X left" threshold mechanics
- [Econsultancy — How 11 ecommerce sites use stock levels to create buyer urgency](https://econsultancy.com/how-11-ecommerce-sites-use-stock-levels-to-create-buyer-urgency/) — confirmation that low-stock urgency is a sales tactic, not a baseline expectation

### Bulk move / bin-to-bin transfer (HIGH confidence)
- [SKUSavvy — Bin to Bin Transfer](https://www.skusavvy.com/docs/guides/warehouse/bin-to-bin-inventory-transfer) — UI pattern for moving stock between bins
- [Microsoft Dynamics 365 — Transfer items between warehouse locations](https://learn.microsoft.com/en-us/dynamics365/business-central/inventory-how-transfer-between-locations) — Item Reclassification Journals as the enterprise pattern (cited as the "ceiling we won't build")

---
*Feature research for: binder-aware MTG inventory + multi-source pick workflow*
*Researched: 2026-05-10*
