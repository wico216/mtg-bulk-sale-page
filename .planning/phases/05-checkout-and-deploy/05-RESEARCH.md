# Phase 5: Checkout and Deploy - Research

**Researched:** 2026-04-02
**Domain:** Checkout form, email sending (Resend), Vercel deployment
**Confidence:** HIGH

## Summary

This phase adds a checkout flow, email notifications, and production deployment. The checkout page displays an order summary from the Zustand cart store, collects name/email/optional message, and submits to a Next.js 16 Route Handler (`/api/checkout`). The Route Handler sends two emails via the Resend SDK (seller notification + buyer confirmation), then returns success/failure. On success, the client clears the cart and navigates to a confirmation page. The app deploys to Vercel free tier as a hybrid static+serverless site.

The project already has well-established patterns: Zustand with localStorage persistence and hydration guards, server components for data loading with client components for interactivity, Tailwind CSS with indigo accent colors, and the `loadCardData()` utility for server-side card data access. The checkout page follows the same server/client split pattern as `/cart`. The API route is a standard Next.js 16 Route Handler using the Web Request/Response API.

**Primary recommendation:** Use the Resend Node.js SDK with simple HTML string emails (no React Email dependency needed). Structure order data as a typed interface consumed by both the email renderer and future notification channels (thermal printer). Deploy to Vercel with `RESEND_API_KEY` and `SELLER_EMAIL` as environment variables.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Layout structure is Claude's discretion (stacked or side-by-side responsive)
- D-02: Order summary includes small card thumbnails alongside name, quantity, and price per line
- D-03: Form fields: name (required), email (required), optional message/notes textarea
- D-04: Checkout page is read-only for cart contents -- "Edit cart" link returns to /cart page. No inline quantity editing.
- D-05: Simple HTML emails -- clean styled with order table, light branding (store name + accent color), no card images in emails
- D-06: Same order content in both emails, different tone: seller gets neutral "New order from [Name]" header with buyer contact info; buyer gets friendly "Your order is confirmed!" with pay-in-person reminder
- D-07: Seller email address configured via SELLER_EMAIL environment variable
- D-08: Order data must be cleanly separated from email rendering -- future thermal printer integration will consume the same order data structure to print receipts. Design the order submission as a notification pipeline, not email-specific code.
- D-09: Simple confirmation page: checkmark icon, "Order placed!" heading, order summary (item count + total), "Confirmation sent to [email]", pay-in-person note, "Browse more cards" link back to catalog
- D-10: Cart clears automatically on successful order submission
- D-11: On email send failure: show error message ("Something went wrong") with retry button. Cart and form data preserved -- nothing lost on failure.
- D-12: Deploy to Vercel free tier with default .vercel.app URL (no custom domain)
- D-13: App transitions from fully static (SSG) to hybrid: pages remain static, /api/checkout is a serverless function for email sending via Resend
- D-14: Environment variables on Vercel: RESEND_API_KEY, SELLER_EMAIL

### Claude's Discretion
- Checkout page layout arrangement (stacked vs side-by-side responsive) -- D-01
- Email HTML template styling details (spacing, colors, typography)
- Confirmation page visual design
- Vercel project configuration specifics

### Deferred Ideas (OUT OF SCOPE)
- Thermal printer integration for order receipts (future phase -- requires hardware setup)
- Custom domain configuration (can be added to Vercel later without code changes)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHKT-01 | User can enter name and email to place an order (no account required) | Checkout form with HTML validation (required, type="email"); Route Handler POST endpoint; no auth needed |
| CHKT-02 | User sees order review/summary before final submission | Checkout page renders cart items with thumbnails, quantities, prices, and total from Zustand cart store + server-loaded card data |
| CHKT-03 | Checkout sends order details email to seller | Resend SDK `resend.emails.send()` to `process.env.SELLER_EMAIL` with HTML order table |
| CHKT-04 | Checkout sends confirmation email to buyer | Resend SDK second `resend.emails.send()` to buyer's submitted email address |
| CHKT-05 | User sees confirmation page after successful order with "pay in person" note | Dedicated /confirmation page (or same /checkout with success state) showing order summary + pay-in-person messaging |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| resend | 6.10.0 | Email sending SDK | Official Resend Node.js SDK; simple API, returns structured {data, error}; no complex setup |
| next | 16.2.2 | Framework (already installed) | Route Handlers for API endpoint; hybrid SSG + serverless |
| zustand | 5.0.12 | Cart state (already installed) | Already powers cart; checkout reads from it, confirmation clears it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | No additional libraries required for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend | Nodemailer + SMTP | Resend is simpler (no SMTP config), free tier sufficient (100/day), already decided in stack |
| HTML string emails | React Email (@react-email/components) | Adds dependency; HTML strings are sufficient for simple order table emails per D-05 |
| Server Actions for form | Route Handler POST | Route Handler is cleaner here: checkout needs to send 2 emails + return structured response with error handling; Server Actions are better for data mutations with revalidation |

