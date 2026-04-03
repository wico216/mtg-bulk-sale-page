# Phase 5: Checkout and Deploy - Research

**Researched:** 2026-04-03
**Domain:** Checkout form, email sending (Resend), confirmation page, Vercel deployment
**Confidence:** HIGH

## Summary

Phase 5 adds three new routes (`/checkout`, `/api/checkout`, `/confirmation`) and deploys the application to Vercel. The checkout page is a client component that reads cart state from the existing Zustand store, collects buyer info (name, email, optional message), and POSTs to a Route Handler that sends emails via the Resend SDK. The confirmation page reads order details from URL search params and displays a receipt-like summary with a pay-in-person note.

The tech stack is straightforward: the Resend Node.js SDK (v6.10.0) handles email delivery, Next.js 16 Route Handlers handle the API endpoint, and Vercel free tier hosts the application. The project already has `clearCart()` in the cart store, `loadCardData()` for server-side card lookup, and established patterns for client/server component composition. A detailed UI-SPEC (`05-UI-SPEC.md`) provides exact copy, layout, interaction state, and email template contracts.

**Primary recommendation:** Use two sequential `resend.emails.send()` calls (seller first, buyer second) to enable D-17's partial failure handling. Structure order data as a standalone typed interface consumed by both email rendering and future thermal printer integration (D-14). Pass confirmation data via URL search params for essential fields, with sessionStorage for full item details.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Layout structure is Claude's discretion (stacked or side-by-side responsive)
- D-02: Order summary includes small card thumbnails (32-40px) alongside name, quantity, and price per line
- D-03: Form fields: name (required), email (required), optional message/notes textarea
- D-04: Checkout page is read-only for cart contents -- "Edit cart" link returns to /cart page. No inline quantity editing.
- D-05: Mobile layout: form first, order summary below (action-first pattern)
- D-06: Sticky submit button at bottom on mobile -- always visible with total, matching cart summary bar pattern
- D-07: Empty cart: block checkout entirely -- disable/hide checkout button when cart is empty
- D-08: Stale items: API validates stock on submission -- returns errors for out-of-stock items
- D-09: Email validation: client-side HTML5 validation + server-side basic regex check
- D-10: No rate limiting
- D-11: Simple HTML emails -- clean styled with order table, light branding, no card images
- D-12: Same order content in both emails, different tone
- D-13: Seller email address configured via SELLER_EMAIL environment variable
- D-14: Order data must be cleanly separated from email rendering -- notification pipeline design
- D-15: Use Resend default domain (onboarding@resend.dev)
- D-16: Reply-to on buyer confirmation points to seller's email
- D-17: Partial email failure: treat as success. Seller notification is priority.
- D-18: Order data logged via console.log to Vercel function logs
- D-19: Submit button shows spinner + "Placing order..." text, disabled
- D-20: On success: router.push('/confirmation') with order details via query params or state
- D-21: Cart clears automatically on successful order
- D-22: Navigating back from confirmation shows empty cart
- D-23: On email send failure: show error with retry. Cart and form data preserved.
- D-24: Timestamp-based order reference number (e.g., "ORD-20260403-1234")
- D-25: Full order summary on confirmation page
- D-26: Checkmark icon, "Order placed!" heading, order summary, email note, pay-in-person note
- D-27: Single action: "Browse more cards" link back to catalog
- D-28: Deploy to Vercel free tier with default .vercel.app URL
- D-29: Hybrid: pages remain static, /api/checkout is serverless function
- D-30: Environment variables on Vercel: RESEND_API_KEY, SELLER_EMAIL
- D-31: Card data generated at build time
- D-32: Inventory update workflow: push updated CSV -> Vercel auto-rebuilds
- D-33: Monitoring: Vercel built-in analytics and function logs only

### Claude's Discretion
- Checkout page layout arrangement (stacked vs side-by-side responsive) -- D-01
- Email HTML template styling details (spacing, colors, typography)
- Confirmation page visual design
- Vercel project configuration specifics
- Order reference number format details (exact timestamp pattern)

