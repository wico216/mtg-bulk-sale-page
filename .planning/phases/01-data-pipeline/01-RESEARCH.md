# Phase 1: Data Pipeline - Research

**Researched:** 2026-04-02
**Domain:** CSV parsing, Scryfall API integration, Next.js build-time data generation
**Confidence:** HIGH

## Summary

This phase transforms Manabox CSV exports into enriched card data using the Scryfall API, then generates build-time JSON for a Next.js frontend. The technical surface is well-understood: PapaParse handles CSV parsing with TypeScript generics, the Scryfall REST API provides card images and prices via a simple `GET /cards/{set}/{collector_number}` endpoint, and Next.js generates static data at build time.

The most important findings are: (1) Scryfall's `prices.usd` field is the primary price for both foil and non-foil SLD cards -- `usd_foil` is frequently null even for foil-available cards, so the price lookup must try `usd` first then `usd_foil` as fallback; (2) double-faced/transform cards lack top-level `image_uris` and instead have them nested under `card_faces[0].image_uris`; (3) SLD high collector numbers (1700+, 7000+) resolve correctly via the standard API endpoint -- no special handling is needed for matching, only awareness that these exist.

**Primary recommendation:** Use PapaParse with `header: true` for CSV parsing, file-based JSON cache with 24-hour TTL for Scryfall responses, and a simple `setTimeout`-based rate limiter at 100ms between requests. Generate a single `cards.json` at build time via a Node.js script run before `next build`.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Scryfall TCGPlayer market price as displayed price (exact, no markup)
- If Scryfall returns no price, show "Price N/A" (card still appears)
- Match cards by set code + collector number (primary strategy)
- Extra care for SLD variants -- try name + set fallback for high collector numbers
- If card not found on Scryfall, skip entirely
- Build process prints summary: "Processed X cards, Y skipped (no match), Z missing prices"
- Include in model: Name, Set code, Set name, Collector number, Foil status, Rarity, Quantity, Condition
- Ignore: Misprint, Altered, Language, Purchase price, Purchase price currency, ManaBox ID, Scryfall ID
- Support multiple CSV files in a designated directory, merged into one pool
- Scryfall cache with 24-hour expiry
- Store displays "last updated" date from build time

### Claude's Discretion
- Cache storage mechanism (file-based, SQLite, etc.)
- Scryfall rate limiting implementation details
- Exact card data model field types and structure
- How to handle duplicate cards across multiple CSVs (same card in different binders)

### Deferred Ideas (OUT OF SCOPE)
None

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | CSV import parses Manabox export into structured card inventory | PapaParse with header mode maps directly to Manabox CSV columns; verified CSV structure has 15 columns with header row |
| DATA-02 | Scryfall API enriches cards with images at build time (matched by set code + collector number) | `GET /cards/{set}/{collector_number}` returns `image_uris.normal`; double-faced cards need `card_faces[0].image_uris.normal` fallback |
| DATA-03 | Scryfall API enriches cards with TCGPlayer market prices at build time | `prices.usd` is the primary field; `prices.usd_foil` as fallback; null means no price available |
| DATA-04 | Card data model includes: name, set, collector number, price, condition, quantity, color identity, image URL, rarity | All fields available from CSV + Scryfall response; `color_identity` comes from Scryfall as array of color letters |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.x | React framework with SSG | Industry standard; `create-next-app` scaffolds TypeScript + Tailwind |
| TypeScript | 5.x | Type safety | Bundled with create-next-app |
| Tailwind CSS | 4.x | Utility-first CSS | Bundled with create-next-app |
| PapaParse | 5.5.3 | CSV parsing | Most popular JS CSV parser; handles quoted fields, commas in names, type conversion |
| @types/papaparse | 5.5.2 | PapaParse TypeScript types | Official type definitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | built-in | File system access | Reading CSVs, reading/writing cache files |
| node:path | built-in | Path manipulation | Resolving CSV directory, cache paths |
| glob/fast-glob | latest | File globbing | Finding `*.csv` files in inventory directory |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PapaParse | csv-parse/csv-parser | PapaParse has better browser+Node support, simpler API with header mode |
| File-based cache | SQLite (better-sqlite3) | Overkill for ~135 card cache; file-based JSON is simpler and debuggable |
| Custom fetch | scryfall-sdk | SDK adds dependency for what is 1 API endpoint; raw fetch is cleaner |