**Installation:**
```bash
npm install resend
```

**Version verification:** `npm view resend version` returned `6.10.0` (verified 2026-04-02).

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/
    api/
      checkout/
        route.ts          # POST handler: validate, build order, send emails
    checkout/
      page.tsx            # Server component: loads card data, passes to client
      checkout-client.tsx # Client component: form + order summary + submit logic
    confirmation/
      page.tsx            # Server component (or client): confirmation display
  lib/
    types.ts              # Add OrderData, OrderItem interfaces
    order.ts              # Order data builder: cart + cards -> OrderData
    email/
      seller-email.ts     # renderSellerEmail(order: OrderData): string
      buyer-email.ts      # renderBuyerEmail(order: OrderData): string
  components/
    order-summary.tsx     # Shared order summary component (checkout + confirmation)
```

### Pattern 1: Notification Pipeline (D-08)
**What:** Separate order data construction from notification delivery. The order data structure is a clean interface that any notification channel can consume.
**When to use:** Always -- this is a locked decision for thermal printer extensibility.
**Example:**
```typescript
// Source: CONTEXT.md D-08 requirement
// src/lib/types.ts (additions)
interface OrderItem {
  cardId: string;
  name: string;
  setName: string;
  price: number | null;
  quantity: number;
}

interface OrderData {
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: OrderItem[];
  totalItems: number;
  totalPrice: number;
  createdAt: string; // ISO timestamp
}

// src/lib/order.ts -- builds OrderData from cart items + card lookup
function buildOrderData(
  buyerName: string,
  buyerEmail: string,
  message: string | undefined,
  cartItems: Array<{ cardId: string; quantity: number }>,
  cards: Card[]
): OrderData { ... }

// src/lib/email/seller-email.ts -- consumes OrderData, returns HTML string
function renderSellerEmail(order: OrderData): string { ... }

// Future: src/lib/print/receipt.ts -- same OrderData, different output
```

### Pattern 2: Server/Client Split (Existing Pattern)
**What:** Server component loads card data, passes to client component for interactivity.
**When to use:** Checkout page needs card data for order summary display.
**Example:**
```typescript
// Source: Existing pattern from src/app/cart/page.tsx
// src/app/checkout/page.tsx
import { loadCardData } from "@/lib/load-cards";
import Header from "@/components/header";
import CheckoutClient from "./checkout-client";

export const metadata = {
  title: "Checkout -- Viki MTG Bulk Store",
};