### Deferred Ideas (OUT OF SCOPE)
- Thermal printer integration for order receipts (future phase)
- Custom domain configuration
- Custom sender email domain for Resend (requires DNS setup)
- Sentry/error tracking
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHKT-01 | User can enter name and email to place an order (no account required) | Checkout client component with HTML form (name + email required fields + optional message), POST to Route Handler at /api/checkout |
| CHKT-02 | User sees order review/summary before final submission | OrderSummary component rendering cart items with thumbnails, quantities, prices, total on checkout page; read-only per D-04 |
| CHKT-03 | Checkout sends order details email to seller | Resend SDK `emails.send()` in Route Handler, seller email via SELLER_EMAIL env var, HTML template with order table |
| CHKT-04 | Checkout sends confirmation email to buyer | Second Resend `emails.send()` call with replyTo pointing to seller (D-16), friendly buyer tone |
| CHKT-05 | User sees confirmation page after successful order with "pay in person" note | `/confirmation` route reading order data from URL search params + sessionStorage, receipt-like display per D-25/D-26 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| resend | 6.10.0 | Email sending SDK | Only new dependency; official SDK, TypeScript-first, simple `{data, error}` return pattern |
| next | 16.2.2 | Framework (Route Handlers for API) | Already installed; Route Handlers replace API Routes |
| react | 19.2.4 | UI rendering | Already installed |
| zustand | 5.0.12 | Cart state (read for order, clearCart on success) | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | -- | -- | All other dependencies already present |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend SDK | Raw fetch to Resend REST API | SDK adds types, error handling; tiny bundle (server-only) |
| HTML string emails | React Email (@react-email/components) | React Email is more maintainable for complex templates, but overkill for 2 simple table-based emails per D-11 |
| URL search params for confirmation | sessionStorage only | Search params survive page refresh and new tabs; sessionStorage is tab-scoped but can hold more data |
| Two sequential sends | `resend.batch.send()` | Batch is a single call but returns single success/failure, making D-17 partial failure handling impossible. Sequential calls give per-email control. |

**Installation:**
```bash
npm install resend
```

**Version verification:** Confirmed via `npm view resend version` on 2026-04-03: **6.10.0** (published 2026-03-31).

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/
    checkout/
      page.tsx              # Server component: loads card data, renders CheckoutClient
      checkout-client.tsx   # Client component: form + order summary + submit logic
    api/
      checkout/
        route.ts            # POST Route Handler: validate, build order, send emails
    confirmation/
      page.tsx              # Server component shell
      confirmation-client.tsx  # Client component: reads search params + sessionStorage
  components/
    order-summary.tsx       # Shared: read-only order item list (checkout + confirmation)
  lib/
    types.ts                # Add OrderData, OrderItem, CheckoutRequest, CheckoutResponse types
    order.ts                # Order data builder: cart + cards -> OrderData; order ref generation
    email/
      seller-email.ts       # HTML template function for seller notification
      buyer-email.ts        # HTML template function for buyer confirmation
    notifications.ts        # Notification pipeline: notify(order) -> send emails, log order
```

### Pattern 1: Server Component + Client Component Composition
**What:** Server component (`page.tsx`) loads card data at build time, passes to client component for interactivity.
**When to use:** Every page in this project follows this pattern (home, cart, checkout).
**Example:**
```typescript
// Source: Existing pattern in src/app/cart/page.tsx
// src/app/checkout/page.tsx
import { loadCardData } from "@/lib/load-cards";
import Header from "@/components/header";
import CheckoutClient from "./checkout-client";

export const metadata = { title: "Checkout -- Viki MTG Bulk Store" };

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

### Pattern 2: Route Handler for POST API (Next.js 16)
**What:** App Router Route Handler at `app/api/checkout/route.ts` exports a `POST` function using Web Request/Response APIs.
**When to use:** Server-side operations needing environment variables (RESEND_API_KEY, SELLER_EMAIL).
**Critical:** Per Next.js 16 docs, Route Handlers use `Request`/`Response` (Web API), NOT `NextApiRequest`/`NextApiResponse` (Pages Router). POST handlers are never cached.
**Example:**
```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// src/app/api/checkout/route.ts
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  // validate, build OrderData, send emails via notifications pipeline
  return Response.json({ success: true, orderRef: "ORD-20260403-1534" });
}
```

