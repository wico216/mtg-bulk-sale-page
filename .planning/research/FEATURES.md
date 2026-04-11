# Feature Research: Admin Panel & Inventory Management

**Domain:** MTG bulk card store -- admin panel, inventory CRUD, CSV import/export, order history, inventory stats
**Researched:** 2026-04-11
**Confidence:** HIGH (features driven by PROJECT.md requirements + established e-commerce/TCG patterns)

## Context

v1.0 shipped a complete public storefront: card catalog, search/filter, cart, email checkout. All data is static JSON generated at build time from Manabox CSV exports. v1.1 replaces the static pipeline with a live database and admin panel so the seller can manage inventory without redeploying.

**Existing storefront features (already built, not re-researched here):**
- Card catalog with Scryfall images, prices, conditions
- Search by name, filter by color/rarity/set, sorting
- Shopping cart with persistent state (Zustand + localStorage)
- Email checkout (seller + buyer notifications via Resend)
- CSV import from Manabox at build time
- Confirmation page with order reference

---

## Feature Landscape

### Table Stakes (Admin Expects These)

The admin (seller) is a single user managing their personal card store. These features are the minimum to make the admin panel functional and replace the current "edit CSV, redeploy" workflow.

| Feature | Why Expected | Complexity | Dependencies on Existing Storefront |
|---------|--------------|------------|--------------------------------------|
| **Auth-protected admin route** | Without auth, anyone can edit inventory. GitHub OAuth is the simplest single-provider approach for a developer admin. | MEDIUM | None -- new `/admin` route tree, independent of storefront |
| **Card inventory table** | The admin needs to see all cards in a scannable, sortable, filterable table. This is the core of the admin panel -- equivalent to the storefront catalog but optimized for data management, not browsing. | MEDIUM | Uses same Card data model as storefront (`types.ts`). Must read from DB instead of static JSON. |
| **Inline edit card fields** | Admin must be able to change price, condition, and quantity for individual cards without navigating to a separate page. TCGPlayer and Deckbox both use inline/modal editing for individual items. | MEDIUM | Writes to DB; storefront reads must reflect changes immediately. |
| **Delete individual cards** | Remove cards that are sold out, damaged, or no longer for sale. | LOW | Must not break storefront if a card in someone's cart gets deleted. Cart should handle missing cards gracefully. |
| **CSV import (full replace)** | The seller already uses Manabox to catalog their collection. The existing workflow is: scan cards in Manabox, export CSV, import to store. "Full replace" is the right model -- Manabox is the source of truth for bulk operations. | HIGH | Reuses existing `csv-parser.ts` logic (Manabox format parsing). Must clear DB and re-insert. Existing Scryfall enrichment pipeline needs to work with DB instead of static files. |
| **CSV export** | Download current inventory as CSV for backup, or to re-import into Manabox/other tools. TCGPlayer, Deckbox, and EchoMTG all offer CSV export. | LOW | Reads from DB, generates CSV in Manabox-compatible format. |
| **Auto-decrement stock on checkout** | Currently checkout validates stock but does not decrement it (static JSON is read-only). With a live DB, stock must decrement atomically when an order is placed. This is the single most important reason for the database migration. | MEDIUM | Directly modifies checkout API route (`/api/checkout/route.ts`). Must use a DB transaction to prevent race conditions. Cards with quantity 0 should either hide from storefront or show "out of stock." |
| **Order history** | Admin needs to see past orders -- who bought what, when, and totals. Currently orders only exist as emails. Storing them in DB enables lookup, stats, and dispute resolution. | MEDIUM | Requires new `orders` table. Checkout API must write order to DB in addition to sending emails. |
| **Inventory stats dashboard** | At minimum: total unique cards, total card count (sum of quantities), total inventory value. These are the three numbers every TCG seller wants to see at a glance. EchoMTG, Deckbox, and TCGPlayer all show these prominently. | LOW | Aggregate queries on inventory table. Depends on prices being populated (from Scryfall or manual entry). |

### Differentiators (Nice-to-Have, Add Value)

