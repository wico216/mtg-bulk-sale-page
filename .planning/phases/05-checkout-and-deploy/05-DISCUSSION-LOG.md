# Phase 5: Checkout and Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02 (initial), 2026-04-03 (updated)
**Phase:** 05-checkout-and-deploy
**Areas discussed:** Checkout page layout, Email content & format, Post-submit experience, Deployment setup, Order Validation, Email Delivery, Mobile Checkout UX, Deploy Pipeline, Loading & Submit States, Confirmation Page Details

---

## Session 1 (2026-04-02)

### Checkout Page Layout

#### Layout structure

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked | Order summary on top, form below, single column. Mobile-first. | |
| Side-by-side on desktop | Form left, summary right. Stacks on mobile. | |
| You decide | Claude picks best layout. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on arrangement.

#### Order summary style

| Option | Description | Selected |
|--------|-------------|----------|
| Text only | Name, quantity, price per line. Clean and compact. | |
| Small thumbnails | Tiny card images next to each line item. | ✓ |
| You decide | Claude picks based on layout. | |

**User's choice:** Small thumbnails

#### Form fields

| Option | Description | Selected |
|--------|-------------|----------|
| Name + email only | Minimal, matches no-friction philosophy. | |
| Add optional message field | Short text area for notes like "I'll pick these up Friday". | ✓ |
| You decide | Claude decides. | |

**User's choice:** Add optional message field

#### Cart editing on checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Back to cart link only | Read-only summary, "Edit cart" link to /cart. | ✓ |
| Inline quantity editing | +/- adjustments on checkout page. | |
| You decide | Claude picks simpler approach. | |

**User's choice:** Back to cart link only

---

### Email Content & Format

#### Email style

| Option | Description | Selected |
|--------|-------------|----------|
| Simple HTML | Clean styled with order table, light branding. | ✓ |
| Plain text | No styling, maximum compatibility. | |
| Rich HTML with card images | Styled with inline card thumbnails. | |

**User's choice:** Simple HTML
**Notes:** Thermal printer future — order data separated from delivery method.

#### Seller vs buyer detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Same content, different tone | Both get full order. Seller: neutral. Buyer: friendly + pay-in-person. | ✓ |
| Seller gets more detail | Seller gets contact info + set/condition. Buyer gets simpler. | |
| You decide | Claude picks. | |

**User's choice:** Same content, different tone

#### Seller email destination

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable | SELLER_EMAIL in .env. Simple, secure. | ✓ |
| Hardcoded in code | Email in source code. | |
| You decide | Claude picks. | |

**User's choice:** Environment variable

---

### Post-Submit Experience

#### Confirmation page content

| Option | Description | Selected |
|--------|-------------|----------|
| Simple success + summary | Checkmark, summary, pay-in-person note, "Browse more" link. | ✓ |
| Detailed receipt | Full itemized receipt with every card. | |
| You decide | Claude picks. | |

**User's choice:** Simple success + summary

#### Cart after order

| Option | Description | Selected |
|--------|-------------|----------|
| Clear cart automatically | Cart empties on success. Prevents re-orders. | ✓ |
| Keep cart contents | Cart stays as-is. | |
| You decide | Claude picks. | |

**User's choice:** Clear cart automatically

#### Error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Error message + retry | Show error with retry button. Cart/form data preserved. | ✓ |
| Silent fallback | Show success anyway, log error server-side. | |
| You decide | Claude picks. | |

**User's choice:** Error message + retry

---

### Deployment Setup

#### Hosting platform

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel | Free tier, auto-deploys, serverless functions. | ✓ |
| Other host | Netlify, Railway, etc. | |

**User's choice:** Vercel

#### Domain

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel default URL | Auto-generated .vercel.app URL. | ✓ |
| Custom domain | Point owned domain at Vercel. | |

**User's choice:** Vercel default URL

#### SSG to hybrid

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add API route | /api/checkout serverless function. Rest stays static. | ✓ |
| Stay fully static | Client-side email service instead. | |

**User's choice:** Yes, add API route

---

## Session 2 (2026-04-03)

### Order Validation

#### Empty cart handling

| Option | Description | Selected |
|--------|-------------|----------|
| Block checkout | Disable/hide checkout button when cart is empty | ✓ |
| Show warning on page | Let them navigate to /checkout but show a message | |
| You decide | Claude picks | |

**User's choice:** Block checkout

#### Stale items on submit

| Option | Description | Selected |
|--------|-------------|----------|
| Validate on submit | API checks stock, returns errors for out-of-stock items | ✓ |
| Soft warning only | Submit anyway, seller handles issues manually | |
| You decide | Claude picks | |

**User's choice:** Validate on submit

#### Email validation scope

| Option | Description | Selected |
|--------|-------------|----------|
| Client + server | HTML5 validation + server-side regex check | ✓ |
| Client only | HTML5 email input type only | |
| You decide | Claude picks | |

**User's choice:** Client + server

#### Rate limiting

| Option | Description | Selected |
|--------|-------------|----------|
| No rate limiting | Friend circle only, not public-facing enough | ✓ |
| Basic rate limit | Simple IP-based limit via Vercel edge config | |
| You decide | Claude picks | |