### Pattern 3: Notification Pipeline (D-14 Compliance)
**What:** Separate order data construction from notification delivery. OrderData is a clean typed interface consumed by any notification channel.
**When to use:** Mandatory per D-14 for future thermal printer extensibility.
**Example:**
```typescript
// src/lib/types.ts -- pure data types, no side effects
interface OrderItem {
  cardId: string;
  name: string;
  setName: string;
  price: number | null;
  quantity: number;
  lineTotal: number | null;
}

interface OrderData {
  orderRef: string;
  buyerName: string;
  buyerEmail: string;
  message?: string;
  items: OrderItem[];
  totalItems: number;
  totalPrice: number;
  createdAt: string; // ISO timestamp
}

// src/lib/order.ts -- builds OrderData from cart + card data
function buildOrderData(...): OrderData { ... }
function generateOrderRef(): string { ... }

// src/lib/notifications.ts -- delivery mechanism
interface NotifyResult {
  sellerEmailSent: boolean;
  buyerEmailSent: boolean;
}
async function notifyOrder(order: OrderData): Promise<NotifyResult> {
  // Send seller email (priority per D-17)
  // Send buyer email (best-effort)
  // console.log order data (D-18)
  // Future: also trigger thermal printer
}

// src/lib/email/seller-email.ts -- HTML string builder
function buildSellerEmailHtml(order: OrderData): string { ... }

// src/lib/email/buyer-email.ts -- HTML string builder
function buildBuyerEmailHtml(order: OrderData): string { ... }
```

### Pattern 4: Sequential Email Sends (D-17 Compliance)
**What:** Send seller email first (priority), then buyer email (best-effort). If seller succeeds and buyer fails, treat as success.
**When to use:** Always -- this is the D-17 partial failure strategy.
**Why not batch.send():** `resend.batch.send()` returns a single success/failure for the whole batch, making it impossible to distinguish which email failed. Sequential sends give per-email error handling.
**Example:**
```typescript
// Source: https://resend.com/docs/send-with-nodejs (verified 2026-04-03)
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

// Send seller first (priority per D-17)
const sellerResult = await resend.emails.send({
  from: "Viki MTG Store <onboarding@resend.dev>",
  to: [process.env.SELLER_EMAIL!],
  subject: `New order from ${order.buyerName}`,
  html: buildSellerEmailHtml(order),
});

if (sellerResult.error) {
  // Seller email failed -- treat as order failure
  return Response.json({ error: "Failed to place order" }, { status: 500 });
}

// Send buyer second (best-effort)
try {
  await resend.emails.send({
    from: "Viki MTG Store <onboarding@resend.dev>",
    to: [order.buyerEmail],
    replyTo: process.env.SELLER_EMAIL!,  // D-16
    subject: "Your order is confirmed!",
    html: buildBuyerEmailHtml(order),
  });
} catch (e) {
  console.error("Buyer email failed (non-critical):", e);
  // Continue -- seller got the order, treat as success per D-17
}
```

### Pattern 5: Hydration Guard (Existing Pattern)
**What:** Prevent empty-state flash before Zustand hydrates from localStorage.
**When to use:** Every client component that reads cart state (checkout page, and any component showing cart data).
**Example:**
```typescript
// Source: Existing pattern from src/app/cart/cart-page-client.tsx lines 23-29
const [hydrated, setHydrated] = useState(false);
useEffect(() => {
  const unsub = useCartStore.persist.onFinishHydration(() => setHydrated(true));
  if (useCartStore.persist.hasHydrated()) setHydrated(true);
  return unsub;
}, []);
// Show skeleton until hydrated
```

### Pattern 6: Confirmation Page Data Transfer
**What:** Pass order data to confirmation page via URL search params (essential fields) + sessionStorage (full item list).
**When to use:** After successful order submission, before navigation.
**Why dual approach:** URL params survive page refresh but have ~2000 char limit. SessionStorage holds unlimited data but is tab-scoped. Combine both: essential display data in URL, full receipt data in sessionStorage.
**Example:**
```typescript
// Before navigation in checkout-client.tsx:
sessionStorage.setItem("lastOrder", JSON.stringify(orderData));
clearCart();
router.push(
  `/confirmation?ref=${orderRef}&email=${encodeURIComponent(email)}&total=${totalPrice.toFixed(2)}&count=${totalItems}&name=${encodeURIComponent(name)}`
);

// In confirmation-client.tsx:
const searchParams = useSearchParams();
const ref = searchParams.get("ref");
// Try sessionStorage for full order details
const stored = sessionStorage.getItem("lastOrder");
const fullOrder = stored ? JSON.parse(stored) : null;
// If sessionStorage empty (page refresh, new tab), show summary from URL params
```

