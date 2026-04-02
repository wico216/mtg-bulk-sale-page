# Technology Stack

**Project:** Viki -- MTG Bulk Store
**Researched:** 2026-04-02

## Recommended Stack

This is a simple, mostly-static storefront with minimal dynamic behavior (cart + email checkout). The stack prioritizes simplicity, zero hosting cost, and fast development over scalability or enterprise patterns.

### Core Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 16.2 | Full-stack React framework | SSG for card pages = fast + free hosting on Vercel. API routes handle email sending. App Router is stable. Verified current via nextjs.org/blog. | HIGH |
| React | 19.x | UI library | Ships with Next.js 16. No choice needed. | HIGH |
| TypeScript | 5.x | Type safety | Next.js 16 has first-class TS support. CSV parsing and Scryfall API responses benefit from typed interfaces. | HIGH |

### Styling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Tailwind CSS | 4.x | Utility-first CSS | Fast to build, no CSS files to manage, excellent for card grid layouts. v4 ships with Next.js 16 template. | MEDIUM (v4 confirmed via Next.js blog, exact minor version unverified) |

### Data / State

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| PapaParse | 5.x | CSV parsing | Industry standard for browser CSV parsing. Handles Manabox exports with headers, edge cases, encoding. No server needed -- parse client-side or at build time. | MEDIUM (version unverified via npm, but 5.x is well-established) |
| Zustand | 5.x | Cart state management | Lightweight, no boilerplate. Perfect for a shopping cart. Persist middleware stores cart in localStorage so it survives page refreshes. | MEDIUM (v5 likely current based on trajectory, verify) |

### Card Data

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Scryfall API | N/A (REST) | Card images + metadata | Free, no auth, comprehensive MTG database. Rate limit: 10 req/sec. Card images served via their CDN. Use `/cards/named?fuzzy=` for lookups and `/cards/search?q=` for search. | HIGH (well-documented public API, stable for years) |

### Email

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Resend | 4.x | Transactional email API | Free tier: 3,000 emails/month (plenty for friend orders). Simple REST API, works from Next.js API routes. Better DX than SendGrid/Mailgun for small projects. | MEDIUM (free tier limits unverified for current date) |
| React Email | 3.x | Email templates | JSX-based email templates. Renders to HTML that works across email clients. Pairs naturally with Resend. | LOW (version unverified) |

**Alternative for email:** If Resend's free tier changes, Nodemailer with a Gmail SMTP relay is a zero-cost fallback. Slightly more setup but no third-party dependency.

### Search

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Built-in `Array.filter()` | N/A | Card filtering | With < 10K cards in a friend's bulk collection, client-side filtering is instant. No search library needed for name substring match + color filter. | HIGH |

**Do NOT use Fuse.js, Algolia, or any search library.** The inventory is small enough that `string.includes()` and array filtering handles everything. Adding a fuzzy search library is over-engineering for an inventory of a few thousand cards.

### Hosting / Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vercel | N/A | Hosting + deployment | Free tier handles this project easily. Zero-config for Next.js. Automatic HTTPS, CDN, preview deploys. API routes (for email) run as serverless functions. | HIGH |

### Development Tools

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ESLint | 9.x | Linting | Ships with Next.js. Flat config format. | MEDIUM |
| Prettier | 3.x | Formatting | Consistent code style. | MEDIUM |

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| Database (Postgres, SQLite, etc.) | Overkill. CSV import at build time or on-demand is sufficient. Card data lives in a JSON file or in-memory. No user accounts = no persistent state. |
| Prisma / Drizzle / any ORM | No database = no ORM needed. |
| NextAuth / Clerk / Auth.js | No user accounts. Friends provide name + email at checkout only. |
| Stripe / PayPal | No payment processing. Friends pay in person. |
| Redux / React Query | Zustand handles cart state. No server state to cache (card data is static). |
| Fuse.js / Algolia / Meilisearch | Collection is small. Native JS filtering is sufficient and simpler. |
| Docker / Kubernetes | Vercel handles deployment. No infrastructure to manage. |
| CMS (Sanity, Contentful, etc.) | Data comes from CSV. No content to manage. |
| Shopify / Snipcart / Medusa | Full e-commerce platforms are massive overkill for emailing an order to yourself. |
| MongoDB / Firebase | No need for a database. Period. |

## Architecture Decision: Static vs. Dynamic

**Use Static Site Generation (SSG) with client-side cart.**

- **Card catalog:** Generated at build time from CSV. Rebuild when inventory changes (re-upload CSV, trigger rebuild).
- **Cart:** Client-side only (Zustand + localStorage). No server state.
- **Checkout:** Single API route (`/api/checkout`) that validates the order and sends emails via Resend.
- **Search/filter:** Client-side JavaScript filtering the pre-loaded card array.

This means the site is essentially a static site with one serverless function for email. Hosting cost: $0.

## Data Flow

```
Manabox App
    |
    v (CSV export)
CSV File
    |
    v (PapaParse at build time)
JSON card inventory (name, set, condition, quantity, price)
    |
    v (Next.js SSG)
Static HTML pages with card data embedded
    |
    v (client-side, on page load)
Scryfall API → fetch card images by name
    |
    v (user interaction)
Zustand cart → localStorage persistence
    |
    v (checkout)
Next.js API route → Resend → email to seller + buyer
```

## Scryfall API Strategy

**Do NOT bulk-fetch all images at build time.** Instead:
- Store card names from CSV
- Fetch Scryfall images client-side using `<img>` tags with Scryfall image URIs
- Scryfall image URL pattern: `https://api.scryfall.com/cards/named?format=image&fuzzy={cardname}`
- This is effectively a CDN -- no rate limit concerns for image loading
- For card metadata (price, set info), batch-fetch at build time using Scryfall's `/cards/collection` endpoint (up to 75 cards per request)

**Rate limits:** 10 requests/second for API calls. Image CDN has no practical limit for this scale.

## Installation

```bash
# Create project
npx create-next-app@latest viki --typescript --tailwind --app --src-dir

# Core dependencies
npm install zustand papaparse

# Email
npm install resend @react-email/components

# Dev dependencies (TypeScript types)
npm install -D @types/papaparse
```

## Estimated Bundle

This stack produces a very small bundle:
- Next.js + React: ~85KB gzipped (framework overhead)
- Zustand: ~1KB gzipped
- PapaParse: ~7KB gzipped (only needed at build time, not in client bundle)
- Tailwind: only used classes ship, typically 5-15KB gzipped
- **Total client JS: ~100KB gzipped** -- fast on any connection

## Sources

- Next.js 16.2 release: https://nextjs.org/blog (verified via WebFetch, HIGH confidence)
- Scryfall API: https://scryfall.com/docs/api (verified from training data, well-established API, HIGH confidence)
- Resend: https://resend.com (training data, MEDIUM confidence on current free tier limits)
- PapaParse: https://www.papaparse.com (training data, MEDIUM confidence on exact current version)
- Zustand: https://github.com/pmndrs/zustand (training data, MEDIUM confidence on exact current version)
- Vercel free tier: https://vercel.com/pricing (training data, HIGH confidence on general availability)