**Installation:**
```bash
npx create-next-app@latest magic-bulk-sale --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd magic-bulk-sale
npm install papaparse
npm install -D @types/papaparse
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page (card catalog - future phase)
├── lib/
│   ├── types.ts            # Card data model types
│   ├── csv-parser.ts       # Manabox CSV parsing logic
│   ├── scryfall.ts         # Scryfall API client with rate limiting
│   ├── enrichment.ts       # Orchestrates CSV -> Scryfall -> Card pipeline
│   └── cache.ts            # File-based cache with TTL
scripts/
├── generate-data.ts        # Build-time script: reads CSVs, enriches, writes JSON
data/
├── inventory/              # Directory for CSV files (gitignored except example)
│   └── *.csv               # Manabox exports
├── generated/              # Build output (gitignored)
│   └── cards.json          # Enriched card data for frontend
└── cache/                  # Scryfall response cache (gitignored)
    └── scryfall/           # Individual card cache files
```

### Pattern 1: Build-Time Data Generation
**What:** A standalone Node.js script runs before `next build`, generating `cards.json` from CSV + Scryfall data.
**When to use:** Always -- this is the core pipeline.
**Example:**
```typescript
// scripts/generate-data.ts
import { parseAllCsvFiles } from '../src/lib/csv-parser';
import { enrichCards } from '../src/lib/enrichment';
import { writeFileSync } from 'node:fs';

async function main() {
  const rawCards = parseAllCsvFiles('data/inventory');
  const enrichedCards = await enrichCards(rawCards);
  
  writeFileSync(
    'data/generated/cards.json',
    JSON.stringify({
      cards: enrichedCards.cards,
      meta: {
        lastUpdated: new Date().toISOString(),
        totalProcessed: enrichedCards.stats.processed,
        totalSkipped: enrichedCards.stats.skipped,
        totalMissingPrices: enrichedCards.stats.missingPrices,
      }
    }, null, 2)
  );
  
  console.log(`Processed ${enrichedCards.stats.processed} cards, ${enrichedCards.stats.skipped} skipped (no match), ${enrichedCards.stats.missingPrices} missing prices`);
}

main();
```

### Pattern 2: Rate-Limited API Client
**What:** A simple delay-based rate limiter for Scryfall requests.
**When to use:** All Scryfall API calls.
**Example:**
```typescript
// src/lib/scryfall.ts
const RATE_LIMIT_MS = 100; // Scryfall asks for 50-100ms between requests
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url);
}

export async function fetchCard(setCode: string, collectorNumber: string): Promise<ScryfallCard | null> {
  const url = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`;
  const response = await rateLimitedFetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Scryfall error: ${response.status}`);
  return response.json();
}
```

### Pattern 3: File-Based Cache with TTL
**What:** Cache each Scryfall response as a JSON file with timestamp metadata.
**When to use:** All Scryfall lookups -- check cache before API call.
**Example:**
```typescript
// src/lib/cache.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = 'data/cache/scryfall';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

export function getCached<T>(key: string): T | null {
  const filePath = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(filePath)) return null;
  
  const entry: CacheEntry<T> = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (Date.now() - entry.timestamp > TTL_MS) return null;
  
  return entry.data;
}

export function setCache<T>(key: string, data: T): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, `${key}.json`);
  const entry: CacheEntry<T> = { timestamp: Date.now(), data };
  writeFileSync(filePath, JSON.stringify(entry));
}
```

### Pattern 4: Duplicate Card Merging
**What:** When the same card appears in multiple CSVs (same set + collector number + foil status + condition), merge by summing quantities.
**When to use:** After parsing all CSVs, before enrichment.
**Rationale:** A buyer doesn't care which binder a card came from. Same card = same listing with combined quantity.
**Key:** The dedup key should be `${setCode}-${collectorNumber}-${foil}-${condition}` since the same card in different conditions or foil/non-foil are distinct listings.

### Anti-Patterns to Avoid
- **Calling Scryfall per-render:** All API calls happen at build time only. Never call Scryfall from the frontend or at request time.
- **Storing full Scryfall responses in cards.json:** Only extract the fields needed. The full response is ~3KB per card; the card model should be ~200 bytes.
- **Using Scryfall ID from CSV:** The context explicitly says to match by set code + collector number, not Scryfall ID.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom string splitting | PapaParse | Quoted fields, commas in card names (e.g., "Deadpool, Trading Card"), escaped quotes |
| Rate limiting | Complex queue/semaphore | Simple setTimeout delay | Only sequential requests needed; no concurrency required for ~135 cards |
| HTTP client | Axios/node-fetch | Built-in `fetch` | Node 18+ has native fetch; no dependency needed |
| Path globbing | Manual fs.readdir + filter | fast-glob or glob | Handles nested dirs, patterns, edge cases |