These improve the admin experience but the panel functions without them. Ordered by value-to-effort ratio.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Bulk select & delete** | When importing a new CSV, some old cards might linger. Bulk select with checkboxes + "Delete selected" is faster than one-by-one. TCGPlayer and every admin panel template uses this pattern. | LOW | Requires card inventory table with checkboxes. Standard table UX pattern -- floating action bar or toolbar appears when items selected. |
| **Inventory breakdown by set/color/rarity** | Stats beyond totals: "You have 47 rares worth $312." Helps the seller understand what they're sitting on. EchoMTG does this with color-coded charts. | LOW | SQL GROUP BY queries on existing inventory data. Display as simple stat cards or a small table. |
| **Search/filter in admin table** | Admin may have hundreds or thousands of cards. Searching by name and filtering by set/condition in the admin table speeds up finding specific cards to edit. | LOW | Reuses search/filter logic patterns from storefront. Server-side filtering with DB queries. |
| **Order detail view** | Click an order in history to see full line items, buyer info, and message. More useful than a flat table row. | LOW | Requires order items stored in DB (separate `order_items` table or JSON column). |
| **Import preview & validation** | Before replacing the entire inventory, show the admin what will change: "245 cards to import, 12 rows skipped (missing data)." Lets the admin catch problems before committing. This is a UX best practice per Smashing Magazine's data importer guidelines. | MEDIUM | Requires a two-step import: parse + preview, then confirm. Reuses CSV parser for validation. |
| **Price change indicators** | When importing a new CSV, highlight cards whose prices changed vs. the previous inventory. Helps the seller verify their pricing updates. | MEDIUM | Requires diffing new import against current DB state before replacing. |
| **Quantity adjustment buttons (+/-)** | Instead of typing a number, click +/- to adjust quantity. Faster for small adjustments like "sold one copy in person." | LOW | Simple UI enhancement on the card edit interface. |
| **Low stock alerts** | Highlight cards with quantity 1 (last copy). Helps the seller know what's almost gone. | LOW | Conditional styling in admin table. Filter or sort by quantity ascending. |
| **Export orders as CSV** | Download order history for record-keeping or tax purposes. | LOW | Simple CSV generation from orders table. |

### Anti-Features (Do NOT Build)

Features that seem useful but create complexity disproportionate to their value for a personal friend-store admin panel.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Incremental/merge CSV import** | "Don't wipe my edits when I import" | Merge logic is extremely complex: what if same card exists with different price? Different condition? What about cards in the DB but not in CSV -- delete or keep? Every merge strategy has edge cases. TCGPlayer only offers full replace for CSV imports for exactly this reason. | Full replace is the right model. Manabox is the source of truth. If admin made manual edits, they should export CSV first as backup. |
| **Real-time price sync from Scryfall/TCGPlayer** | "Keep prices up to date automatically" | Scryfall rate limits are strict (50ms between requests). Prices change daily. Auto-syncing thousands of cards daily hits API limits and adds background job complexity. The seller sets their own prices anyway (often below market). | Manual price updates via admin panel or CSV re-import. Show TCGPlayer market price as a reference but don't auto-set. |
| **Multi-user admin / role-based access** | "Let my friend help manage inventory" | Single admin is a PROJECT.md constraint. RBAC adds auth complexity, permission checking on every endpoint, audit logging. Total overkill. | Single GitHub account has admin access. Share credentials if truly needed (not recommended). |
| **Automated reorder / restock alerts** | "Tell me when to buy more cards" | This is a personal bulk collection, not a retail operation with suppliers. There's no "reorder" -- you either have cards or you don't. | Low stock indicators (quantity 1) are sufficient. |
| **Rich text descriptions / custom fields per card** | "Add notes about card condition details" | The 5-tier condition system (NM/LP/MP/HP/DMG) from Manabox is standard in MTG. Custom fields add schema complexity and break CSV round-tripping. | Stick with standard condition field. Use the order message field for buyer notes. |
| **Drag-and-drop card reordering** | "Arrange my inventory in a custom order" | Cards should be sortable by name/price/set/quantity. Custom ordering requires a sort-order column, adds complexity to every insert/delete, and is meaningless to storefront visitors who sort by their own criteria. | Provide sort options (name, price, set, quantity) in admin table. |
| **Analytics / traffic tracking** | "How many visitors does my store get?" | Vercel Analytics or a simple analytics snippet handles this. Building it into the admin panel is scope creep. | Use Vercel Analytics (free tier) or Plausible if needed. |
| **Undo / version history** | "Oops, I accidentally deleted 50 cards" | Version history on every edit is complex (temporal tables, event sourcing). Massive overengineering for a personal tool. | CSV export before destructive operations. The import preview step catches mistakes before they happen. |
| **Mobile-optimized admin panel** | "Manage inventory from my phone" | Admin tasks (editing tables, CSV uploads, reviewing stats) are fundamentally desktop workflows. Making a data table responsive is high effort for marginal use. | Desktop-first admin panel. Storefront is already mobile-responsive. |
| **Partial / delta stock sync** | "Only decrement by the exact checkout amount, handle concurrent checkouts" at scale | For a friend circle (maybe 5-10 concurrent users max), database transactions are sufficient. Building a queue-based stock reservation system is enterprise-grade overkill. | Simple DB transaction: read quantity, validate, decrement, commit. If race condition occurs, second checkout gets a "stock changed" error and user retries. |

