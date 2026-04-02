# Phase 3: Search and Filters - Research

**Researched:** 2026-04-02
**Domain:** Client-side filtering/sorting, Zustand state management, sticky filter bar UI, Tailwind v4
**Confidence:** HIGH

## Summary

Phase 3 adds search, filtering, and sorting to the existing card catalog. The dataset is small (136 cards, ~2300 lines JSON) and fully loaded at build time, making client-side filtering the correct approach with zero performance concerns. The primary architectural change is introducing Zustand for filter state management -- this is the first use of a global store in the project. All five requirements (CATL-02 through CATL-06) are client-side UI features that combine: a text search, mana color pills, multi-select set/rarity dropdowns, and a sort dropdown.

The existing `card-grid.tsx` client component already receives the full `Card[]` array as props from the server component. The filtering/sorting logic will live in a Zustand store that holds filter state and a derived `filteredCards` computed from the source data. The UI adds a sticky filter bar between the header and the grid, with a mobile bottom sheet for filter controls. No new data model changes or build pipeline modifications are needed -- all required card fields (`name`, `colorIdentity`, `setCode`, `setName`, `rarity`, `price`) already exist.

**Primary recommendation:** Install Zustand 5, create a single filter store with all filter state and derived `filteredCards`, build the filter bar as a new client component, and modify `card-grid.tsx` to consume filtered results from the store instead of raw props.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sticky top bar below the header -- stays visible while scrolling the grid
- All controls in a single row: search input + mana colors + set dropdown + rarity dropdown + sort dropdown
- On mobile: only search field visible, tap a filter icon to expand controls in a bottom sheet
- Bottom sheet slides up from bottom, covers lower half of screen
- Icon pills using Scryfall mana SVGs (same CDN already used for oracle text)
- WUBRG + C (colorless) -- 6 pills total
- Multi-select with OR logic: selecting W + U shows all White cards AND all Blue cards AND White-Blue cards
- Colorless (C) pill filters for cards with empty color identity
- All filters apply instantly -- no Apply button
- Search filters as you type, color/set/rarity/sort update grid immediately on change
- Search placeholder: "Search cards..."
- Set and rarity filters are multi-select dropdowns (can select multiple sets or rarities)
- Single "Clear filters" button appears when any filter is active
- Empty state: "No cards match your filters" with a prominent "Clear filters" button
- Sort control is a dropdown: Price (Low-High), Price (High-Low), Name (A-Z)
- Default sort order: Price High-Low (most expensive first)
- Show result count near filter bar: "Showing X of Y cards"

### Claude's Discretion
- Mana pill active/inactive visual treatment (full color vs grayed, ring highlight, etc.)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CATL-02 | User can search cards by name with real-time filtering | Text input with case-insensitive `name.toLowerCase().includes(query)` against Card.name. Zustand store holds `searchQuery` string, filtering runs on every keystroke. 136 cards means no debounce needed. |
| CATL-03 | User can filter cards by mana color (WUBRG multi-select) | Mana color pills (W, U, B, R, G, C) stored as `Set<string>` in Zustand. OR logic: card passes if any of its `colorIdentity` entries match any selected color. Colorless (C) matches cards with `colorIdentity.length === 0`. Scryfall SVG icons confirmed at `https://svgs.scryfall.io/card-symbols/{W,U,B,R,G,C}.svg` (all return 200). |
| CATL-04 | User can filter cards by set/expansion | Multi-select dropdown populated from unique `setName` values in card data (25 unique sets). Store holds `selectedSets: Set<string>`. Card passes if `selectedSets` is empty OR `card.setName` is in `selectedSets`. |
| CATL-05 | User can filter cards by rarity | Multi-select dropdown populated from unique `rarity` values (common, uncommon, rare, mythic). Store holds `selectedRarities: Set<string>`. Same logic as set filter. |
| CATL-06 | User can sort cards by price (low-high, high-low) and by name (A-Z) | Sort dropdown with 3 options. Default: Price High-Low. Null prices sort to end for price sorts. Zustand store holds `sortBy` enum. Sort applied after all filters. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.2 | Framework, SSG | Already in project |
| React | 19.2.4 | UI components | Already in project |
| Tailwind CSS | v4 | Styling, responsive layout | Already in project, uses `@theme inline {}` in CSS |

