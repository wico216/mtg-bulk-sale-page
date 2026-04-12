# Architecture Patterns

**Domain:** Static card store with email checkout
**Researched:** 2026-04-02

## Recommended Architecture

**Static Site Generation (SSG) + Client-Side Interactivity + Single API Route**

The card catalog is generated at build time from CSV data. The browser handles search, filtering, and cart. A single serverless function sends checkout emails.

```
+-------------------+     +------------------+     +-------------------+
|   Build Time      |     |   Client Side    |     |   Server Side     |
|                   |     |                  |     |                   |
|  Manabox CSV      |     |  Card Grid UI    |     |  /api/checkout    |
|    |              |     |  Search/Filter   |     |    |              |
|    v              |     |  Cart (Zustand)  |     |    v              |
|  PapaParse        |     |  Checkout Form   |     |  Validate order   |
|    |              |     |                  |     |  Send emails      |
|    v              |     |                  |     |  (Resend API)     |
|  Scryfall batch   |     |                  |     |                   |
|  enrichment       |     |                  |     |                   |
|    |              |     |                  |     |                   |
|    v              |     |                  |     |                   |
|  cards.json       +---->+  Static HTML/JS  +---->+                   |
+-------------------+     +------------------+     +-------------------+
```

### Why This Architecture

1. **No database needed.** Inventory changes only when the seller re-uploads a CSV. A JSON file built at deploy time is sufficient.
2. **No backend for browsing.** Search and filtering happen client-side against static JSON. With a few thousand cards, this is instant.
3. **One serverless function.** The only server-side logic is sending two emails at checkout.
4. **Scryfall images loaded from CDN.** Card images resolved at build time, URLs stored in JSON, loaded directly from Scryfall CDN.
5. **Zero hosting cost.** Static site + one serverless function = Vercel free tier.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| CSV Parser (build script) | Parse Manabox CSV, normalize data | File system (reads CSV) |
| Scryfall Enricher (build script) | Batch-fetch card metadata and image URIs | Scryfall `/cards/collection` API |
| Static JSON Generator (build script) | Output enriched card data as JSON | File system (writes cards.json) |
| Card Catalog Page (SSG) | Display card grid, search, filter | Card data (JSON), Scryfall CDN (images) |
| Cart Store (Zustand) | Cart items, quantities, persistence | localStorage, UI components |
| Checkout Form | Collect buyer name + email, submit order | Cart store, API route |
| Checkout API Route | Validate order, send emails | Resend API |
| Email Templates (React Email) | Render order confirmation HTML | Resend (send) |

### Data Flow

**Build time (CSV to static site):**
1. Developer places Manabox CSV in `/data/inventory.csv`
2. Build script runs PapaParse to parse CSV into typed card objects
3. Build script batches Scryfall `/cards/collection` calls (75 cards/request) to enrich with image URIs, colors, oracle text
4. Enriched data saved as `/data/cards.json`
5. Next.js SSG reads `cards.json` and generates static pages

**Runtime (user browses and orders):**
1. User loads page -- static HTML with card data embedded in page props
2. Card images load from Scryfall CDN (direct `<img>` tags, no API calls)
3. User searches/filters -- client-side JS filters card array, re-renders grid
4. User adds to cart -- Zustand updates state, persists to localStorage
5. User clicks checkout -- form collects name + email
6. Form POSTs to `/api/checkout` with cart items + buyer info
7. API route validates, calls Resend to send emails
8. Client shows confirmation page

## File Structure

```
viki/
  src/
    app/
      page.tsx                  # Main catalog page (SSG)
      cart/
        page.tsx                # Cart page
      checkout/
        page.tsx                # Checkout form
      confirmation/
        page.tsx                # Order confirmation
      api/
        checkout/
          route.ts              # Email sending endpoint
    components/
      CardGrid.tsx              # Card display grid
      CardItem.tsx              # Individual card component
      SearchBar.tsx             # Name search input
      ColorFilter.tsx           # WUBRG filter buttons
      CartIcon.tsx              # Cart badge in header
      CartItem.tsx              # Cart line item
      CheckoutForm.tsx          # Buyer info form
    stores/
      cart.ts                   # Zustand cart store with persist
    lib/
      cards.ts                  # Card types and data loader
      scryfall.ts               # Scryfall API helpers (build-time)
      csv.ts                    # CSV parsing utilities (build-time)
      email.ts                  # Email sending logic (server-only)
    emails/
      OrderConfirmation.tsx     # React Email template (seller)
      OrderReceipt.tsx          # React Email template (buyer)
    types/
      card.ts                   # Shared card interfaces
  data/
    inventory.csv               # Manabox CSV export (git-ignored)
    cards.json                  # Generated at build time (git-ignored)
  scripts/
    import-csv.ts               # Build script: CSV -> enriched JSON
  public/
    # Static assets (logo, favicon, mana symbol SVGs)
```