export default function CheckoutPage() {
  const data = loadCardData();
  const cards = data?.cards ?? [];
  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header />
      <main className="pt-6 pb-24">
        <CheckoutClient cards={cards} />
      </main>
    </div>
  );
}
```

### Pattern 3: Route Handler for POST API (Next.js 16)
**What:** App Router Route Handler in `src/app/api/checkout/route.ts` exports a `POST` function using Web Request/Response APIs.
**When to use:** Processing checkout submissions server-side (email sending needs server environment for API keys).
**Example:**
```typescript
// Source: Next.js 16 docs (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md)
// src/app/api/checkout/route.ts
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const body = await request.json();
  // Validate body, build OrderData, send emails
  // Return Response.json({ success: true }) or Response.json({ error: "..." }, { status: 500 })
}
```

### Pattern 4: Hydration Guard (Existing Pattern)
**What:** Wait for Zustand persist hydration before rendering cart-dependent UI.
**When to use:** Checkout client component needs cart data from localStorage.
**Example:**
```typescript
// Source: Existing pattern from src/app/cart/cart-page-client.tsx lines 23-29
const [hydrated, setHydrated] = useState(false);
useEffect(() => {
  const unsub = useCartStore.persist.onFinishHydration(() =>
    setHydrated(true),
  );
  if (useCartStore.persist.hasHydrated()) setHydrated(true);
  return unsub;
}, []);
```

### Pattern 5: Confirmation Page via Search Params
**What:** After successful checkout, redirect to `/confirmation?email=...&items=N&total=X.XX` with summary data encoded in URL search params.
**When to use:** Confirmation page needs order summary data but cart is already cleared. Passing minimal summary data via URL avoids needing a database or complex state management.
**Example:**
```typescript
// After successful submit in checkout-client.tsx:
clearCart();
router.push(`/confirmation?email=${encodeURIComponent(email)}&items=${totalItems}&total=${totalPrice.toFixed(2)}`);

// In confirmation/page.tsx -- read from searchParams (server component)
// or use useSearchParams() in client component
```

### Anti-Patterns to Avoid
- **Embedding email sending logic in the client component:** API keys must stay server-side. Always use a Route Handler.
- **Building email HTML inside the Route Handler:** Separate email rendering functions from the API handler for testability and the notification pipeline pattern.
- **Using Server Actions for checkout:** Server Actions are designed for mutations that revalidate cached data. Checkout needs structured error responses and retry capability -- a Route Handler returning JSON is cleaner.
- **Storing full order data in URL params for confirmation:** Only pass minimal display data (email, item count, total). Full order details are not needed on the confirmation page per D-09.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email sending | Custom SMTP client | Resend SDK | SMTP configuration is complex; Resend handles deliverability, retries, bounce management |
| Email validation | Regex pattern | HTML `type="email"` + `required` attributes | Browser-native validation is sufficient for this use case; server-side basic check as backup |
| HTML email templates | Complex template engine | Plain template literal functions | D-05 specifies "simple HTML emails"; template literals with inline styles are adequate |
| Form state management | Custom form reducer | React useState + native form events | Simple 3-field form does not need formik/react-hook-form overhead |
| Deployment pipeline | Custom CI/CD | Vercel CLI / Git integration | Vercel auto-detects Next.js, handles build + deploy |

**Key insight:** This phase is intentionally simple. The checkout has no payment processing, no order persistence, and no user accounts. The complexity is only in the email sending and deployment -- both of which have mature, well-tested solutions.

## Common Pitfalls

### Pitfall 1: Resend Free Tier "From" Address Limitation
**What goes wrong:** Emails sent from `onboarding@resend.dev` can only be delivered to your own verified email address during testing. Production emails to arbitrary addresses require a verified custom domain.
**Why it happens:** Resend restricts the sandbox domain to prevent spam. Without domain verification, you cannot send to real buyer email addresses.
**How to avoid:** The user must verify a domain in Resend's dashboard before deploying to production. For development/testing, use `onboarding@resend.dev` and send test emails only to your own Resend-verified email.
**Warning signs:** Emails silently fail or return errors about unverified domains.

### Pitfall 2: Hydration Mismatch on Checkout Page
**What goes wrong:** Cart data is empty on initial server render, causing a flash of "empty cart" before localStorage hydrates.
**Why it happens:** Zustand persist middleware loads from localStorage asynchronously after initial render.
**How to avoid:** Use the same hydration guard pattern from `cart-page-client.tsx` (lines 23-29). Show loading skeleton until `persist.hasHydrated()` is true.
**Warning signs:** Brief flash of empty/wrong content on page load.

### Pitfall 3: Race Condition on Cart Clear + Navigation
**What goes wrong:** Cart clears before navigation completes, causing a flash of empty state if the user navigates back.
**Why it happens:** `clearCart()` is synchronous but `router.push()` is async.
**How to avoid:** Call `clearCart()` immediately before `router.push()` to the confirmation page. The confirmation page does not read from cart store, so no race condition there. If user presses back, they see empty checkout -- which is correct (order was submitted).
**Warning signs:** User sees empty cart flash before confirmation page loads.

### Pitfall 4: Email Send Partial Failure
**What goes wrong:** Seller email succeeds but buyer email fails (or vice versa). User gets inconsistent experience.
**Why it happens:** Two separate API calls to Resend. Network issues, rate limits, or invalid buyer email can cause one to fail.
**How to avoid:** Send both emails and collect results. If seller email succeeds but buyer fails, still return success to the user (seller got the order). If seller email fails, return error (the order was not placed). Log which emails failed.
**Warning signs:** Buyer never receives confirmation but seller processes the order.

### Pitfall 5: Missing Environment Variables on Vercel
**What goes wrong:** API route crashes with undefined `process.env.RESEND_API_KEY` or `process.env.SELLER_EMAIL`.
**Why it happens:** Environment variables set in `.env.local` are not automatically deployed to Vercel. They must be configured in the Vercel dashboard or via CLI.
**How to avoid:** Add both `RESEND_API_KEY` and `SELLER_EMAIL` to Vercel environment variables before deploying. Add validation at the top of the Route Handler that returns a clear error if env vars are missing.
**Warning signs:** 500 errors on checkout with `Cannot read property 'send' of undefined` or similar.

### Pitfall 6: Next.js 16 Params Are Promises
**What goes wrong:** Accessing `params` without `await` in Route Handlers causes runtime errors.
**Why it happens:** Breaking change in Next.js 15+: `context.params` is now a Promise.
**How to avoid:** This specific checkout route has no dynamic params, so not directly applicable. But be aware if any dynamic routes are added.
**Warning signs:** TypeScript errors about Promise types.

### Pitfall 7: Build Script Compatibility with Vercel
**What goes wrong:** `next build` fails on Vercel because the `generate` script (tsx scripts/generate-data.ts) expects the CSV data file to exist.
**Why it happens:** The build command is `"build": "tsx scripts/generate-data.ts && next build"` which runs data generation at build time. The CSV file and Scryfall cache must be available.
**How to avoid:** Ensure `data/` directory with CSV is committed to git (or generated from committed data). The `data/generated/` output is gitignored, which is correct -- it gets regenerated during build.
**Warning signs:** Build failures on Vercel with "file not found" errors for CSV data.

## Code Examples

### Resend Email Send (Verified Pattern)
```typescript
// Source: https://resend.com/docs/send-with-nodejs
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: "Viki MTG Store <orders@yourdomain.com>",  // Must be verified domain
  to: ["buyer@example.com"],
  subject: "Your order is confirmed!",
  html: "<h1>Thank you for your order!</h1><p>Pay in person when you pick up.</p>",
});