---

## Feature Dependencies

```
Database (Vercel Postgres)
    |
    +-- Auth (GitHub OAuth)
    |       |
    |       +-- Admin Panel Shell (layout, nav, protected routes)
    |               |
    |               +-- Card Inventory Table (list, sort, filter)
    |               |       |
    |               |       +-- Inline Edit (price, condition, quantity)
    |               |       +-- Delete Individual Card
    |               |       +-- Bulk Select & Delete
    |               |
    |               +-- CSV Import (full replace)
    |               |       |
    |               |       +-- Import Preview & Validation (differentiator)
    |               |
    |               +-- CSV Export
    |               |
    |               +-- Inventory Stats Dashboard
    |               |
    |               +-- Order History
    |                       |
    |                       +-- Order Detail View (differentiator)
    |
    +-- Storefront Migration (read from DB instead of static JSON)
    |       |
    |       +-- Auto-decrement on Checkout (modify checkout API)
    |
    +-- Scryfall Enrichment (runs on CSV import, writes to DB)
```

### Dependency Notes

- **Everything requires Database:** The DB is the foundational change. Without it, nothing else works. Schema design must come first.
- **Auth must precede admin panel:** Every admin route must be protected. Auth is a prerequisite, not a feature to add later.
- **Storefront migration is independent of admin panel:** The storefront can switch from static JSON to DB reads without the admin panel existing. These can be developed in parallel or sequentially.
- **CSV Import reuses existing parser:** The current `csv-parser.ts` and `enrichment.ts` modules handle Manabox parsing and Scryfall enrichment. The import feature wraps these with a DB write step instead of a JSON file write.
- **Auto-decrement requires DB + checkout API changes:** The checkout route currently reads from static JSON (`loadCardData()`). It must switch to DB reads and add a transaction that decrements stock.
- **Order history requires DB schema for orders:** New `orders` and `order_items` tables. The checkout API must write order data to DB in addition to sending emails.
- **Inventory stats depends on populated inventory:** Stats are meaningless without data. This should be built after import works.
- **Bulk select & delete depends on inventory table:** The table with checkboxes must exist first.

---

## MVP Definition

### Launch With (v1.1 Core)

The minimum to replace the "edit CSV, redeploy" workflow with live management.

- [ ] **Database schema & migration** -- cards table, orders table, order_items table
- [ ] **GitHub OAuth admin auth** -- protect `/admin/*` routes, single allowed user
- [ ] **Storefront DB migration** -- storefront reads from DB instead of static JSON
- [ ] **Card inventory table** -- sortable, searchable list of all cards with key fields
- [ ] **Inline edit card fields** -- edit price, condition, quantity per card
- [ ] **Delete individual cards** -- remove cards from inventory
- [ ] **CSV import (full replace)** -- upload Manabox CSV, clear DB, re-insert with Scryfall enrichment
- [ ] **CSV export** -- download current inventory as CSV
- [ ] **Auto-decrement on checkout** -- checkout decrements stock in DB atomically
- [ ] **Order history table** -- list of past orders with buyer, date, total, item count
- [ ] **Inventory stats** -- total unique cards, total quantity, total value (stat cards at top of admin)

### Add After Core Works (v1.1 Polish)

Features to add once the core admin panel is functional and tested.

- [ ] **Bulk select & delete** -- checkboxes + floating action bar for mass operations
- [ ] **Import preview & validation** -- show what will change before committing import
- [ ] **Order detail view** -- click order row to see line items and buyer message
- [ ] **Search/filter in admin table** -- name search + set/condition filters for large inventories
- [ ] **Inventory breakdown stats** -- cards by set, by color, by rarity with values
- [ ] **Low stock alerts** -- highlight cards with quantity 1 in admin table