## Patterns to Follow

### Pattern 1: Build-Time Data Enrichment
**What:** Parse CSV and enrich with Scryfall data at build time, not runtime.
**When:** Always. Card inventory changes infrequently.
**Why:** Zero client-side API calls. Instant page loads. No rate limit concerns.
```typescript
// scripts/import-csv.ts
import Papa from 'papaparse';
import fs from 'fs';

const csv = fs.readFileSync('data/inventory.csv', 'utf-8');
const { data } = Papa.parse<ManaboxRow>(csv, { header: true });
const cards = await enrichWithScryfall(data);
fs.writeFileSync('data/cards.json', JSON.stringify(cards));
```

### Pattern 2: Deterministic Card IDs
**What:** Generate stable IDs from set code + collector number + condition + foil.
**When:** Always. Needed for cart operations and deduplication.
**Why:** Same card in different conditions or foil/non-foil are separate inventory items.
```typescript
function cardId(card: { setCode: string; collectorNumber: string; condition: string; foil: boolean }): string {
  return `${card.setCode}-${card.collectorNumber}-${card.condition}-${card.foil ? 'F' : 'NF'}`;
}
```

### Pattern 3: Scryfall Batch Lookup by Set + Collector Number
**What:** Use `/cards/collection` endpoint with set code + collector number identifiers.
**When:** Build-time Scryfall enrichment.
**Why:** More reliable than name matching (handles split cards, DFCs). 75 cards per request.
```typescript
// Batch lookup -- 75 cards per request
const response = await fetch('https://api.scryfall.com/cards/collection', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    identifiers: cards.slice(0, 75).map(c => ({
      set: c.setCode.toLowerCase(),
      collector_number: c.collectorNumber,
    }))
  })
});
```

### Pattern 4: Client-Side Filtering with useMemo
**What:** Keep all cards in memory, derive filtered results from state.
**When:** Search and filter interactions.
**Why:** Simple, fast, no server round-trips.
```typescript
const filtered = useMemo(() =>
  cards.filter(card =>
    card.name.toLowerCase().includes(search.toLowerCase()) &&
    (colors.length === 0 || colors.some(c => card.colors.includes(c)))
  ),
  [cards, search, colors]
);
```

### Pattern 5: Zustand Cart with localStorage Persistence
**What:** Cart state managed by Zustand with persist middleware.
**When:** All cart operations.
**Why:** Survives page refresh, zero backend state, minimal code.
```typescript
export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (card) => { /* ... */ },
      removeItem: (cardId) => { /* ... */ },
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    { name: 'viki-cart' }
  )
);
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Runtime Scryfall API Calls Per Card
**What:** Fetching card data from Scryfall when each card renders.
**Why bad:** Rate-limited to 10 req/sec. 500 cards = 50 seconds of loading.
**Instead:** Batch-fetch at build time. Store image URLs in JSON.

### Anti-Pattern 2: Using a Database
**What:** Postgres/SQLite/Firebase for card inventory.
**Why bad:** Massive complexity for data that changes only on CSV re-upload.
**Instead:** Static JSON generated at build time.

### Anti-Pattern 3: Server-Side Cart State
**What:** Storing cart in sessions or database.
**Why bad:** Requires auth, session management, database.
**Instead:** Client-side Zustand + localStorage.

### Anti-Pattern 4: Matching Scryfall by Card Name
**What:** Using name-based search for Scryfall lookups.
**Why bad:** Split cards ("Fire // Ice"), DFCs, accent marks cause matching failures.
**Instead:** Match by set code + collector number from Manabox CSV.

## Scalability Considerations

| Concern | At 500 cards | At 5,000 cards | At 50,000+ cards |
|---------|-------------|----------------|-------------------|
| Page load | Instant (~50KB JSON) | Fast (~500KB JSON) | Consider pagination or virtual scroll |
| Search/filter | Sub-millisecond | Instant | Consider Fuse.js |
| Build time | < 10 sec | ~1 min (Scryfall batches) | ~5 min (add caching) |
| Image loading | Fine with lazy load | Fine with lazy load | Virtual scroll needed |

**For this project:** A friend's bulk collection is typically 500-5,000 cards. All approaches work at this scale.

## Sources

- Next.js 16 SSG: https://nextjs.org/blog (verified, HIGH confidence)
- Scryfall `/cards/collection`: training data (MEDIUM confidence -- verify endpoint)
- Zustand persist middleware: training data (MEDIUM confidence)
