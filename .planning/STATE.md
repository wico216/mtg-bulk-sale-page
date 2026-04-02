# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Friends can easily find and order cards from your bulk collection without friction
**Current focus:** Phase 4 - Shopping Cart

## Current Position

Phase: 4 of 5 (Shopping Cart)
Plan: 1 of 3 in current phase
Status: In Progress
Last activity: 2026-04-02 -- Completed 04-01 (Cart Store and Catalog Integration)

Progress: [████████░░] 82%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 8min | 2.7min |
| 02 | 3 | 15min | 5min |
| 03 | 3 | 24min | 8min |
| 04 | 1 | 3min | 3min |

**Recent Trend:**
- Last 5 plans: 02-03 (12min), 03-01 (2min), 03-02 (1min), 03-03 (21min), 04-01 (3min)
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Stack is Next.js 16 (SSG) + Tailwind + Zustand + PapaParse + Scryfall API + Resend
- [Roadmap]: Static site with build-time Scryfall enrichment (not runtime) to respect rate limits
- [Roadmap]: Zero database -- card data generated at build time from CSV
- [01-01]: Composite dedup key: setCode-collectorNumber-foil-condition for distinct card listings
- [01-01]: String-coerce collectorNumber from PapaParse dynamicTyping to avoid numeric type mismatch
- [01-02]: No name+set fallback needed: SLD high collector numbers resolve via standard Scryfall endpoint
- [01-02]: Price fallback chain: usd -> usd_foil -> usd_etched -> null covers all printings
- [01-03]: Chain generate before next build so cards.json is always fresh on deploy
- [02-01]: Oracle text for DFC joined with ' // ' separator matching Scryfall convention
- [02-03]: Scroll lock in card-grid.tsx via useEffect, keeping card-modal.tsx presentational
- [02-03]: Mana symbols rendered as Scryfall SVG CDN icons parsed from {X} syntax
- [03-01]: Zustand 5 curried create pattern for TypeScript; Set toggles use new Set() for reactivity
- [03-01]: Color filter OR logic with colorless (C) as special case checking empty colorIdentity
- [03-01]: Null prices sort to end in both price-desc and price-asc
- [03-02]: Rarity dropdown uses MTG conventional order (mythic/rare/uncommon/common) not alphabetical
- [03-02]: MultiSelect backdrop div pattern for outside-click close prevents two-open-at-once pitfall
- [03-02]: Native select for SortDropdown with only 3 fixed options
- [03-03]: Set picker as its own bottom sheet (z-50) with search and clear, not a dropdown in the main sheet
- [03-03]: Rarity/sort use inline toggle pills on mobile (small option sets don't need dropdowns)
- [03-03]: Selected sets sort to top of set picker list for quick filter management
- [03-03]: Zustand selectors must not call getFilteredCards() (new array = SSR infinite loop); use useMemo with individual state subscriptions
- [04-01]: Cart store uses Map<string, number> with custom replacer/reviver for localStorage JSON serialization
- [04-01]: createJSONStorage wraps localStorage for SSG safety (no build failures without manual checks)
- [04-01]: Tile cart controls use span[role=button] with stopPropagation to avoid nested <button> DOM violations
- [04-01]: Plus button disables at stock cap (no message on tile; message is for cart page input per user decision)

### Pending Todos

None yet.

### Blockers/Concerns

- Resend free tier limits need verification at signup (Phase 5)

## Session Continuity

Last session: 2026-04-02
Stopped at: Completed 04-01-PLAN.md -- Cart store created, catalog integration complete (header badge, tile stepper, modal add-to-cart).
Resume file: .planning/phases/04-shopping-cart/04-02-PLAN.md (next plan)