### Future Consideration (v1.2+)

- [ ] **Price change indicators on import** -- diff new CSV against current DB
- [ ] **Export orders as CSV** -- for record-keeping
- [ ] **Quantity +/- buttons** -- quick adjust without typing

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Database schema & migration | HIGH | MEDIUM | P1 | Foundation for everything |
| GitHub OAuth auth | HIGH | MEDIUM | P1 | Must have before any admin features |
| Storefront DB migration | HIGH | MEDIUM | P1 | Storefront must keep working during transition |
| Card inventory table | HIGH | MEDIUM | P1 | Core admin view |
| Inline edit card fields | HIGH | LOW | P1 | Primary reason for admin panel |
| Delete individual cards | MEDIUM | LOW | P1 | Basic CRUD |
| CSV import (full replace) | HIGH | HIGH | P1 | Replaces current build-time pipeline |
| CSV export | MEDIUM | LOW | P1 | Data backup, round-trip capability |
| Auto-decrement on checkout | HIGH | MEDIUM | P1 | Critical for inventory accuracy |
| Order history table | MEDIUM | MEDIUM | P1 | Orders currently vanish after email |
| Inventory stats (totals) | MEDIUM | LOW | P1 | Quick glance at inventory health |
| Bulk select & delete | MEDIUM | LOW | P2 | Convenience for cleanup |
| Import preview | MEDIUM | MEDIUM | P2 | Safety net for imports |
| Order detail view | LOW | LOW | P2 | Nice but not blocking |
| Admin table search/filter | MEDIUM | LOW | P2 | Important as inventory grows |
| Inventory breakdown stats | LOW | LOW | P2 | Interesting but not actionable |
| Low stock alerts | LOW | LOW | P2 | Conditional styling only |
| Price change indicators | LOW | MEDIUM | P3 | Advanced import feature |
| Export orders CSV | LOW | LOW | P3 | Niche use case |
| Quantity +/- buttons | LOW | LOW | P3 | Minor UX enhancement |

**Priority key:**
- P1: Must have for v1.1 launch -- admin panel is not useful without these
- P2: Should have, add during v1.1 if time permits or in a follow-up polish phase
- P3: Nice to have, defer to v1.2+

---

## Competitor Feature Analysis

| Feature | TCGPlayer Seller Portal | Deckbox | EchoMTG | Manabox | Our Approach |
|---------|------------------------|---------|---------|---------|--------------|
| **Inventory table** | Full-featured with filters, columns, bulk pricing | Card list with sort/filter, grid or list view | Collection view with value tracking | Binder/list view with card details | Simple data table with sort/search -- admin-optimized, not browse-optimized |
| **Inline editing** | Price + quantity editable; condition is immutable after creation | Click card to edit details | Edit via card detail page | Edit in card detail view | Inline edit for price, quantity, condition -- all mutable since we control the data |
| **CSV import** | Full replace via Pricing tab (Level 4+ sellers). Filtered export/import supported | Import from various formats including Manabox | Import from pasted list or file upload | Export only (Manabox is the source, not a destination for our data) | Full replace import matching Manabox format. Reuse existing parser. |
| **CSV export** | Export filtered inventory with all fields | Export collection/tradelist/wishlist | Export collection | Native CSV export of collection | Export all cards in Manabox-compatible format |
| **Bulk operations** | Bulk pricing via MassPrice, scan & identify for bulk listing | Bulk add to tradelist | Bulk import via paste | N/A | Checkbox select + delete. Bulk edit deferred (anti-feature for now). |
| **Order history** | Full order management with status tracking, labels, shipping | N/A (trading platform, not store) | N/A (collection tracker, not store) | N/A | Simple order list: ref, buyer, date, total, item count. No status workflow (orders are always "pay in person"). |
| **Inventory stats** | Revenue tracking, sales charts, inventory value | Collection value with price trends over time | Portfolio value with daily tracking, stock-market-style charts | Collection stats with set breakdowns | Total cards, total quantity, total value. Breakdowns by set/color/rarity as P2. |
| **Auth model** | Full multi-user with seller levels (1-4) and permissions | User accounts with profiles | User accounts with membership tiers | App-level auth (mobile) | Single admin via GitHub OAuth. No user levels, no roles. |
| **Stock management** | Auto-decrement on sale, channel management for multi-platform sync | Manual (collection tracker, not store) | Manual (collection tracker, not store) | Manual (cataloging app) | Auto-decrement on checkout via DB transaction. Simple and correct for single-channel. |