**Key insight:** The dataset is small (~135 cards currently). Don't over-engineer for scale. Simple sequential processing with a delay between Scryfall calls will process the entire inventory in ~15 seconds.

## Common Pitfalls

### Pitfall 1: Double-Faced Cards Missing Images
**What goes wrong:** Accessing `card.image_uris.normal` throws because `image_uris` is undefined on transform/modal DFC layouts.
**Why it happens:** Cards with `layout: "transform"`, `"modal_dfc"`, `"reversible_card"` etc. have images on `card_faces[n].image_uris` instead of top-level `image_uris`.
**How to avoid:** Always check for `image_uris` first; fall back to `card_faces[0].image_uris`.
**Warning signs:** TypeError at runtime for specific cards; missing images in output.
```typescript
function getImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris) return card.card_faces[0].image_uris.normal;
  return null;
}
```

### Pitfall 2: Price Field Selection
**What goes wrong:** Using `prices.usd_foil` for foil cards and getting null, even though a price exists in `prices.usd`.
**Why it happens:** Many SLD cards have `usd_foil: null` even when both foil and non-foil finishes exist. The `prices.usd` field often contains the only available price.
**How to avoid:** Use `prices.usd` as primary, `prices.usd_foil` as fallback, then null (triggers "Price N/A").
```typescript
function getPrice(prices: ScryfallPrices): string | null {
  return prices.usd ?? prices.usd_foil ?? null;
}
```

### Pitfall 3: Card Names with Commas and Quotes
**What goes wrong:** Naive CSV parsing breaks on names like `"Deadpool, Trading Card"` or `"Urborg, Tomb of Yawgmoth"`.
**Why it happens:** These names contain commas and are quoted in the CSV per RFC 4180.
**How to avoid:** Use PapaParse with default settings -- it handles RFC 4180 quoting correctly.
**Verified:** The actual CSV contains `"Deadpool, Trading Card"` and `"Urborg, Tomb of Yawgmoth"` with proper quoting.

### Pitfall 4: Set Code Case Sensitivity
**What goes wrong:** Scryfall API returns 404 for uppercase set codes.
**Why it happens:** The CSV contains uppercase set codes (e.g., `SLD`, `TDM`, `WOT`) but Scryfall expects lowercase (`sld`, `tdm`, `wot`).
**How to avoid:** Always `.toLowerCase()` the set code before calling Scryfall.

### Pitfall 5: Cache Key Collisions
**What goes wrong:** Cache files overwrite each other or return wrong data.
**Why it happens:** Collector numbers can contain non-numeric characters (e.g., `123a`, `★`).
**How to avoid:** Use `${setCode}-${collectorNumber}` as cache key, sanitizing any filesystem-unsafe characters.

### Pitfall 6: Empty/Malformed CSV Rows
**What goes wrong:** Script crashes on empty lines or rows with missing fields.
**Why it happens:** CSV exports sometimes have trailing newlines or empty rows.
**How to avoid:** Use PapaParse with `skipEmptyLines: true` and validate required fields before processing.

## Code Examples

### Manabox CSV Column Mapping
```typescript
// Source: Verified from actual "Blue Binder.csv" file
// CSV Headers: Name, Set code, Set name, Collector number, Foil, Rarity, Quantity,
//              ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered, Condition,
//              Language, Purchase price currency

interface ManaboxRow {
  'Name': string;
  'Set code': string;
  'Set name': string;
  'Collector number': string;
  'Foil': 'foil' | 'normal';
  'Rarity': 'common' | 'uncommon' | 'rare' | 'mythic';
  'Quantity': number;       // dynamicTyping converts this
  'Condition': string;      // near_mint, etc.
  // Ignored fields: ManaBox ID, Scryfall ID, Purchase price, Misprint, Altered, Language, Purchase price currency
}
```

### Card Data Model
```typescript
// The enriched card model stored in cards.json
interface Card {
  id: string;                    // Generated: `${setCode}-${collectorNumber}-${foil}-${condition}`
  name: string;                  // From CSV: "Heroic Intervention"
  setCode: string;               // From CSV: "sld" (lowercased)
  setName: string;               // From CSV: "Secret Lair Drop"
  collectorNumber: string;       // From CSV: "1750"
  price: number | null;          // From Scryfall: prices.usd parsed as number, null if N/A
  condition: string;             // From CSV: "near_mint"
  quantity: number;              // From CSV (summed across binders): 1
  colorIdentity: string[];       // From Scryfall: ["G"]
  imageUrl: string | null;       // From Scryfall: image_uris.normal URL
  rarity: string;                // From CSV: "rare"
  foil: boolean;                 // From CSV: true if "foil"
}

interface CardData {
  cards: Card[];
  meta: {
    lastUpdated: string;         // ISO date string from build time
    totalCards: number;
    totalSkipped: number;
    totalMissingPrices: number;
  };
}
```

