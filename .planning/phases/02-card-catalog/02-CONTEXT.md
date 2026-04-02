# Phase 2: Card Catalog - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Browsable card grid with detail view and mobile layout. Users see and interact with the full card inventory for the first time. Search, filtering, and cart functionality belong in later phases.

</domain>

<decisions>
## Implementation Decisions

### Card tile design
- Image-dominant layout — large card image with small metadata underneath, like browsing a binder
- Below image show: card name, price, condition + quantity (e.g. "NM x2")
- Set name not shown on tile (available in detail modal)
- Foil cards get a subtle "FOIL" badge/label on the tile
- Cards with no price show "N/A" but appear identical to priced cards (no dimming or visual distinction)

### Detail modal
- Modal overlay that pops up over the dimmed grid — close with X or clicking outside
- Grid stays in place behind the modal (scroll position preserved)
- Larger card image than the grid tile for better visibility
- Additional info beyond tile: oracle text, set + rarity, foil status
- Color identity not shown in modal (kept for filtering in Phase 3)

### Modal layout
- Claude's discretion on side-by-side vs stacked layout — pick what works best for both desktop and mobile

### Visual tone
- Clean + modern aesthetic — light/white background, minimal design, cards are the visual focus
- Blue/indigo accent color for buttons, highlights, and active states
- Header/nav branding: Claude's discretion on text logo vs minimal header
- Condition display styling: Claude's discretion (color-coded badges vs plain text)

### Mobile behavior
- 2 cards per row on phone screens — bigger tiles, easier to see card art
- 4-5 cards per row on desktop — medium density with comfortable whitespace
- Detail modal goes full screen on mobile
- Equal priority for desktop and mobile — responsive design, not mobile-first or desktop-first

### Claude's Discretion
- Modal layout choice (side-by-side vs stacked)
- Header/nav branding approach
- Condition badge styling
- Grid gap and spacing values
- Loading states and skeleton design
- Empty state if cards.json has no data

</decisions>

<specifics>
## Specific Ideas

- Grid should feel like browsing a physical binder of cards — image-dominant, not data-heavy
- Clean e-commerce feel, not fantasy/game themed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-card-catalog*
*Context gathered: 2026-04-02*
