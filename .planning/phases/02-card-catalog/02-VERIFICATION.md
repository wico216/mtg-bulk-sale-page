---
phase: 02-card-catalog
verified: 2026-04-02T21:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 8/9
  gaps_closed:
    - "User sees a responsive grid of cards showing image, name, set, price, condition, and quantity — card-tile.tsx line 60 now renders card.setName as text-xs text-zinc-400 truncate below the card name"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Confirm grid shows 2 columns on mobile and 4-5 on desktop"
    expected: "On a phone viewport (390px wide) exactly 2 cards per row. On a 1280px+ desktop 5 cards per row."
    why_human: "Responsive breakpoints cannot be verified by grep — requires browser rendering."
  - test: "Open card detail modal and verify all metadata fields"
    expected: "Modal shows card image, name, set+rarity, foil badge (if foil), price, condition, quantity, and oracle text. Mana symbols in oracle text render as inline SVG icons."
    why_human: "Visual rendering of SVG mana symbols and modal layout require browser verification."
  - test: "Verify modal full-screen behavior on mobile viewport"
    expected: "On a phone viewport the modal takes the full screen with no rounded corners and content is scrollable."
    why_human: "max-md: Tailwind classes require browser rendering to verify."
  - test: "Confirm scroll lock and position preservation"
    expected: "When modal is open the page behind does not scroll. After closing the modal the grid scroll position is unchanged."
    why_human: "document.body.style.overflow behavior requires live browser interaction."
  - test: "Verify lightbox opens on image click"
    expected: "Clicking the card image inside the modal opens a full-screen lightbox with the large Scryfall image."
    why_human: "Lightbox overlay and zoom-out cursor require browser interaction."
---

# Phase 02: Card Catalog Verification Report

**Phase Goal:** Users can browse the full card inventory in a visual grid and inspect individual cards
**Verified:** 2026-04-02T21:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous status: gaps_found, previous score: 8/9)

## Re-verification Summary

**Gap closed:** Set name was missing from card tiles. `card-tile.tsx` line 60 now renders `{card.setName}` as a `text-xs text-zinc-400 truncate` paragraph below the card name. The field is typed as `string` (non-nullable) on the `Card` interface (`src/lib/types.ts` line 34) and all 136 entries in `data/generated/cards.json` carry the `setName` field. CATL-01 is now fully satisfied.

**No regressions detected.** All 9 previously passing checks remain intact.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a responsive grid of cards showing image, name, set, price, condition, and quantity | VERIFIED | `card-tile.tsx` line 60: `<p className="text-xs text-zinc-400 truncate">{card.setName}</p>`. Field present on all 136 cards in cards.json. |
| 2 | User can tap or click any card to open a detail modal with oracle text and full metadata | VERIFIED | `card-grid.tsx` sets `selectedCard` on tile click; `CardModal` renders when `selectedCard` is non-null with oracle text, set+rarity, price, condition, foil badge. |
| 3 | Grid shows 2 columns on mobile and 4-5 on desktop | VERIFIED (code only) | `card-grid.tsx` line 44: `grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5`. Requires human to confirm browser rendering. |
| 4 | Modal shows larger card image, oracle text, set name, rarity, and foil status | VERIFIED | `card-modal.tsx` renders `card.setName`, `card.rarity` (capitalized), foil badge, oracle text with mana symbol parsing, and next/image fill. |
| 5 | User can close modal by clicking X or clicking outside | VERIFIED | `card-modal.tsx`: backdrop div has `onClick={onClose}`; close button `onClick={onClose}`; inner content div has `onClick={e => e.stopPropagation()}`. |
| 6 | Background scroll is locked when modal is open | VERIFIED (code only) | `card-grid.tsx` lines 17-26: `useEffect` sets `document.body.style.overflow = 'hidden'` when `selectedCard` is truthy. |
| 7 | Modal goes full screen on mobile | VERIFIED (code only) | `card-modal.tsx` line 68: `max-md:fixed max-md:inset-0 max-md:rounded-none max-md:max-w-none max-md:overflow-y-auto`. |
| 8 | Grid scroll position preserved after modal close | VERIFIED (code only) | Modal rendered in-place via conditional JSX, not navigation. Browser scroll position is not reset on modal open/close. |
| 9 | Site has a minimal header with store name | VERIFIED | `header.tsx` renders "Viki" in `text-accent` and "MTG Bulk Store" in lighter weight. `page.tsx` imports and renders `<Header />`. |

