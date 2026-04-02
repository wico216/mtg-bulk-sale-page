# Phase 2: Card Catalog - Research

**Researched:** 2026-04-02
**Domain:** Next.js 16 responsive UI, card grid layout, modal patterns, Tailwind v4
**Confidence:** HIGH

## Summary

Phase 2 transforms the existing pipeline-stats page into a browsable card catalog. The codebase already has a working data pipeline producing 136 enriched cards in `data/generated/cards.json`, a Next.js 16 app with Tailwind v4, and typed Card/CardData interfaces. The main work is: (1) building a responsive CSS Grid of image-dominant card tiles, (2) implementing a client-side detail modal with state management, and (3) extending the data model to include `oracleText` which is required for the detail modal but currently missing from the Card type and enrichment pipeline.

The critical discovery is that **oracle text is not currently in the data model**. The `Card` interface and `enrichCards()` function do not extract `oracle_text` from Scryfall responses. This must be added before the detail modal can show oracle text as required by CATL-07.

**Primary recommendation:** Extend the Card type with `oracleText`, update enrichment to extract it (handling double-faced cards the same way as `imageUrl`), regenerate cards.json, then build the grid and modal UI as client components.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Image-dominant tile layout: large card image with small metadata underneath (name, price, condition + quantity)
- Set name NOT shown on tile (only in detail modal)
- Foil cards get a subtle "FOIL" badge/label on the tile
- Cards with no price show "N/A" but appear identical to priced cards
- Modal overlay with dimmed background, close with X or clicking outside
- Grid scroll position preserved when modal opens
- Larger card image in modal than grid tile
- Modal shows: oracle text, set + rarity, foil status (NOT color identity)
- Clean + modern aesthetic, light/white background, minimal design
- Blue/indigo accent color for buttons, highlights, active states
- 2 cards per row on phone, 4-5 on desktop
- Detail modal goes full screen on mobile
- Equal priority desktop and mobile

### Claude's Discretion
- Modal layout choice (side-by-side vs stacked)
- Header/nav branding approach
- Condition badge styling
- Grid gap and spacing values
- Loading states and skeleton design
- Empty state if cards.json has no data

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CATL-01 | User can browse cards in a responsive grid showing image, name, set, price, condition, and quantity | CSS Grid with responsive columns (2 on mobile, 4-5 on desktop). Card data already contains all fields except set is only shown in modal per user decision. Note: user decided set name NOT on tile, but CATL-01 says "set" -- context decision overrides since set is available in detail modal |
| CATL-07 | User can tap/click a card to see detail modal with oracle text and full metadata | Requires adding `oracleText` to Card type and enrichment pipeline. Modal is a client component with useState for selected card. Scryfall provides `oracle_text` field. |
| CATL-08 | Card catalog is mobile-responsive (works on phone screens) | Tailwind v4 responsive prefixes (sm, md, lg). 2-column grid on mobile, 4-5 on desktop. Modal goes fullscreen on mobile via responsive classes. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.2 | Framework, SSG rendering | Already in project |
| React | 19.2.4 | UI components | Already in project |
| Tailwind CSS | v4 | Styling, responsive layout | Already in project, v4 uses `@import "tailwindcss"` syntax |

### Supporting (no new dependencies needed)
| Tool | Purpose | Notes |
|------|---------|-------|
| next/image | Optimized remote images from Scryfall | Built into Next.js, needs `remotePatterns` config |
| CSS Grid | Responsive card layout | Native CSS, no library needed |
| React useState | Modal open/close state | Built into React, no state library needed for this phase |
| HTML `<dialog>` | Native modal element | Modern browsers support, accessible by default |

### No New Dependencies
This phase requires zero new npm packages. Everything needed is already available via Next.js 16, React 19, and Tailwind v4.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── layout.tsx          # Update: add header/nav branding
│   ├── page.tsx            # Rewrite: card grid (server component loads data, passes to client)
│   └── globals.css         # Update: add accent color theme variables
├── components/
│   ├── card-grid.tsx       # Client component: grid + modal state
│   ├── card-tile.tsx       # Card tile in grid (image + metadata)
│   ├── card-modal.tsx      # Detail modal overlay
│   └── header.tsx          # Site header/nav
└── lib/
    ├── types.ts            # Update: add oracleText to Card interface
    ├── enrichment.ts       # Update: extract oracle_text from Scryfall
    └── (existing files)    # Unchanged
