# Phase 3: Search and Filters - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can quickly find specific cards using search, filters, and sorting. All filtering is client-side against the existing cards.json data. No new data fetching or API calls.

</domain>

<decisions>
## Implementation Decisions

### Filter bar layout
- Sticky top bar below the header — stays visible while scrolling the grid
- All controls in a single row: search input + mana colors + set dropdown + rarity dropdown + sort dropdown
- On mobile: only search field visible, tap a filter icon to expand controls in a bottom sheet
- Bottom sheet slides up from bottom, covers lower half of screen

### Mana color selector
- Icon pills using Scryfall mana SVGs (same CDN already used for oracle text)
- WUBRG + C (colorless) — 6 pills total
- Multi-select with OR logic: selecting W + U shows all White cards AND all Blue cards AND White-Blue cards
- Colorless (C) pill filters for cards with empty color identity

### Claude's Discretion
- Mana pill active/inactive visual treatment (full color vs grayed, ring highlight, etc.)

### Filter interaction
- All filters apply instantly — no Apply button
- Search filters as you type, color/set/rarity/sort update grid immediately on change
- Search placeholder: "Search cards..."
- Set and rarity filters are multi-select dropdowns (can select multiple sets or rarities)
- Single "Clear filters" button appears when any filter is active
- Empty state: "No cards match your filters" with a prominent "Clear filters" button

### Sort and results
- Sort control is a dropdown: Price (Low-High), Price (High-Low), Name (A-Z)
- Default sort order: Price High-Low (most expensive first)
- Show result count near filter bar: "Showing X of Y cards"

</decisions>

<specifics>
## Specific Ideas

- Mana icon pills reuse the same Scryfall SVG CDN pattern from the oracle text mana symbols (`https://svgs.scryfall.io/card-symbols/{SYMBOL}.svg`)
- Mobile bottom sheet pattern for filters — familiar mobile UX

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-search-and-filters*
*Context gathered: 2026-04-02*