**Score:** 9/9 truths verified (5 require human browser confirmation for final sign-off)

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/types.ts` | Card interface with `oracleText`, ScryfallCard with `oracle_text` | VERIFIED | Lines 45 and 71: `oracleText: string \| null` on Card, `oracle_text?: string` on ScryfallCard top-level and card_faces. |
| `src/lib/enrichment.ts` | `getOracleText` with DFC handling | VERIFIED | Lines 26-40: function exists, handles `card.oracle_text` directly and joins card_faces oracle text with ` // `. Called on line 93 inside `enrichCards`. |
| `next.config.ts` | remotePatterns for `cards.scryfall.io` | VERIFIED | Lines 5-11: `{ protocol: 'https', hostname: 'cards.scryfall.io', pathname: '/**' }`. |
| `src/app/globals.css` | Accent color CSS variables | VERIFIED | Lines 13-15: `--color-accent`, `--color-accent-hover`, `--color-accent-light` inside `@theme inline` block. |
| `data/generated/cards.json` | 136 cards with `oracleText` field | VERIFIED | 136 `"oracleText"` entries present; 1 is `null` (expected — Scryfall gap). |

### Plan 02-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/card-grid.tsx` | Client component, responsive grid, modal state | VERIFIED | Line 1: `"use client"`. Line 14: `useState<Card \| null>(null)`. Line 44: responsive grid classes. Modal integration complete. |
| `src/components/card-tile.tsx` | Individual tile with image, name, set, price, condition badge | VERIFIED | Renders next/image with fill and sizes. Name (line 57), set name (line 60), price (line 61, formatted), condition+quantity (line 62-64), foil badge. Gap closed. |
| `src/components/header.tsx` | Minimal header with store name | VERIFIED | Server component, `<header>` element, accent-colored "Viki", light "MTG Bulk Store". |
| `src/app/page.tsx` | Server component loading cards.json, rendering CardGrid | VERIFIED | `loadCardData()` reads `data/generated/cards.json`. Renders `<Header />` then `<CardGrid cards={data.cards} meta={data.meta} />`. |