```

### Pattern 1: Server Component Loads Data, Client Component Renders Grid
**What:** The page.tsx (Server Component) reads cards.json at build time and passes the card array as a prop to a client component that handles interactivity (modal open/close).
**When to use:** When data is static but UI needs interactivity.
**Example:**
```typescript
// src/app/page.tsx (Server Component)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CardData } from "@/lib/types";
import { CardGrid } from "@/components/card-grid";

function loadCardData(): CardData | null {
  try {
    const filePath = resolve(process.cwd(), "data/generated/cards.json");
    return JSON.parse(readFileSync(filePath, "utf-8")) as CardData;
  } catch {
    return null;
  }
}

export default function Home() {
  const data = loadCardData();
  if (!data) return <EmptyState />;
  return <CardGrid cards={data.cards} meta={data.meta} />;
}
```

```typescript
// src/components/card-grid.tsx (Client Component)
'use client'
import { useState } from 'react';
import type { Card } from '@/lib/types';

export function CardGrid({ cards }: { cards: Card[] }) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  // ... grid rendering + modal
}
```

### Pattern 2: Modal with Native `<dialog>` or div overlay
**What:** Use a div overlay with fixed positioning for the modal. The `<dialog>` element provides accessibility benefits but requires `showModal()` imperative API which is less React-idiomatic. A div-based overlay with proper aria attributes and focus trapping is the pragmatic choice.
**When to use:** When you need accessible modal behavior with React state control.

### Pattern 3: Responsive Grid with CSS Grid + Tailwind
**What:** Use CSS Grid with Tailwind's `grid-cols-2` (mobile) and responsive `md:grid-cols-4` or `lg:grid-cols-5` for desktop.
**When to use:** Card grid layouts where items are uniform size.
**Example:**
```tsx
<div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
  {cards.map(card => <CardTile key={card.id} card={card} />)}
</div>
```

### Pattern 4: next/image with fill for Aspect Ratio Cards
**What:** Use `next/image` with `fill` prop inside a parent container with `aspect-[5/7]` (standard MTG card ratio) to avoid specifying exact width/height for remote Scryfall images.
**Example:**
```tsx
<div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg">
  <Image
    src={card.imageUrl}
    alt={card.name}
    fill
    sizes="(max-width: 768px) 50vw, 20vw"
    className="object-cover"
  />