### Anti-Patterns to Avoid
- **Calling Route Handler from Server Component:** Per Next.js docs, do NOT call your own Route Handlers from Server Components. Route Handlers are for client-side fetch calls only.
- **Using getStaticProps/getServerSideProps:** These are Pages Router patterns. App Router uses Server Components and Route Handlers.
- **Storing confirmation data in Zustand:** Cart gets cleared after order. Confirmation data should NOT flow through cart state.
- **Building email HTML with JSX in Route Handler:** Keep email templates as plain string-returning functions. React Email is overkill for 2 simple table emails.
- **Exposing RESEND_API_KEY to client:** API key must NEVER appear in client components. Only access it in Route Handlers (server-side). Do NOT prefix with NEXT_PUBLIC_.
- **Using `NextApiRequest`/`NextApiResponse`:** These are Pages Router types. App Router Route Handlers use Web `Request`/`Response`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Raw SMTP/fetch | Resend SDK | Deliverability, retry logic, bounce handling, TypeScript types |
| Email HTML tables | Custom table builder | Inline HTML string templates | Email HTML is quirky but these are simple tables; library overhead not justified |
| Form validation (server) | Complex validation library | Simple type checks + email regex | Only 3 fields (name, email, message). Zod is overkill. |
| Order reference numbers | UUID or database sequences | Timestamp-based `ORD-YYYYMMDD-HHMM` | Per D-24, simple and readable for friend conversations |
| Deployment pipeline | Custom CI/CD | Vercel GitHub integration | Auto-deploy on push, zero config for Next.js |
| Email template engine | Handlebars, EJS, React Email | Template literal functions | D-11 specifies "simple HTML emails"; string functions are sufficient |

**Key insight:** This is a friend-circle store, not a high-traffic e-commerce platform. Every architectural decision should favor simplicity. The notification pipeline pattern (D-14) is the only "future-proofing" explicitly requested.

## Common Pitfalls

### Pitfall 1: Resend Default Domain Limitations
**What goes wrong:** Emails sent from `onboarding@resend.dev` have restricted deliverability. May land in spam or only deliver to the account owner's verified email during testing.
**Why it happens:** Resend's shared test domain has lower trust scores with email providers. Free tier: 100 emails/day, 3,000/month, 5 requests/second.
**How to avoid:** This is acceptable per D-15 (friend circle, low volume). The 100/day limit is more than sufficient. Document that custom domain improves deliverability if needed later (deferred per CONTEXT.md).
**Warning signs:** Buyer says "I didn't get the confirmation email." Check spam folder first.

### Pitfall 2: Hydration Mismatch on Checkout Page
**What goes wrong:** Server renders empty cart state, client hydrates with items from localStorage, causing a flash of incorrect content.
**Why it happens:** Zustand persist middleware loads from localStorage asynchronously after initial React render.
**How to avoid:** Use the same hydration guard pattern from `cart-page-client.tsx`. Show skeleton/loading state until `persist.hasHydrated()` returns true.
**Warning signs:** Brief flash of "Your cart is empty" then items appear.

### Pitfall 3: Double Submission
**What goes wrong:** User clicks "Place order" twice quickly, two sets of emails sent.
**Why it happens:** No submit-in-progress guard on the button.
**How to avoid:** Set `submitting` state to `true` immediately on click (D-19). Disable button and show "Placing order..." text. Set it BEFORE the async fetch call, not after.
**Warning signs:** Seller receives duplicate order emails.

### Pitfall 4: Cart State Lost Between Checkout and Confirmation
**What goes wrong:** Cart cleared before confirmation page loads; user sees empty confirmation.
**Why it happens:** If confirmation page tries to read cart state which was already cleared.
**How to avoid:** Confirmation data MUST be passed via URL search params and/or sessionStorage, NOT from cart state. Stash data BEFORE `clearCart()`, then clear, then navigate.
**Warning signs:** Empty or incomplete confirmation page after successful order.

### Pitfall 5: Large URL Search Params
**What goes wrong:** Order with many items creates an extremely long URL (>2000 chars) that gets truncated.
**Why it happens:** Encoding full order details (item names, prices, quantities) directly into query string.
**How to avoid:** Pass only essential summary fields in URL params (ref, email, total, count, name). Store full item list in sessionStorage. On confirmation page, try sessionStorage first, fall back to summary-only display from URL params.
**Warning signs:** URL longer than ~2000 characters, confirmation page missing items.