### Scryfall Response (Key Fields)
```typescript
// Source: Verified from live API calls to api.scryfall.com
interface ScryfallCard {
  object: 'card';
  name: string;
  color_identity: string[];       // e.g., ["G"], ["W", "U"], []
  image_uris?: {                  // Missing on double-faced cards
    normal: string;
    small: string;
    large: string;
    // ... other sizes
  };
  card_faces?: Array<{            // Present on double-faced cards
    name: string;
    image_uris?: {
      normal: string;
      // ...
    };
  }>;
  prices: {
    usd: string | null;           // Primary price (string of number, e.g., "16.05")
    usd_foil: string | null;      // Foil price (often null even for foil-available cards)
    usd_etched: string | null;
    eur: string | null;
    eur_foil: string | null;
    tix: string | null;
  };
  layout: string;                 // "normal", "transform", "modal_dfc", etc.
}
```

### PapaParse Usage in Node.js with TypeScript
```typescript
// Source: PapaParse docs + TypeScript community patterns
import Papa from 'papaparse';
import { readFileSync } from 'node:fs';

function parseCsvFile(filePath: string): ManaboxRow[] {
  const csvContent = readFileSync(filePath, 'utf-8');
  const result = Papa.parse<ManaboxRow>(csvContent, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  
  if (result.errors.length > 0) {
    console.warn(`CSV parse warnings for ${filePath}:`, result.errors);
  }
  
  return result.data;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` for HTTP | Built-in `fetch()` | Node 18 (2022) | No HTTP client dependency needed |
| Next.js Pages Router `getStaticProps` | App Router with static JSON import | Next.js 13+ (2023) | Data loading via `import` or `fs.readFileSync` at build time |
| Scryfall `usd` top-level field | `prices.usd` nested object | Scryfall API v2 | Must access `prices.usd` not `card.usd` |

**Deprecated/outdated:**
- `getStaticProps` / `getServerSideProps`: Pages Router pattern; use App Router with server components instead
- `node-fetch`: Unnecessary since Node 18; use native `fetch`

## Open Questions

1. **Scryfall `prices.usd` exact meaning**
   - What we know: Returns a string number representing USD price sourced from TCGPlayer
   - What's unclear: Whether this is "market price", "lowest listing", or "median" -- Scryfall docs behind 403
   - Recommendation: Use as-is; it is the standard price shown on Scryfall.com and is close enough to TCGPlayer market price for this use case

2. **Build script execution in Next.js**
   - What we know: Need a pre-build script to generate cards.json
   - What's unclear: Best way to integrate with `next build` lifecycle
   - Recommendation: Use npm script chaining: `"build": "tsx scripts/generate-data.ts && next build"` with `tsx` for TypeScript execution

## Sources

### Primary (HIGH confidence)
- Live Scryfall API responses at `api.scryfall.com/cards/{set}/{number}` -- verified response structure, price fields, image_uris behavior, double-faced card handling
- Actual `Blue Binder.csv` file -- verified all 15 CSV columns, 135 data rows, quoted names with commas

### Secondary (MEDIUM confidence)
- [Scryfall REST API Documentation](https://scryfall.com/docs/api) -- rate limiting: 50-100ms between requests, 24-hour cache recommended
- [PapaParse official site](https://www.papaparse.com/) -- API usage, header mode, dynamicTyping
- [PapaParse npm](https://www.npmjs.com/package/papaparse) -- version 5.5.3, TypeScript types available
- [Better Stack PapaParse Guide](https://betterstack.com/community/guides/scaling-nodejs/parsing-csv-files-with-papa-parse/) -- Node.js usage with fs.readFileSync
- [TypeScript.tv PapaParse Guide](https://typescript.tv/hands-on/parsing-csv-files-in-typescript-with-papa-parse/) -- TypeScript generic usage

### Tertiary (LOW confidence)
- Scryfall `prices.usd` exact definition (market vs lowest listing) -- could not access FAQ page due to 403; multiple sources suggest it maps to TCGPlayer pricing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified with current versions, APIs tested live
- Architecture: HIGH -- patterns verified against actual CSV data and live API responses
- Pitfalls: HIGH -- double-faced cards, price field nulls, and CSV quoting all verified with real data

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain; Scryfall API rarely changes)
