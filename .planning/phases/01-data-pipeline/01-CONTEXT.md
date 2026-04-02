# Phase 1: Data Pipeline - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A Manabox CSV export is transformed into structured, enriched card data ready for the frontend. This includes CSV parsing, Scryfall API enrichment (images and prices), and a card data model. Multiple CSV files are merged into a single inventory pool. The output is build-time generated JSON consumed by the Next.js frontend.

</domain>

<decisions>
## Implementation Decisions

### Price sourcing
- Use Scryfall TCGPlayer market price as the displayed price (not the CSV purchase price)
- Exact market price — no markup or discount applied
- If Scryfall returns no price for a card, show "Price N/A" (card still appears in store)
- No minimum price threshold — all cards appear regardless of price
- Show everything in USD (all inventory is USD)

### Scryfall matching
- Match cards by set code + collector number (primary strategy), not by Scryfall ID from CSV
- Extra care for Secret Lair (SLD) variants — try alternate matching strategies (e.g. name + set fallback) for high collector numbers
- If a card cannot be found on Scryfall at all, skip it entirely — only Scryfall-verified cards appear in the store
- Build process must print a summary: "Processed X cards, Y skipped (no match), Z missing prices"

### CSV field usage
- **Include in data model:** Name, Set code, Set name, Collector number, Foil status, Rarity, Quantity, Condition
- **Ignore:** Misprint, Altered, Language, Purchase price, Purchase price currency, ManaBox ID, Scryfall ID
- Foil status is visible to buyers (foil vs normal)
- Condition is visible to buyers (near_mint, etc.)
- Language and currency fields ignored — all cards are English/USD

### Multiple CSV support
- Support multiple CSV files in a designated directory
- All CSVs are merged into one inventory pool — buyers don't see which binder a card came from
- Binder/collection name derived from filename but used only internally (not displayed)
- Update workflow: replace CSV files and rebuild/redeploy

### Data freshness
- Scryfall responses cached with 24-hour expiry to balance freshness and API courtesy
- Store displays a "last updated" date derived from build time
- Prices refresh when cache expires and a new build is triggered

### Claude's Discretion
- Cache storage mechanism (file-based, SQLite, etc.)
- Scryfall rate limiting implementation details
- Exact card data model field types and structure
- How to handle duplicate cards across multiple CSVs (same card in different binders)

</decisions>

<specifics>
## Specific Ideas

- CSV files live in project directory (e.g. "Blue Binder.csv" is already present at project root)
- Scryfall API is free, no auth required — but has rate limits (respect 50-100ms between requests)
- Secret Lair cards have unusual collector numbers (1700+) that may need special handling

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-data-pipeline*
*Context gathered: 2026-04-02*