</div>
```

### Anti-Patterns to Avoid
- **Making the entire page a Client Component:** Only the interactive grid/modal needs `'use client'`. Data loading stays in the Server Component.
- **Using `<img>` tags for Scryfall images:** `next/image` provides lazy loading, sizing optimization, and prevents layout shift. Use it.
- **Storing modal state in URL/route:** This is a simple overlay modal, not a route-based modal. useState is sufficient.
- **Body scroll lock with JS:** Use `overflow: hidden` on body via a class toggle when modal is open. CSS is simpler and more reliable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image optimization | Custom lazy loading, srcset | `next/image` with `fill` | Handles responsive sizing, lazy loading, format optimization |
| Responsive breakpoints | Custom media query hooks | Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) | Consistent, well-tested breakpoints |
| Click-outside-to-close | Complex event listener logic | Single `onClick` on the backdrop overlay div | Simpler, fewer edge cases |
| Scroll lock when modal open | Custom scroll position save/restore | CSS `document.body.style.overflow = 'hidden'` toggle | Two lines of code, no position jumpiness |
| Card image aspect ratio | Hardcoded width/height calculations | `aspect-[5/7]` Tailwind class with `fill` Image | MTG cards are ~63x88mm, approximately 5:7 ratio |

## Common Pitfalls

### Pitfall 1: Missing oracleText in Card Data
**What goes wrong:** Detail modal cannot show oracle text because the field doesn't exist in the data model or generated JSON.
**Why it happens:** Phase 1 enrichment was scoped to image, price, and color identity only. Oracle text was not needed until this phase.
**How to avoid:** Add `oracleText: string | null` to the Card interface, extract `oracle_text` from Scryfall responses in `enrichment.ts` (handling double-faced cards same as imageUrl), and regenerate cards.json.
**Warning signs:** Modal shows undefined/blank where oracle text should be.

### Pitfall 2: next/image remotePatterns Not Configured
**What goes wrong:** Images fail to load with 400 errors. Next.js blocks remote images not listed in `remotePatterns`.
**Why it happens:** Scryfall images come from `cards.scryfall.io` which must be allowlisted in `next.config.ts`.
**How to avoid:** Add remotePatterns for `cards.scryfall.io` in next.config.ts:
```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
        pathname: '/**',
      },
    ],
  },
};
```
**Warning signs:** Broken image icons, 400 status in network tab.

### Pitfall 3: Scryfall Image URL May Be Null
**What goes wrong:** Passing `null` to `next/image` src causes a runtime error.
**Why it happens:** Some cards may have `imageUrl: null` if Scryfall doesn't have an image.
**How to avoid:** Render a placeholder div (card back image or text-only fallback) when `imageUrl` is null.

### Pitfall 4: Modal Not Preventing Background Scroll on Mobile
**What goes wrong:** User can scroll the grid behind the modal, especially on iOS.
**Why it happens:** iOS Safari handles overflow differently. Fixed-position overlays don't automatically block scroll.
**How to avoid:** Toggle `overflow: hidden` on `document.body` when modal opens/closes. Clean up in useEffect return.

### Pitfall 5: Tailwind v4 `@theme` Syntax
**What goes wrong:** Custom colors defined wrong way for Tailwind v4.
**Why it happens:** Tailwind v4 uses `@theme inline {}` in CSS, not `tailwind.config.js`. The project already uses this pattern in globals.css.
**How to avoid:** Add accent colors in the existing `@theme inline {}` block in globals.css:
```css
@theme inline {
  --color-accent: #4f46e5;  /* indigo-600 */
  --color-accent-hover: #4338ca;  /* indigo-700 */
}
```

### Pitfall 6: Card Data Serialization Boundary
**What goes wrong:** Passing complex objects from Server to Client Component fails or creates unnecessary bundle.
**Why it happens:** Props crossing the server/client boundary must be serializable. The Card[] array is plain data so it's fine, but be aware.
**How to avoid:** Card data is already serializable (strings, numbers, arrays of strings, null). No functions or Dates in the type. This is a non-issue for this project but worth noting.

### Pitfall 7: Double-Faced Card Oracle Text
**What goes wrong:** Oracle text is null/missing for transform cards, MDFCs.
**Why it happens:** Like `image_uris`, `oracle_text` lives inside `card_faces` array for double-faced cards, not at the top level.
**How to avoid:** Same fallback pattern as getImageUrl: check top-level `oracle_text` first, then fall back to `card_faces[0].oracle_text`. Consider joining both faces with " // " separator for full display.

## Code Examples

### Extending Card Type with Oracle Text
```typescript
// src/lib/types.ts - add to Card interface
export interface Card {
  // ... existing fields ...
  /** Oracle text for rules, null if unavailable */
  oracleText: string | null;
}

// src/lib/types.ts - add oracle_text to ScryfallCard
export interface ScryfallCard {
  // ... existing fields ...
  oracle_text?: string;
  card_faces?: Array<{
    name: string;
    oracle_text?: string;
    image_uris?: { normal: string };
  }>;
}
```

### Extracting Oracle Text in Enrichment
```typescript
// src/lib/enrichment.ts
function getOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) {
    return card.oracle_text;
  }
  // Double-faced cards: join both faces
  if (card.card_faces) {
    const texts = card.card_faces
      .map(f => f.oracle_text)
      .filter(Boolean);
    return texts.length > 0 ? texts.join(' // ') : null;
  }
  return null;
}
```

### next/image Configuration for Scryfall
```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