**User's choice:** No rate limiting

---

### Email Delivery

#### From address

| Option | Description | Selected |
|--------|-------------|----------|
| Resend default domain | onboarding@resend.dev — no custom domain needed | ✓ |
| Custom domain | DNS records for custom sender | |
| You decide | Claude picks what works with free tier | |

**User's choice:** Resend default domain

#### Reply-to behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, seller email | Buyer hits reply → goes to seller | ✓ |
| No reply-to | Default noreply behavior | |
| You decide | Claude picks | |

**User's choice:** Seller email

#### Partial email failure

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as success | Seller got notified — log failure, show success | ✓ |
| Show partial error | Tell buyer confirmation may not have sent | |
| Treat as full failure | Both must succeed or whole submission fails | |

**User's choice:** Treat as success

#### Order storage

| Option | Description | Selected |
|--------|-------------|----------|
| Email only | No database — emails are the records | |
| Log to file/JSON | Write orders to log for backup | ✓ |
| You decide | Claude picks simplest | |

**User's choice:** Log to file/JSON
**Follow-up:** Clarified to console.log → Vercel function logs (serverless filesystem is ephemeral)

| Option | Description | Selected |
|--------|-------------|----------|
| Console/Vercel logs | console.log order JSON — visible in Vercel logs | ✓ |
| JSON file on disk | Append to orders.json — won't persist on Vercel | |
| External service | Vercel KV, Upstash, or webhook | |

**User's choice:** Console/Vercel logs

---

### Mobile Checkout UX

#### Mobile layout

| Option | Description | Selected |
|--------|-------------|----------|
| Form first, summary below | Action-first — form on top, order summary underneath | ✓ |
| Summary first, form below | Review items first, then scroll to form | |
| Collapsible summary | Collapsed by default, expandable | |

**User's choice:** Form first, summary below

#### Sticky submit button

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, sticky bottom | Fixed at bottom with total — always visible | ✓ |
| Inline at end of form | Regular button after fields | |
| You decide | Claude picks | |

**User's choice:** Sticky bottom

#### Thumbnails on mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Small thumbnails | Tiny card images (32-40px) alongside name/qty/price | ✓ |
| No thumbnails on mobile | Text-only list to save space | |
| You decide | Claude picks | |

**User's choice:** Small thumbnails

---

### Deploy Pipeline

#### Data build strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time generation | CSV + Scryfall enrichment during next build | ✓ |
| Committed JSON | Run enrichment locally, commit JSON | |
| You decide | Claude picks what fits existing pipeline | |

**User's choice:** Build-time generation

#### Inventory update workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Re-deploy on Vercel | Push updated CSV → Vercel auto-rebuilds | ✓ |
| Manual rebuild trigger | Vercel dashboard 'Redeploy' button | |
| You decide | Claude picks simplest | |

**User's choice:** Re-deploy on Vercel

#### Monitoring

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel built-in only | Free analytics and function logs | ✓ |
| Add Sentry or similar | Error tracking for checkout API | |
| You decide | Claude picks simplest | |

**User's choice:** Vercel built-in only

---

### Loading & Submit States

#### Submit button state

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner + disabled | Spinner icon, "Placing order...", disabled | ✓ |
| Progress text only | Text cycles through steps — no spinner | |
| You decide | Claude picks | |

**User's choice:** Spinner + disabled

#### Transition to confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect after success | router.push('/confirmation') with order details | ✓ |
| Inline confirmation | Replace form with confirmation on same page | |
| You decide | Claude picks | |

**User's choice:** Redirect after success

#### Back navigation from confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Empty cart + catalog | Cart cleared — back shows empty or redirects to catalog | ✓ |
| Checkout form again | Form visible but cart empty | |
| You decide | Claude picks least confusing | |

**User's choice:** Empty cart + catalog

---

### Confirmation Page Details

#### Order reference number

| Option | Description | Selected |
|--------|-------------|----------|
| Simple timestamp ID | Auto-generated like 'ORD-20260403-1234' | ✓ |
| No order number | Just confirmation and emails | |
| You decide | Claude picks simplest | |

**User's choice:** Simple timestamp ID

#### Summary depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full summary | Complete item list with thumbnails, quantities, prices, total | ✓ |
| Brief confirmation | Just item count + total + message | |
| You decide | Claude picks | |

**User's choice:** Full summary

#### Available actions

| Option | Description | Selected |
|--------|-------------|----------|
| Browse more cards | Single link back to catalog | ✓ |
| Multiple actions | Browse + share + print receipt | |
| You decide | Claude picks what fits simple store | |

**User's choice:** Browse more cards

---

## Claude's Discretion

- Checkout page layout arrangement (stacked vs side-by-side responsive)
- Email HTML template styling details (spacing, colors, typography)
- Confirmation page visual design
- Vercel project configuration specifics
- Order reference number format details

## Deferred Ideas

- Thermal printer integration for order receipts (future phase — requires hardware setup)
- Custom domain configuration (can be added later without code changes)
- Custom sender email domain for Resend (requires DNS setup)
- Sentry/error tracking (add if checkout errors become a problem)
