# Phase 5: Checkout and Deploy - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can submit an order by entering their name, email, and an optional message, then receive email confirmations. The seller receives an order notification email. The store is deployed live on Vercel. This phase also lays groundwork for a future thermal printer integration by keeping order data cleanly separated from the notification delivery mechanism.

</domain>

<decisions>
## Implementation Decisions

### Checkout Page Layout
- **D-01:** Layout structure is Claude's discretion (stacked or side-by-side responsive)
- **D-02:** Order summary includes small card thumbnails alongside name, quantity, and price per line
- **D-03:** Form fields: name (required), email (required), optional message/notes textarea
- **D-04:** Checkout page is read-only for cart contents — "Edit cart" link returns to /cart page. No inline quantity editing.

### Email Content & Format
- **D-05:** Simple HTML emails — clean styled with order table, light branding (store name + accent color), no card images in emails
- **D-06:** Same order content in both emails, different tone: seller gets neutral "New order from [Name]" header with buyer contact info; buyer gets friendly "Your order is confirmed!" with pay-in-person reminder
- **D-07:** Seller email address configured via SELLER_EMAIL environment variable
- **D-08:** Order data must be cleanly separated from email rendering — future thermal printer integration will consume the same order data structure to print receipts. Design the order submission as a notification pipeline, not email-specific code.

### Post-Submit Experience
- **D-09:** Simple confirmation page: checkmark icon, "Order placed!" heading, order summary (item count + total), "Confirmation sent to [email]", pay-in-person note, "Browse more cards" link back to catalog
- **D-10:** Cart clears automatically on successful order submission
- **D-11:** On email send failure: show error message ("Something went wrong") with retry button. Cart and form data preserved — nothing lost on failure.

### Deployment
- **D-12:** Deploy to Vercel free tier with default .vercel.app URL (no custom domain)
- **D-13:** App transitions from fully static (SSG) to hybrid: pages remain static, /api/checkout is a serverless function for email sending via Resend
- **D-14:** Environment variables on Vercel: RESEND_API_KEY, SELLER_EMAIL

### Claude's Discretion
- Checkout page layout arrangement (stacked vs side-by-side responsive) — D-01
- Email HTML template styling details (spacing, colors, typography)
- Confirmation page visual design
- Vercel project configuration specifics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Email Service
- `node_modules/next/dist/docs/` — Next.js 16 API route documentation (check for breaking changes vs training data)

### Existing Integration Points
- `src/components/cart-summary-bar.tsx` — Already links to `/checkout`, defines the entry point
- `src/lib/store/cart-store.ts` — Cart state (Zustand + localStorage), source of order items
- `src/lib/types.ts` — Card data model with all fields
- `src/lib/load-cards.ts` — Shared card data loader used by server components

### Prior Phase Context
- `.planning/phases/04-shopping-cart/04-CONTEXT.md` — Cart behavior decisions (quantity controls, stock caps, cart page patterns)
- `.planning/phases/02-card-catalog/02-CONTEXT.md` — Visual design decisions (clean/modern, blue/indigo accents, image-dominant)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cart-summary-bar.tsx`: Already has checkout link and total display — pattern for the confirmation page summary
- `cart-store.ts`: Zustand store with localStorage persistence — will need a `clearCart()` action for post-order cleanup
- `cart-item.tsx`: Cart item rendering with thumbnails — pattern for checkout order summary thumbnails
- `load-cards.ts`: Shared card data loader — checkout page will need card details for the summary

### Established Patterns
- Zustand for client state (cart store, filter store)
- Tailwind CSS with blue/indigo accent colors
- Client components with "use client" directive for interactive pages
- Server components for data loading (page.tsx loads data, passes to client component)

### Integration Points
- `/checkout` route: New page under `src/app/checkout/`
- `/api/checkout` route: New API route under `src/app/api/checkout/`
- `/confirmation` route: New page under `src/app/confirmation/` (or could use query params on checkout success)
- Cart store: Needs `clearCart()` method
- `package.json`: Needs `resend` package added

</code_context>

<specifics>
## Specific Ideas

- **Thermal printer future:** The seller currently gets an email notification, but this will eventually be replaced or supplemented by a thermal printer that prints order receipts. The order data pipeline should be structured so adding a print step later is straightforward (e.g., order data object -> notify(order) -> [email, future: print]).
- **Optional message field:** Buyers can leave a note like "I'll pick these up Friday" — included in seller email.
- **Pay-in-person messaging:** Prominent on both the confirmation page and buyer email — this is not an e-commerce store with payment processing.

</specifics>

<deferred>
## Deferred Ideas

- Thermal printer integration for order receipts (future phase — requires hardware setup)
- Custom domain configuration (can be added to Vercel later without code changes)

</deferred>

---

*Phase: 05-checkout-and-deploy*
*Context gathered: 2026-04-02*