### Pitfall 6: Missing Environment Variables on Vercel
**What goes wrong:** API route crashes with undefined variable errors or Resend returns auth error.
**Why it happens:** `RESEND_API_KEY` and `SELLER_EMAIL` set in `.env.local` are NOT auto-deployed to Vercel. Must be configured in Vercel dashboard.
**How to avoid:** Validate env vars at the top of the Route Handler with clear error messages. Create `.env.local.example` documenting required variables. Add env vars to Vercel dashboard before first deploy.
**Warning signs:** 500 errors on checkout submission in production.

### Pitfall 7: Build Script on Vercel
**What goes wrong:** `next build` fails on Vercel because data generation (`tsx scripts/generate-data.ts`) cannot find source CSV or `tsx` is not available.
**Why it happens:** The build command is `"build": "tsx scripts/generate-data.ts && next build"`. `tsx` is a devDependency (installed during Vercel build). The CSV source file must be in git.
**How to avoid:** Ensure `data/` directory with source CSV is committed to git. `data/generated/` and `data/cache/` are correctly gitignored and regenerated during build. `tsx` is in devDependencies so Vercel installs it.
**Warning signs:** Build failures on Vercel with "file not found" errors.

### Pitfall 8: XSS in Email Templates
**What goes wrong:** User-submitted name or message contains HTML/script tags that get injected into email HTML.
**Why it happens:** Template literal string interpolation without escaping.
**How to avoid:** Escape HTML entities in user-provided fields (name, email, message) before interpolating into email HTML. Simple escape function: replace `<`, `>`, `&`, `"`, `'` with HTML entities.
**Warning signs:** Broken email layout or rendered HTML tags in email body.

## Code Examples

Verified patterns from official sources:

### Route Handler POST with JSON Body
```typescript
// Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// src/app/api/checkout/route.ts
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Process order...
    return Response.json({ success: true, orderRef: "ORD-20260403-1534" });
  } catch (error) {
    return Response.json(
      { success: false, error: "Failed to process order" },
      { status: 500 }
    );
  }
}
```

### Resend Email Send (TypeScript, verified camelCase)
```typescript
// Source: https://resend.com/docs/send-with-nodejs (verified 2026-04-03)
// Node SDK uses camelCase: replyTo (not reply_to), scheduledAt (not scheduled_at)
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: "Viki MTG Store <onboarding@resend.dev>",
  to: ["buyer@example.com"],
  replyTo: "seller@example.com",  // D-16: buyer replies go to seller
  subject: "Your order is confirmed!",
  html: "<h1>Thanks for your order!</h1>",
});

if (error) {
  console.error("Email send failed:", error);
  // error has: { message: string, name: string }
}
// data on success: { id: string }
```

### HTML Email Template Pattern (Inline Styles Required)
```typescript
// Source: UI-SPEC email template visual contract
// Email clients strip <style> tags -- ALL styling must be inline
function buildSellerEmailHtml(order: OrderData): string {
  const rows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">
        ${item.lineTotal !== null ? `$${item.lineTotal.toFixed(2)}` : "N/A"}
      </td>
    </tr>`
    )
    .join("");

  return `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#171717;">
      <div style="padding:16px 0;border-bottom:2px solid #4f46e5;">
        <span style="color:#4f46e5;font-size:14px;font-weight:bold;">Viki MTG Store</span>
      </div>
      <h1 style="font-size:20px;margin:24px 0 16px;">New order from ${escapeHtml(order.buyerName)}</h1>
      <p style="font-size:14px;">Email: ${escapeHtml(order.buyerEmail)}</p>
      ${order.message ? `<p style="font-size:14px;">Note: ${escapeHtml(order.message)}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;">Card</th>
            <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;">Qty</th>
            <th style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:14px;font-weight:bold;text-align:right;">
        Total: $${order.totalPrice.toFixed(2)} (${order.totalItems} items)
      </p>
    </div>`;
}
```

### Order Reference Number Generation
```typescript
// Per D-24: timestamp-based, e.g., "ORD-20260403-1534"
function generateOrderRef(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 16).replace(":", "");
  return `ORD-${date}-${time}`;
}
// Output example: "ORD-20260403-1534" (3:34 PM UTC)
```