### Plan 02-03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/card-modal.tsx` | Detail modal with oracle text, metadata | VERIFIED | Renders image (next/image fill), name, set+rarity, foil badge, price, condition+quantity, oracle text with mana symbol SVG parsing. Backdrop click and X close. Full-screen mobile classes. |
| `src/components/card-grid.tsx` | Updated to integrate CardModal | VERIFIED | Line 6: `import CardModal`. Lines 53-63: `{selectedCard && <CardModal card={selectedCard} onClose={...} onImageClick={...} />}`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/page.tsx` | `src/components/card-grid.tsx` | passes `cards` array as prop | VERIFIED | Line 40: `<CardGrid cards={data.cards} meta={data.meta} />`. |
| `src/components/card-grid.tsx` | `src/components/card-tile.tsx` | maps cards to CardTile with onClick | VERIFIED | Lines 45-51: `cards.map((card) => <CardTile key={card.id} card={card} onClick={() => setSelectedCard(card)} />)`. |
| `src/components/card-tile.tsx` | `next/image` | renders Scryfall images | VERIFIED | Line 1: `import Image from "next/image"`. Line 36: `<Image src={card.imageUrl} ... fill sizes=... />`. |
| `src/components/card-grid.tsx` | `src/components/card-modal.tsx` | passes selectedCard and onClose | VERIFIED | Line 6: import present. Lines 53-63: `<CardModal card={selectedCard} onClose={() => setSelectedCard(null)} onImageClick={...} />`. |
| `src/components/card-modal.tsx` | `next/image` | renders larger card image | VERIFIED | Line 1: `import Image from "next/image"`. Line 90: `<Image src={card.imageUrl} fill sizes=... />`. |
| `src/lib/enrichment.ts` | `src/lib/types.ts` | imports ScryfallCard with oracle_text | VERIFIED | Line 1: `import type { Card, ScryfallCard } from "./types"`. `oracle_text` field used at line 27 and 33. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CATL-01 | 02-02 | User can browse cards in a responsive grid showing image, name, **set**, price, condition, and quantity | SATISFIED | `card-tile.tsx` now renders all six fields: image (line 36), name (line 57), set name (line 60), price (line 61), condition (line 62), quantity (line 63). Gap closed. |
| CATL-07 | 02-01, 02-03 | User can tap/click a card to see detail modal with oracle text and full metadata | SATISFIED | `CardModal` renders oracle text, set name, rarity, foil, price, condition, quantity. Click handler wired end-to-end. |
| CATL-08 | 02-02, 02-03 | Card catalog is mobile-responsive (works on phone screens) | SATISFIED (code) | `grid-cols-2` on mobile, `max-md:fixed max-md:inset-0` full-screen modal. Requires human browser verification for confirmation. |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/card-grid.tsx` | 60 | `img` tag used for lightbox (not next/image) | Info | The lightbox renders the large card image via a raw `<img>` tag rather than `next/image`. This bypasses optimization but is not a blocker — Scryfall image domain is already allowlisted. |

No TODO/FIXME/placeholder patterns found across any component file. No stub implementations found.

---

## Human Verification Required

### 1. Mobile Grid Layout

**Test:** Open http://localhost:3000 in browser dev tools at iPhone 14 viewport (390px wide)
**Expected:** Exactly 2 card tiles per row filling the width, no horizontal scrollbar
**Why human:** Tailwind responsive breakpoints require browser rendering

### 2. Detail Modal Content and Mana Symbols

**Test:** Click any card with mana cost oracle text (e.g., a spell with {W} or {U} costs)
**Expected:** Modal opens with oracle text rendered as prose with inline SVG icons for mana symbols (not raw `{W}` text)
**Why human:** SVG icon rendering from `https://svgs.scryfall.io/card-symbols/*.svg` requires browser network request

### 3. Mobile Full-Screen Modal

**Test:** On a phone viewport, click any card tile
**Expected:** Modal occupies the entire screen with no rounded corners, background completely hidden, modal content scrollable
**Why human:** `max-md:` Tailwind variant rendering requires browser

### 4. Scroll Lock Behavior

**Test:** Scroll down the grid, open a card modal, attempt to scroll the background page
**Expected:** Background page does not scroll while modal is open; grid scroll position restored after close
**Why human:** `document.body.style.overflow` behavior and scroll position preservation require live browser interaction

### 5. Art Lightbox

**Test:** Open any card modal, click the card image
**Expected:** A full-screen dark overlay appears with the high-resolution card image; clicking anywhere closes it
**Why human:** Lightbox overlay and image zoom behavior require browser interaction

---

## Gaps Summary

No automated gaps remain. The single gap from the initial verification (set name missing from card tiles) has been closed. `card-tile.tsx` line 60 now renders `card.setName` with `text-xs text-zinc-400 truncate` styling, placed between the card name and price in the metadata section.

All three phase requirements (CATL-01, CATL-07, CATL-08) are satisfied at the code level. Five items require human browser verification before the phase can be considered fully signed off — these are all visual/interactive behaviors that cannot be confirmed programmatically.

---

_Verified: 2026-04-02T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