if (error) {
  // error: { message: string, name: string }
  console.error("Email send failed:", error);
}
// data: { id: string } on success
```

### Next.js 16 Route Handler POST
```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
export async function POST(request: Request) {
  const body = await request.json();
  // ... process ...
  return Response.json({ success: true });
  // or
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
```

### Simple HTML Email Template Pattern
```typescript
// Source: Project decision D-05 (simple HTML, no card images)
function renderSellerEmail(order: OrderData): string {
  const rows = order.items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        ${item.price !== null ? `$${(item.price * item.quantity).toFixed(2)}` : "N/A"}
      </td>
    </tr>
  `).join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">New order from ${order.buyerName}</h2>
      <p>Email: ${order.buyerEmail}</p>
      ${order.message ? `<p>Note: ${order.message}</p>` : ""}
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 8px; text-align: left;">Card</th>
            <th style="padding: 8px; text-align: center;">Qty</th>
            <th style="padding: 8px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-weight: bold; text-align: right; margin-top: 16px;">
        Total: $${order.totalPrice.toFixed(2)} (${order.totalItems} items)
      </p>
    </div>
  `;
}
```

### Client-Side Form Submit with Error Handling
```typescript
// Pattern for checkout-client.tsx submit handler
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setSubmitting(true);
  setError(null);

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerName: name,
        buyerEmail: email,
        message: message || undefined,
        items: cartEntries.map(([cardId, qty]) => ({ cardId, quantity: qty })),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Something went wrong");
    }

    // Success: clear cart and navigate
    clearCart();
    router.push(
      `/confirmation?email=${encodeURIComponent(email)}&items=${totalItems}&total=${totalPrice.toFixed(2)}`
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong");
  } finally {
    setSubmitting(false);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| API Routes (pages/api/) | Route Handlers (app/api/) | Next.js 13+ | Use `route.ts` with exported HTTP method functions |
| `context.params` sync | `context.params` is Promise | Next.js 15+ | Must `await` params in Route Handlers |
| Nodemailer + SMTP | Resend SDK | 2023+ | Simpler API, managed deliverability, free tier |
| `Response.json()` not available | `Response.json()` is standard | All modern | Use for JSON responses in Route Handlers |

**Deprecated/outdated:**
- `pages/api/` directory: Still works but not recommended for App Router projects. Use `app/api/` Route Handlers.
- Resend `react` parameter with React Email: Works but adds unnecessary dependency for simple HTML emails.

## Open Questions

1. **Resend Domain Verification**
   - What we know: Free tier requires domain verification for sending to arbitrary email addresses. `onboarding@resend.dev` only works for test emails to your own verified email.
   - What's unclear: Whether the user has a domain to verify, or needs to use the sandbox for initial deployment.
   - Recommendation: Plan includes a note that production email sending requires domain verification in Resend dashboard. For initial deployment/demo, use sandbox mode with test emails.

2. **CSV Data Availability on Vercel Build**
   - What we know: Build command runs `tsx scripts/generate-data.ts && next build`. The CSV source file must exist.
   - What's unclear: Whether the raw CSV and Scryfall cache are committed to git or need special handling.
   - Recommendation: Verify `data/` directory contents are committed (minus `data/generated/` and `data/cache/` which are gitignored). The generate script should work on Vercel if source data is in git.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | (via Next.js 16) | -- |
| Vercel CLI | Deployment | Yes | 50.16.0 | Can use Vercel Git integration instead of CLI |
| npx | Package execution | Yes | 10.9.4 | -- |
| Resend API | Email sending | Needs signup | -- | Must create account at resend.com |
| tsx | Build script | Yes | (dev dependency) | -- |

**Missing dependencies with no fallback:**
- Resend API account: User must sign up at resend.com and obtain API key before email sending works.

**Missing dependencies with fallback:**
- Vercel CLI is available, but Vercel Git integration (connect GitHub repo) is the simpler deployment path.

## Project Constraints (from CLAUDE.md)

- **AGENTS.md directive:** "This is NOT the Next.js you know. This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."
- **Implication for this phase:** Route Handlers must follow Next.js 16 conventions (verified above from local docs). `params` is a Promise (not relevant for this route but good to know). Route Handlers use Web Request/Response APIs.
- **Verified:** Route Handler patterns in this research are sourced directly from `node_modules/next/dist/docs/` in the project, not from training data.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` -- Route Handler conventions, caching, POST pattern
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` -- Route Handler API reference, params as Promise, Request body parsing
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` -- env var loading, NEXT_PUBLIC_ prefix rules
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` -- Form handling patterns in Next.js 16
- `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md` -- Deployment options, Vercel as verified adapter
- Existing codebase: `src/app/cart/cart-page-client.tsx`, `src/lib/store/cart-store.ts`, `src/lib/types.ts`, `src/lib/load-cards.ts` -- established project patterns

### Secondary (MEDIUM confidence)
- [Resend Node.js docs](https://resend.com/docs/send-with-nodejs) -- SDK initialization, send() API, error handling
- [Resend account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) -- Free tier: 100 emails/day, 3000/month, 5 req/sec
- [Resend pricing](https://resend.com/pricing) -- Free tier limits confirmation
- npm registry: `resend@6.10.0` (verified via `npm view resend version`)

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Resend version verified via npm, Next.js patterns from local docs
- Architecture: HIGH -- follows established project patterns from phases 1-4, notification pipeline per CONTEXT.md D-08
- Pitfalls: HIGH -- Resend domain limitation verified via official docs; hydration pattern from existing code; env var handling from Next.js docs

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- Resend SDK and Next.js 16 are stable releases)