### HTML Escape Utility (XSS Prevention)
```typescript
// Required for escaping user input in email HTML templates
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

### Client-Side Form Submit with Error Handling
```typescript
// Pattern for checkout-client.tsx submit handler
"use client";
import { useRouter } from "next/navigation";

const router = useRouter();
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");

    // Stash full order data in sessionStorage BEFORE clearing cart
    sessionStorage.setItem("lastOrder", JSON.stringify(data.order));
    clearCart();
    router.push(
      `/confirmation?ref=${data.orderRef}&email=${encodeURIComponent(email)}&total=${totalPrice.toFixed(2)}&count=${totalItems}&name=${encodeURIComponent(name)}`
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
| Pages Router API Routes (`pages/api/`) | App Router Route Handlers (`app/api/route.ts`) | Next.js 13.2+ | Different file conventions, Web Request/Response APIs |
| `context.params` as sync object | `context.params` is Promise (must await) | Next.js 15 RC | Breaking change for dynamic route handlers |
| GET Route Handlers cached by default | GET Route Handlers dynamic by default | Next.js 15 RC | POST handlers unaffected (never cached) |
| Nodemailer + SMTP | Resend SDK (or similar hosted services) | 2023+ | Hosted email removes SMTP config, improves deliverability |
| Resend v3 `resend.sendEmail()` | Resend v6 `resend.emails.send()` | v4+ | Different method name, same pattern |

**Deprecated/outdated:**
- `pages/api/` directory: Still works but not recommended for App Router projects
- `NextApiRequest` / `NextApiResponse`: Use Web `Request` / `Response` in Route Handlers
- Resend `sendEmail()`: Current v6 uses `emails.send()`

## Open Questions

1. **Confirmation page data strategy**
   - What we know: URL search params work for essential fields but have ~2000 char limit. SessionStorage works for full data but is tab-scoped and lost on refresh.
   - What's unclear: For orders with 20+ unique items, will the full item list fit in search params?
   - Recommendation: Use dual approach -- essential summary in URL params (ref, email, total, count, name), full order with items in sessionStorage. Confirmation page tries sessionStorage first, falls back to summary-only display. For a friend store, orders are likely small (5-15 items), but the dual approach is robust regardless.

2. **Resend onboarding@resend.dev deliverability**
   - What we know: The test domain works for development. Free tier is 100 emails/day, 3,000/month.
   - What's unclear: Whether the shared domain delivers reliably to Gmail, Outlook, etc. in production for non-test recipients.
   - Recommendation: Acceptable per D-15. If emails aren't received, check spam. Custom domain is deferred per CONTEXT.md.

3. **Stock validation in API route (D-08)**
   - What we know: The API should validate that requested items are still in stock at submission time.
   - What's unclear: Since card data is static (generated at build time), "out of stock" only changes on rebuild. In practice, between builds, stock is fixed.
   - Recommendation: Still validate in the API route by loading card data and checking quantities. This prevents stale-browser cart issues (user had old tab open, stock changed after rebuild). Use `loadCardData()` in the Route Handler.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| npm | Package install | Yes | 10.9.4 | -- |
| Vercel CLI | Deployment | Yes | 50.16.0 | Deploy via GitHub integration instead |
| gh CLI | GitHub integration | Yes | 2.86.0 | Manual GitHub repo setup |
| tsx | Build script | Yes | devDependency | -- |
| Resend SDK | Email sending | Not yet installed | 6.10.0 (latest) | Plan includes `npm install resend` step |
| RESEND_API_KEY | Email auth | Not yet configured | -- | Must sign up at resend.com |
| SELLER_EMAIL | Email recipient | Not yet configured | -- | Must set in .env.local and Vercel |

**Missing dependencies with no fallback:**
- RESEND_API_KEY: Requires user to sign up at resend.com and create an API key
- SELLER_EMAIL: Requires user to provide their email address

**Missing dependencies with fallback:**
- Vercel CLI: Available, but GitHub integration provides zero-config deploy as simpler alternative

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed (no test infrastructure in project) |
| Config file | none |
| Quick run command | `npm run build` (TypeScript compilation + SSG validates all pages render) |
| Full suite command | `npm run build && npm run start` (build + local server for manual smoke test) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHKT-01 | Name/email form submission creates order | manual | Build succeeds + manual form test | N/A |
| CHKT-02 | Order summary displays before submission | manual | Build succeeds + visual verification | N/A |
| CHKT-03 | Seller receives email with order details | manual | POST to /api/checkout, check Resend dashboard | N/A |
| CHKT-04 | Buyer receives confirmation email | manual | Same as CHKT-03, verify buyer inbox | N/A |
| CHKT-05 | Confirmation page shows with pay-in-person note | manual | Navigate to /confirmation with params | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` -- TypeScript compilation + SSG validates all pages compile
- **Per wave merge:** `npm run build && npm run dev` -- build + local server smoke test
- **Phase gate:** Manual walkthrough of full checkout flow (form -> submit -> emails -> confirmation)

### Wave 0 Gaps
- No test framework installed; project has operated without automated tests through 4 phases
- Manual testing is acceptable for this project scope (friend store, 5 requirements, final phase)
- If automated testing is desired later: install Vitest, but this is NOT required for v1

### Validation Checklist (Manual)
1. `npm run build` succeeds (TypeScript + SSG)
2. `npm run dev` -- walk through: add items -> checkout -> fill form -> submit
3. Verify both emails received in Resend dashboard with correct content
4. Verify confirmation page shows order ref, summary, pay-in-person note
5. Verify cart is cleared after successful order
6. Verify error handling: invalid API key -> submit -> see error -> retry works
7. Verify empty cart blocks checkout (D-07)
8. Verify "Edit cart" link navigates back to /cart (D-04)
9. Deploy to Vercel -> repeat steps 2-8 on production URL

## Project Constraints (from CLAUDE.md)

- **CRITICAL: Read Next.js 16 docs before writing code.** The AGENTS.md mandate: "This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."
- **Verified docs for this phase:**
  - Route Handlers: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
  - Environment variables: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
  - Forms: `node_modules/next/dist/docs/01-app/02-guides/forms.md`
  - Deployment: `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`
- Route Handlers use Web `Request`/`Response` APIs, NOT `NextApiRequest`/`NextApiResponse`.
- `context.params` is a Promise in Next.js 15+ (not relevant for `/api/checkout` which has no dynamic segments).
- POST Route Handlers are never cached (no `force-static` needed).
- `.env` files load from project root even with `/src` directory.
- Non-`NEXT_PUBLIC_` env vars are server-only (correct for API keys).

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` -- Route Handler API reference, params as Promise, Web API usage, POST body parsing
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` -- Env var loading, NEXT_PUBLIC_ prefix rules, .env file hierarchy
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` -- Form handling, useActionState, validation patterns
- `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md` -- Deployment options, Vercel as verified adapter
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` -- Route Handler conventions, caching behavior
- Existing codebase: `src/lib/store/cart-store.ts` (clearCart exists), `src/app/cart/cart-page-client.tsx` (hydration guard pattern), `src/components/cart-item.tsx` (thumbnail pattern), `src/lib/load-cards.ts` (card data loading), `src/lib/types.ts` (Card interface)
- `.planning/phases/05-checkout-and-deploy/05-UI-SPEC.md` -- Complete visual/interaction/copy contract

### Secondary (MEDIUM confidence)
- [Resend Node.js SDK docs](https://resend.com/docs/send-with-nodejs) -- SDK initialization, `emails.send()` API, parameters (camelCase: replyTo, scheduledAt)
- [Resend LLM reference](https://resend.com/docs/llms-full.txt) -- Full API reference, batch.send() details, idempotency keys
- [Resend API reference](https://resend.com/docs/api-reference/emails/send-email) -- All send parameters, response structure
- [Resend account quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) -- Free tier: 100/day, 3,000/month, 5 req/sec, bounce rate < 4%
- npm registry: `resend@6.10.0` verified via `npm view resend version` on 2026-04-03

### Tertiary (LOW confidence)
- None -- all findings verified against primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Single new dependency (resend@6.10.0), version verified against npm registry, all other deps already installed
- Architecture: HIGH -- Follows exact patterns established across 4 prior phases; notification pipeline per locked D-14; UI-SPEC provides complete visual contract
- Pitfalls: HIGH -- Based on concrete project code analysis, official Next.js 16 docs, and Resend official documentation
- Email integration: HIGH -- Resend SDK is simple and well-documented; free tier limits verified

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable stack, no fast-moving dependencies)
