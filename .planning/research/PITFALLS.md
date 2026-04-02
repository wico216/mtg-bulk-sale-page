# Domain Pitfalls

**Domain:** MTG card store with Scryfall integration
**Researched:** 2026-04-02

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Scryfall API Rate Limiting on Page Load
**What goes wrong:** Fetching card data from Scryfall for each card when the page renders. 500+ cards blow through 10 req/sec instantly.
**Why it happens:** Developers treat Scryfall like a CDN instead of enriching data at build time.
**Consequences:** 429 errors, broken images, slow loads, potential IP ban.
**Prevention:** Batch-fetch metadata at build time using `/cards/collection` (75 cards/request). Store image URIs in JSON. Use Scryfall CDN URLs directly in `<img>` tags.
**Detection:** 429 responses in browser console. Broken image icons.

### Pitfall 2: Manabox CSV Format Assumptions
**What goes wrong:** Hardcoding column names or positions, then the format changes or has unexpected values.
**Why it happens:** Building parser without a real CSV sample.
**Consequences:** Import fails silently, garbled data, missing cards.
**Prevention:** Get a real Manabox CSV export FIRST. Detect headers dynamically. Handle quoted fields, special characters, split card names with "//". Log parse warnings.
**Detection:** Import count doesn't match expected. Cards with wrong names or missing images.

### Pitfall 3: Card Name Matching Failures with Scryfall
**What goes wrong:** Manabox names don't exactly match Scryfall naming -- split cards ("Fire // Ice"), DFCs, smart quotes, accented characters.
**Why it happens:** Different systems have different naming conventions.
**Consequences:** Missing images, "card not found" errors.
**Prevention:** Match by set code + collector number (available in Manabox CSV), NOT by card name. This is a unique identifier that avoids naming issues entirely. Fall back to fuzzy search only when set+number fails.
**Detection:** Build script should log all cards that fail Scryfall lookup.

### Pitfall 4: Email Delivery Failing Silently
**What goes wrong:** Checkout appears successful but email never arrives. Seller never sees the order.
**Why it happens:** No domain verification (SPF/DKIM), emails land in spam, no error handling.
**Consequences:** Lost orders -- the core function is broken.
**Prevention:** Use Resend with domain verification. Show order details on the confirmation page itself (don't rely solely on email). Add error handling: if email fails, still show confirmation with "email may be delayed" note. Test end-to-end with Gmail and Outlook.
**Detection:** Test full checkout flow before sharing. Check spam folders.

## Moderate Pitfalls

### Pitfall 5: Zustand Hydration Mismatch (SSG + Client State)
**What goes wrong:** Next.js renders page server-side with empty cart. Client hydrates with localStorage cart data. React throws hydration mismatch errors.
**Prevention:** Use `useEffect` or Zustand's `onRehydrateStorage` to delay cart count display until after client mount. Render cart as empty on server, update on mount.

### Pitfall 6: Rendering Thousands of Cards Without Pagination
**What goes wrong:** Loading 2,000+ card images into the DOM at once. Page becomes sluggish, mobile browsers crash.
**Prevention:** Pagination (20-50 cards per page). Use `loading="lazy"` on all `<img>` tags. Use Scryfall's "normal" size (488x680) not "large" or "png".

### Pitfall 7: Cart Quantity Exceeding Available Stock
**What goes wrong:** Friend adds 4 copies to cart but only 2 are available.
**Prevention:** Validate cart quantities against inventory. Show available quantity. Disable add when maxed. Server-side validation in API route before sending email.

### Pitfall 8: Large Card Images Without Lazy Loading
**What goes wrong:** 50 cards at ~80KB each = 4MB loaded simultaneously.
**Prevention:** `loading="lazy"` on images. Use Scryfall "normal" size. Set explicit width/height to prevent layout shift.

### Pitfall 9: Environment Variables Exposed in Client Bundle
**What goes wrong:** Resend API key in client-side JavaScript.
**Prevention:** Resend key stays in `/api/checkout` (server-only). Use `RESEND_API_KEY` not `NEXT_PUBLIC_RESEND_API_KEY`. Next.js only exposes `NEXT_PUBLIC_*` vars to client.

## Minor Pitfalls

### Pitfall 10: No Loading States
**What goes wrong:** Empty boxes while card images load.
**Prevention:** Card-back placeholder or skeleton loader. Set explicit dimensions on images.

### Pitfall 11: Checkout Form Without Validation
**What goes wrong:** Empty name, invalid email, empty cart submitted.
**Prevention:** Client-side validation (required fields, email format) + server-side validation in API route.

### Pitfall 12: Stale Inventory After Cards Sell
**What goes wrong:** Site shows cards that have been sold in person.
**Prevention:** Accept this limitation (no database). Show "Last updated" date prominently. Include "availability subject to confirmation" in checkout email. Make CSV re-upload and rebuild easy.

### Pitfall 13: Missing alt Text on Card Images
**What goes wrong:** Accessibility issues.
**Prevention:** Use card name as `alt` text on every image.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CSV Import | Format assumptions (2), name matching (3) | Real CSV sample first, match by set+collector number |
| Scryfall Integration | Rate limiting (1) | Batch at build time, use `/cards/collection` |
| Card Catalog UI | Rendering performance (6), image loading (8) | Pagination, lazy loading |
| Cart | Hydration mismatch (5), quantity validation (7) | Delay hydration, validate against inventory |
| Checkout | Email delivery (4), missing validation (11) | Domain verification, server-side validation |
| Deployment | Secret exposure (9) | Server-only env vars |
| Operations | Stale inventory (12) | "Last updated" date, easy rebuild |

## Sources

- Scryfall API guidelines: training data (MEDIUM confidence on exact rate limits -- verify at scryfall.com/docs/api)
- Next.js hydration behavior: training data (HIGH confidence -- well-documented)
- MTG card naming conventions: training data (HIGH confidence -- well-established patterns)
- Email deliverability: training data (HIGH confidence -- common web dev challenge)