### Responsive Grid with Tailwind v4
```tsx
// Responsive card grid: 2 cols mobile, 4 cols tablet, 5 cols desktop
<div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
  {cards.map(card => (
    <button
      key={card.id}
      onClick={() => setSelectedCard(card)}
      className="group text-left"
    >
      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-zinc-100">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400">
            No Image
          </div>
        )}
        {card.foil && (
          <span className="absolute top-2 right-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            FOIL
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-sm font-medium leading-tight truncate">{card.name}</p>
        <p className="text-sm text-zinc-500">
          {card.price !== null ? `$${card.price.toFixed(2)}` : 'N/A'}
        </p>
        <p className="text-xs text-zinc-400">
          {card.condition} x{card.quantity}
        </p>
      </div>
    </button>
  ))}
</div>
```

### Modal Overlay Pattern
```tsx
// Modal with backdrop click to close, scroll lock
{selectedCard && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 md:p-8"
    onClick={() => setSelectedCard(null)}
  >
    <div
      className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6
                 md:flex md:gap-6
                 max-md:fixed max-md:inset-0 max-md:rounded-none max-md:max-w-none"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => setSelectedCard(null)}
        className="absolute top-4 right-4 z-10 text-zinc-400 hover:text-zinc-600"
        aria-label="Close"
      >
        X
      </button>
      {/* Modal content */}
    </div>
  </div>
)}
```

## Discretion Recommendations

### Modal Layout: Side-by-side on desktop, stacked on mobile
**Recommendation:** Side-by-side layout on md+ screens (image left, text right), stacking to image-on-top on mobile. This gives the best use of horizontal space on desktop while remaining natural on mobile.

### Header/Nav: Minimal text header
**Recommendation:** Simple left-aligned text "Viki -- MTG Bulk Store" with small font, not a heavy nav bar. The cards are the focus. Keep it to a single line with the store name.

### Condition Badge Styling: Color-coded subtle badges
**Recommendation:** Small rounded badges with muted background colors:
- Near Mint: green tint (bg-green-50 text-green-700)
- Lightly Played: yellow tint
- Moderately Played: orange tint
- Heavily Played / Damaged: red tint
This gives instant visual signal without being loud.

### Grid Gap: 12px mobile, 16px desktop
**Recommendation:** `gap-3 md:gap-4` -- tight enough to show many cards, loose enough to not feel cramped.

### Empty State: Simple centered message
**Recommendation:** Same pattern as existing null-data state in page.tsx. "No cards available. Run `npm run generate` to build inventory."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind config JS | Tailwind v4 CSS-first `@theme inline {}` | Tailwind v4 (2025) | Custom colors go in globals.css, not config file |
| `getStaticProps` | Server Components with direct file reads | Next.js 13+ App Router | page.tsx is a Server Component by default, reads data directly |
| `next/image` width+height required | `fill` prop with aspect-ratio container | Next.js 13+ | Simpler for responsive remote images |

## Open Questions

1. **CATL-01 vs User Decision on Set Name**
   - What we know: CATL-01 says "showing image, name, set, price, condition, and quantity" but user decided set name NOT on tile
   - What's unclear: Whether this is a conflict or the user intentionally overrode
   - Recommendation: Follow user decision (set in modal only). The requirement can be considered met since set info IS accessible via the detail modal. Flag this to user if needed.

2. **Condition String Format**
   - What we know: Condition comes from Manabox CSV as strings like "near_mint"
   - What's unclear: Exact set of condition values and whether they need display-name mapping
   - Recommendation: Map condition strings to display names (e.g., "near_mint" -> "NM", "lightly_played" -> "LP") for compact tile display

## Sources

### Primary (HIGH confidence)
- Next.js 16.2.2 docs at `node_modules/next/dist/docs/` -- image optimization, server/client components, static exports
- Scryfall API Card Objects -- `oracle_text` field, `card_faces` structure
- Existing codebase -- types.ts, enrichment.ts, page.tsx, cards.json structure

### Secondary (MEDIUM confidence)
- [Scryfall Card Objects API docs](https://scryfall.com/docs/api/cards) -- oracle_text field location and double-faced card handling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all verified in codebase
- Architecture: HIGH - follows established Next.js 16 patterns from docs, matches existing codebase structure
- Pitfalls: HIGH - identified from actual codebase gaps (missing oracleText, missing remotePatterns config)
- UI patterns: MEDIUM - responsive grid and modal patterns are well-established but exact Tailwind v4 class names should be verified during implementation

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, no fast-moving dependencies)