### New Dependency
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.0.12 | Filter/sort state management | Prior project decision. ~1KB gzipped. No Provider needed. Hook-based API integrates cleanly with existing client components. |

### Supporting (no new deps)
| Tool | Purpose | Notes |
|------|---------|-------|
| `useMemo` | Derive filtered/sorted cards from store state | React built-in. Overkill for 136 items but establishes correct pattern for future growth |
| Scryfall SVG CDN | Mana color pill icons | Already used in `card-modal.tsx` for oracle text symbols. URL pattern: `https://svgs.scryfall.io/card-symbols/{SYMBOL}.svg` |

### No Alternatives Needed
The project decision specifies Zustand. With 136 cards, even plain `useState` would work, but Zustand provides a clean separation of filter logic from UI components and will scale to the cart state needed in Phase 4.

**Installation:**
```bash
npm install zustand
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx              # Unchanged -- passes cards + meta to CardGrid
│   └── globals.css           # Minor: may add filter bar spacing variable
├── components/
│   ├── card-grid.tsx          # Modified: reads filteredCards from store instead of raw props
│   ├── card-tile.tsx          # Unchanged
│   ├── card-modal.tsx         # Unchanged
│   ├── header.tsx             # Unchanged
│   ├── filter-bar.tsx         # NEW: sticky bar with search + filter controls (desktop)
│   ├── filter-bottom-sheet.tsx # NEW: mobile bottom sheet with full filter controls
│   ├── mana-color-pills.tsx   # NEW: WUBRG+C toggle pills
│   ├── multi-select.tsx       # NEW: reusable multi-select dropdown for set/rarity
│   └── sort-dropdown.tsx      # NEW: sort control dropdown
└── lib/
    ├── types.ts               # Unchanged
    ├── store/
    │   └── filter-store.ts    # NEW: Zustand store for all filter/sort state
    └── (existing files)       # Unchanged
```

### Pattern 1: Zustand Store with Derived State
**What:** Single store holds all filter primitives. A `getFilteredCards` selector computes the filtered+sorted result. Components subscribe to just what they need.
**When to use:** When multiple independent UI controls affect a shared derived result.
**Example:**
```typescript
// src/lib/store/filter-store.ts
import { create } from 'zustand';
import type { Card } from '@/lib/types';

type SortOption = 'price-desc' | 'price-asc' | 'name-asc';

interface FilterState {
  // Source data (set once on mount)
  allCards: Card[];
  
  // Filter primitives
  searchQuery: string;
  selectedColors: Set<string>;
  selectedSets: Set<string>;
  selectedRarities: Set<string>;
  sortBy: SortOption;
  
  // Actions
  setAllCards: (cards: Card[]) => void;
  setSearchQuery: (query: string) => void;
  toggleColor: (color: string) => void;
  toggleSet: (set: string) => void;
  toggleRarity: (rarity: string) => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;
  
  // Derived
  getFilteredCards: () => Card[];
  hasActiveFilters: () => boolean;
}
```

### Pattern 2: Store Initialization from Server Component Props
**What:** The server component loads data at build time and passes it to the client component tree. The client component initializes the Zustand store with the card data on mount.
**When to use:** SSG + client interactivity pattern used throughout this project.
**Example:**
```typescript
// In card-grid.tsx or a wrapper component
'use client';
import { useEffect } from 'react';
import { useFilterStore } from '@/lib/store/filter-store';

export default function CardGrid({ cards, meta }: CardGridProps) {
  const setAllCards = useFilterStore((s) => s.setAllCards);
  
  useEffect(() => {
    setAllCards(cards);
  }, [cards, setAllCards]);
  
  // ... render using store's getFilteredCards()
}
```

### Pattern 3: Sticky Filter Bar with Tailwind
**What:** A `sticky top-0` bar positioned below the header that stays fixed while scrolling the card grid.
**When to use:** Filter controls that must remain accessible during scroll.
**Example:**
```tsx
<header className="border-b border-zinc-200 dark:border-zinc-800">
  {/* existing header */}
</header>
<div className="sticky top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
  <FilterBar />
</div>
<main className="pt-6">
  <CardGrid cards={data.cards} meta={data.meta} />
</main>
```