### Key Takeaways from Competitors

1. **TCGPlayer's condition immutability is smart for marketplaces but wrong for us.** In a marketplace, condition affects buyer trust. In a friend store, the admin might re-grade a card. We should allow condition editing.

2. **Full replace CSV import is the industry standard**, not merge. TCGPlayer does it. Manabox exports are designed as complete snapshots. Do not attempt incremental merge.

3. **EchoMTG's value tracking over time is compelling but out of scope.** We track current value, not historical trends. No need for time-series data.

4. **Deckbox's tradelist/wishlist separation is irrelevant.** We have one inventory, one storefront. No trading.

5. **Every platform shows inventory totals prominently.** Total cards + total value is universal. This is low-effort, high-impact.

6. **Order management in TCG stores is usually lightweight.** No complex status workflows -- most small stores just track "ordered" and "fulfilled/picked up." For a friend store, even that is overkill. The order history is purely a reference log.

---

## UX Patterns to Follow

### Admin Table Pattern (from PatternFly, HashiCorp Helios)
- Checkbox column for bulk selection
- Sortable column headers (click to toggle asc/desc)
- Search input above table
- Floating action bar appears when items selected ("3 selected -- Delete")
- Pagination or virtual scroll for large inventories (500+ cards)

### CSV Import Pattern (from Smashing Magazine, CSVBox)
- Drag-and-drop upload zone with click fallback
- Parse immediately on upload, show preview table
- Highlight validation errors (missing fields, bad data) with row-level error messages
- "Import X cards (Y skipped)" confirmation before committing
- Progress indicator during Scryfall enrichment (which takes time due to rate limits)

### Inline Edit Pattern (from enterprise data tables)
- Click a cell to make it editable (or click an edit button per row)
- Save on blur or Enter key
- Cancel on Escape
- Optimistic UI: show change immediately, revert on server error
- Visual indicator of unsaved/saving/saved state

### Order History Pattern (from Tailwind UI, standard admin templates)
- Table with columns: Order Ref, Buyer Name, Date, Items, Total
- Click row to expand or navigate to detail view
- Most recent orders first (reverse chronological)
- No complex status workflow -- all orders are "completed" (payment is in person)

---

## Sources

- [TCGPlayer Seller Portal & Tools](https://seller.tcgplayer.com/pro) -- inventory management, pricing tools, CSV import/export
- [TCGPlayer CSV Import/Export Help](https://help.tcgplayer.com/hc/en-us/articles/115002358027-Importing-and-Exporting-CSVs-to-Mass-Update-Prices-and-Quantities) -- full replace pattern, column structure
- [TCGPlayer 2026 Seller Commitment](https://seller.tcgplayer.com/blog/our-commitment-to-sellers-building-and-delivering-in-2026-and-beyond) -- planned inventory management improvements
- [Deckbox](https://deckbox.org/) -- collection management, tradelist features
- [EchoMTG](https://www.echomtg.com/) -- collection value tracking, stats dashboard
- [ManaBox Import/Export Guide](https://www.manabox.app/guides/collection/import-export/) -- CSV format, import requirements
- [PatternFly Bulk Selection Pattern](https://www.patternfly.org/patterns/bulk-selection/) -- checkbox + action bar UX
- [Smashing Magazine: Data Importer Design](https://www.smashingmagazine.com/2020/12/designing-attractive-usable-data-importer-app/) -- CSV import UX best practices
- [Bulk Actions UX Guidelines](https://www.eleken.co/blog-posts/bulk-actions-ux) -- floating action bar, disabled state handling
- [Shopify Inventory Management](https://www.shopify.com/retail/inventory-management) -- e-commerce inventory best practices
- [Budibase: Inventory Dashboard Guide](https://budibase.com/blog/tutorials/inventory-dashboard/) -- KPI cards, stats layout
- PROJECT.md requirements and constraints (HIGH confidence -- primary source)
- Existing codebase: `types.ts`, `csv-parser.ts`, `order.ts`, checkout API (HIGH confidence -- direct code analysis)

---
*Feature research for: Admin Panel & Inventory Management (v1.1)*
*Researched: 2026-04-11*
