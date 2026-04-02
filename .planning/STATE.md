# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Friends can easily find and order cards from your bulk collection without friction
**Current focus:** Phase 3 - Search and Filters

## Current Position

Phase: 3 of 5 (Search and Filters)
Plan: 2 of 3 in current phase
Status: In Progress
Last activity: 2026-04-02 -- Completed 03-02 (Desktop Filter Controls)

Progress: [████████░░] 80%

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
| 03 | 2 | 3min | 1.5min |

**Recent Trend:**
- Last 5 plans: 02-01 (1min), 02-02 (2min), 02-03 (12min), 03-01 (2min), 03-02 (1min)
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

### Pending Todos

None yet.

### Blockers/Concerns

- Resend free tier limits need verification at signup (Phase 5)

## Session Continuity

Last session: 2026-04-02
Stopped at: Completed 03-02-PLAN.md -- All desktop filter controls integrated, ready for 03-03 mobile bottom sheet
Resume file: .planning/phases/03-search-and-filters/03-03-PLAN.md