### Pattern 4: CSS-Only Mobile Bottom Sheet
**What:** A fixed-position overlay that slides up from the bottom of the screen, covering the lower half. Uses CSS transitions for the slide animation. No animation library needed.
**When to use:** Mobile filter panels where a dropdown would be too cramped.
**Example:**
```tsx
// Simplified bottom sheet pattern
<div className={`fixed inset-0 z-40 ${isOpen ? '' : 'pointer-events-none'}`}>
  {/* Backdrop */}
  <div
    className={`absolute inset-0 bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0'}`}
    onClick={onClose}
  />
  {/* Sheet */}
  <div className={`absolute bottom-0 left-0 right-0 h-1/2 bg-white rounded-t-xl 
    transform transition-transform ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
    {children}
  </div>
</div>
```

### Pattern 5: Multi-Select Dropdown (Custom, No Library)
**What:** A button that toggles a dropdown panel with checkboxes. Selected items shown as count in the button label. Hand-rolled since the interaction is simple (toggle items in a set) and adding a library like Headless UI is overkill for 2 dropdowns with known, small option lists.
**When to use:** Fixed, small option lists (25 sets, 4 rarities) with multi-select behavior.
**Note:** Close dropdown on outside click using a simple backdrop div or `useEffect` with document click listener.

### Anti-Patterns to Avoid
- **Debouncing search for 136 items:** Debounce adds complexity for zero benefit at this scale. Filter on every keystroke.
- **Separate stores per filter:** One store with all filter state. Separate stores create coordination headaches and the "clear all" action becomes awkward.
- **URL-synced filter state:** Not needed for this app. Filters are ephemeral -- users are browsing a small catalog, not sharing filter links.
- **`useMemo` with complex dependency arrays:** With 136 items, the filtering function runs in microseconds. `useMemo` is fine for correctness but don't over-optimize.
- **Third-party dropdown/select library:** The option lists are small and known at build time. A custom multi-select with checkboxes is simpler than integrating Headless UI or React Select.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filter state management | `useState` chains across components | Zustand store | Single source of truth, no prop drilling, clean actions |
| Mana symbol icons | Custom SVG sprites or icon fonts | Scryfall SVG CDN (`svgs.scryfall.io/card-symbols/{X}.svg`) | Already proven in oracle text rendering, official source |
| Responsive breakpoint detection | JS-based `window.innerWidth` listeners | Tailwind responsive prefixes + CSS `@media` | Tailwind handles this natively with `md:`, `lg:` etc. |

**Key insight:** The multi-select dropdown IS worth hand-rolling here. The option lists are small (25 sets, 4 rarities), the interaction is simple (toggle checkboxes), and pulling in a library like Headless UI Listbox adds ~10KB for a problem solvable in ~50 lines of JSX.

## Common Pitfalls

### Pitfall 1: Set Serialization in Zustand
**What goes wrong:** Using `Set<string>` for `selectedColors`, `selectedSets`, `selectedRarities` in Zustand state causes components not to re-render when sets are mutated.
**Why it happens:** Zustand uses `Object.is` equality by default. Mutating a Set (`.add()`, `.delete()`) returns the same reference, so Zustand thinks nothing changed.
**How to avoid:** Always create a new Set in the `set()` updater:
```typescript
toggleColor: (color) => set((state) => {
  const next = new Set(state.selectedColors);
  if (next.has(color)) next.delete(color);
  else next.add(color);
  return { selectedColors: next };
}),
```
**Warning signs:** Clicking a filter pill/checkbox does nothing visually, but the store value changes when inspected.

### Pitfall 2: Colorless Filter Logic
**What goes wrong:** The colorless (C) pill doesn't work because `colorIdentity` never contains "C" -- colorless cards have an empty array `[]`.
**Why it happens:** In Scryfall's data model, colorless cards have `color_identity: []`, not `color_identity: ["C"]`. The "C" is a UI concept, not a data value.
**How to avoid:** Special-case the "C" filter: when "C" is selected, include cards where `colorIdentity.length === 0`. The current dataset has 29 colorless cards.
```typescript
// Color filter logic
if (selectedColors.size > 0) {
  const wantsColorless = selectedColors.has('C');
  const colorCodes = [...selectedColors].filter(c => c !== 'C');
  
  cards = cards.filter(card => {
    if (wantsColorless && card.colorIdentity.length === 0) return true;
    if (colorCodes.length === 0) return false;
    return card.colorIdentity.some(ci => colorCodes.includes(ci));
  });
}
```
**Warning signs:** Selecting the C pill shows no results, or shows all cards.

### Pitfall 3: Null Prices in Sort
**What goes wrong:** Cards with `price: null` sort to the top of price-ascending, or `.sort()` produces inconsistent ordering.
**Why it happens:** Comparing `null` values with `<` or `>` yields `false`, leading to unstable sort order.
**How to avoid:** Push null-priced cards to the end regardless of sort direction:
```typescript
if (a.price === null && b.price !== null) return 1;
if (a.price !== null && b.price === null) return -1;
if (a.price === null && b.price === null) return 0;
```
**Note:** Current dataset has 0 null-price cards, but the Card type allows it and future imports may have them.

### Pitfall 4: Sticky Bar Z-Index Conflict with Modal
**What goes wrong:** The sticky filter bar appears above the card detail modal overlay.
**Why it happens:** The existing modal uses `z-50`, the lightbox uses `z-[60]`. If the filter bar uses a high z-index, it bleeds through.
**How to avoid:** Use `z-30` for the sticky filter bar. The existing z-index hierarchy is:
- `z-30` -- filter bar (new)
- `z-40` -- bottom sheet (new)
- `z-50` -- card modal (existing)
- `z-[60]` -- lightbox (existing)

### Pitfall 5: Mobile Bottom Sheet and Body Scroll
**What goes wrong:** Background scrolls behind the bottom sheet on mobile.
**Why it happens:** Same iOS scroll-through issue as the card modal.
**How to avoid:** Reuse the same `document.body.style.overflow = "hidden"` pattern already established in `card-grid.tsx` for the modal. Apply it when the bottom sheet opens.

### Pitfall 6: Multi-Select Dropdown Not Closing
**What goes wrong:** Opening the set dropdown, then clicking the rarity dropdown, leaves both open.
**Why it happens:** Each dropdown manages its own open/close state independently.
**How to avoid:** Either (a) use a single `openDropdown: string | null` state in the filter store, or (b) close on any outside click via a backdrop element pattern.

## Code Examples

### Zustand Filter Store (Verified Pattern for Zustand 5 + TypeScript)
```typescript
// src/lib/store/filter-store.ts
import { create } from 'zustand';
import type { Card } from '@/lib/types';

export type SortOption = 'price-desc' | 'price-asc' | 'name-asc';

interface FilterState {
  allCards: Card[];
  searchQuery: string;
  selectedColors: Set<string>;
  selectedSets: Set<string>;
  selectedRarities: Set<string>;
  sortBy: SortOption;
  
  setAllCards: (cards: Card[]) => void;
  setSearchQuery: (query: string) => void;
  toggleColor: (color: string) => void;
  toggleSet: (setName: string) => void;
  toggleRarity: (rarity: string) => void;
  setSortBy: (sort: SortOption) => void;
  clearFilters: () => void;
}

const DEFAULT_SORT: SortOption = 'price-desc';

export const useFilterStore = create<FilterState>()((set, get) => ({
  allCards: [],
  searchQuery: '',
  selectedColors: new Set<string>(),
  selectedSets: new Set<string>(),
  selectedRarities: new Set<string>(),
  sortBy: DEFAULT_SORT,

  setAllCards: (cards) => set({ allCards: cards }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleColor: (color) => set((state) => {
    const next = new Set(state.selectedColors);
    next.has(color) ? next.delete(color) : next.add(color);
    return { selectedColors: next };
  }),

  toggleSet: (setName) => set((state) => {
    const next = new Set(state.selectedSets);
    next.has(setName) ? next.delete(setName) : next.add(setName);
    return { selectedSets: next };
  }),

  toggleRarity: (rarity) => set((state) => {
    const next = new Set(state.selectedRarities);
    next.has(rarity) ? next.delete(rarity) : next.add(rarity);
    return { selectedRarities: next };
  }),

  setSortBy: (sort) => set({ sortBy: sort }),

  clearFilters: () => set({
    searchQuery: '',
    selectedColors: new Set<string>(),
    selectedSets: new Set<string>(),
    selectedRarities: new Set<string>(),
    sortBy: DEFAULT_SORT,
  }),
}));
```

### Filter + Sort Logic (Pure Function)
```typescript
// Can live in the store as a selector or as a standalone util
export function filterAndSortCards(
  cards: Card[],
  searchQuery: string,
  selectedColors: Set<string>,
  selectedSets: Set<string>,
  selectedRarities: Set<string>,
  sortBy: SortOption,
): Card[] {
  let result = cards;

  // 1. Name search (case-insensitive)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter(c => c.name.toLowerCase().includes(q));
  }

  // 2. Color filter (OR logic, special-case colorless)
  if (selectedColors.size > 0) {
    const wantsColorless = selectedColors.has('C');
    const colorCodes = [...selectedColors].filter(c => c !== 'C');
    result = result.filter(card => {
      if (wantsColorless && card.colorIdentity.length === 0) return true;
      if (colorCodes.length === 0) return false;
      return card.colorIdentity.some(ci => colorCodes.includes(ci));
    });
  }

  // 3. Set filter
  if (selectedSets.size > 0) {
    result = result.filter(c => selectedSets.has(c.setName));
  }

  // 4. Rarity filter
  if (selectedRarities.size > 0) {
    result = result.filter(c => selectedRarities.has(c.rarity));
  }

  // 5. Sort
  result = [...result].sort((a, b) => {
    switch (sortBy) {
      case 'price-desc':
        if (a.price === null && b.price !== null) return 1;
        if (a.price !== null && b.price === null) return -1;
        if (a.price === null && b.price === null) return 0;
        return b.price! - a.price!;
      case 'price-asc':
        if (a.price === null && b.price !== null) return 1;
        if (a.price !== null && b.price === null) return -1;
        if (a.price === null && b.price === null) return 0;
        return a.price! - b.price!;
      case 'name-asc':
        return a.name.localeCompare(b.name);
    }
  });

  return result;
}
```

### Mana Color Pill Component
```tsx
// Scryfall CDN URL pattern (verified -- all return HTTP 200)
const MANA_COLORS = [
  { code: 'W', label: 'White' },
  { code: 'U', label: 'Blue' },
  { code: 'B', label: 'Black' },
  { code: 'R', label: 'Red' },
  { code: 'G', label: 'Green' },
  { code: 'C', label: 'Colorless' },
] as const;

function ManaPill({ code, label, active, onClick }: {
  code: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filter by ${label}`}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
        transition-colors cursor-pointer
        ${active
          ? 'bg-accent/10 ring-2 ring-accent'
          : 'bg-zinc-100 dark:bg-zinc-800 opacity-50 hover:opacity-75'
        }`}
    >
      <img
        src={`https://svgs.scryfall.io/card-symbols/${code}.svg`}
        alt={`{${code}}`}
        className="w-4 h-4"
      />
    </button>
  );
}
```

### Sticky Filter Bar (Desktop)
```tsx
<div className="sticky top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
  <div className="max-w-7xl mx-auto flex items-center gap-3">
    {/* Search */}
    <input
      type="text"
      placeholder="Search cards..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="flex-shrink-0 w-48 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
    />
    {/* Mana pills -- hidden on mobile */}
    <div className="hidden md:flex items-center gap-1.5">
      {MANA_COLORS.map(({ code, label }) => (
        <ManaPill key={code} code={code} label={label}
          active={selectedColors.has(code)} onClick={() => toggleColor(code)} />
      ))}
    </div>
    {/* Set dropdown -- hidden on mobile */}
    <div className="hidden md:block">{/* MultiSelect for sets */}</div>
    {/* Rarity dropdown -- hidden on mobile */}
    <div className="hidden md:block">{/* MultiSelect for rarity */}</div>
    {/* Sort dropdown */}
    <div className="hidden md:block">{/* Sort dropdown */}</div>
    {/* Mobile filter icon */}
    <button className="md:hidden ml-auto" onClick={openBottomSheet}>
      {/* filter icon */}
    </button>
    {/* Result count + Clear */}
    <span className="hidden md:inline text-xs text-zinc-400 ml-auto">
      Showing {filteredCount} of {totalCount} cards
    </span>
  </div>
</div>
```

## Discretion Recommendations

### Mana Pill Active/Inactive Visual Treatment
**Recommendation:** Use opacity + ring highlight approach:
- **Inactive:** `opacity-50` on the pill, muted background (`bg-zinc-100 dark:bg-zinc-800`). The Scryfall SVG is naturally colorful, so reducing opacity naturally grays it out.
- **Active:** Full opacity, subtle accent-colored ring (`ring-2 ring-accent`), light accent tinted background (`bg-accent/10`).
- **Hover (inactive):** `hover:opacity-75` for discoverability.

This approach is simple (2 CSS states), works with both light and dark mode, and leverages the inherent color of the Scryfall mana SVGs rather than trying to colorize/decolorize them.

## Data Shape Reference

Current dataset characteristics (from `cards.json` analysis):
- **Total cards:** 136
- **Unique sets:** 25 (longest name: "Commander Legends: Battle for Baldur's Gate")
- **Rarities:** common, uncommon, rare, mythic
- **Color identities:** W, U, B, R, G (no "C" in data -- colorless = empty array)
- **Colorless cards:** 29 (21% of catalog)
- **Multi-color cards:** 27 (20% of catalog)
- **Price range:** $0.25 - $116.11 (zero null prices currently)
- **Cards with no image:** 0 (all have imageUrl)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Redux + reducers + actions | Zustand 5 single `create()` call | Zustand 5 (2024-2025) | No boilerplate, no Provider, ~1KB |
| `shallow` equality function | `useShallow` hook from `zustand/shallow` | Zustand 5 | Smaller bundle, cleaner API for multi-property selectors |
| Headless UI / React Select | Custom dropdowns for known small lists | 2025-2026 consensus | Libraries add 10KB+ for a 50-line component when options are static |
| `tailwind.config.js` | Tailwind v4 `@theme inline {}` in CSS | Tailwind v4 (2025) | Already in use in this project |

## Open Questions

1. **Multi-color card display with OR filter logic**
   - What we know: OR logic means selecting W + U shows all cards with W, all with U, and all with W+U. A card like Azorius (W,U) appears if EITHER W or U is selected.
   - What's unclear: Whether users might expect AND logic instead ("show only cards that are BOTH W and U"). The CONTEXT.md specifies OR explicitly.
   - Recommendation: Implement OR as decided. The pill UI makes OR intuitive -- each pill acts as "include this color."

2. **Set dropdown ordering**
   - What we know: 25 unique sets, names vary widely in length.
   - What's unclear: Should sets be alphabetical, or ordered by card count?
   - Recommendation: Alphabetical by set name -- predictable, easy to scan. The planner can decide this detail.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** -- `card-grid.tsx`, `card-modal.tsx`, `card-tile.tsx`, `types.ts`, `enrichment.ts`, `page.tsx`, `header.tsx`, `globals.css`, `next.config.ts`, `package.json` -- all read and analyzed
- **cards.json analysis** -- 136 cards, 25 sets, 4 rarities, WUBRG colors + 29 colorless, price range verified
- **Scryfall SVG CDN** -- All 6 URLs (W, U, B, R, G, C) verified with HTTP 200 responses
- **Next.js 16 docs** at `node_modules/next/dist/docs/` -- server/client component patterns confirmed
- **[Zustand official docs](https://zustand.docs.pmnd.rs/)** -- TypeScript guide, `useShallow`, store creation
- **[Zustand npm](https://www.npmjs.com/package/zustand)** -- v5.0.12 confirmed latest

### Secondary (MEDIUM confidence)
- **[Zustand GitHub](https://github.com/pmndrs/zustand)** -- v5 migration guide confirms `useShallow` from `zustand/shallow`
- **[Zustand TypeScript beginner guide](https://zustand.docs.pmnd.rs/learn/guides/beginner-typescript)** -- curried `create<State>()()` pattern for v5
- **[Tailwind CSS position docs](https://tailwindcss.com/docs/position)** -- `sticky top-0` utility confirmed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zustand 5 version confirmed on npm, install is one command, existing project has all other deps
- Architecture: HIGH -- pattern follows established server-loads-data / client-renders approach already in codebase, Zustand integration is well-documented
- Pitfalls: HIGH -- identified from actual data analysis (colorless=empty array, null prices, z-index hierarchy) and Zustand docs (Set mutation reactivity)
- UI patterns: HIGH -- sticky bar, bottom sheet, and pill toggle patterns use standard Tailwind utilities verified in docs

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, no fast-moving dependencies)
