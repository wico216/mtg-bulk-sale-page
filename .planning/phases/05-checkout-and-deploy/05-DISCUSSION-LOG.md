# Phase 5: Checkout and Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 05-checkout-and-deploy
**Areas discussed:** Checkout page layout, Email content & format, Post-submit experience, Deployment setup

---

## Checkout Page Layout

### Layout structure

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked | Order summary on top, form below, single column. Mobile-first. | |
| Side-by-side on desktop | Form left, summary right. Stacks on mobile. | |
| You decide | Claude picks best layout. | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on arrangement.

### Order summary style

| Option | Description | Selected |
|--------|-------------|----------|
| Text only | Name, quantity, price per line. Clean and compact. | |
| Small thumbnails | Tiny card images next to each line item. | ✓ |
| You decide | Claude picks based on layout. | |

**User's choice:** Small thumbnails
**Notes:** None.

### Form fields

| Option | Description | Selected |
|--------|-------------|----------|
| Name + email only | Minimal, matches no-friction philosophy. | |
| Add optional message field | Short text area for notes like "I'll pick these up Friday". | ✓ |
| You decide | Claude decides. | |

**User's choice:** Add optional message field
**Notes:** None.

### Cart editing on checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Back to cart link only | Read-only summary, "Edit cart" link to /cart. | ✓ |
| Inline quantity editing | +/- adjustments on checkout page. | |
| You decide | Claude picks simpler approach. | |

**User's choice:** Back to cart link only
**Notes:** None.

---

## Email Content & Format

### Email style

| Option | Description | Selected |
|--------|-------------|----------|
| Simple HTML | Clean styled with order table, light branding. | ✓ |
| Plain text | No styling, maximum compatibility. | |
| Rich HTML with card images | Styled with inline card thumbnails. | |

**User's choice:** Simple HTML
**Notes:** User clarified that a thermal printer will be added in the future to print orders. Email is a placeholder notification channel — order data should be separated from delivery method.

### Seller vs buyer detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Same content, different tone | Both get full order. Seller: neutral header. Buyer: friendly + pay-in-person. | ✓ |
| Seller gets more detail | Seller gets contact info + set/condition. Buyer gets simpler confirmation. | |
| You decide | Claude picks. | |

**User's choice:** Same content, different tone
**Notes:** None.

### Seller email destination

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable | SELLER_EMAIL in .env. Simple, secure. | ✓ |
| Hardcoded in code | Email in source code. | |
| You decide | Claude picks. | |

**User's choice:** Environment variable
**Notes:** None.

---

## Post-Submit Experience

### Confirmation page content

| Option | Description | Selected |
|--------|-------------|----------|
| Simple success + summary | Checkmark, summary, pay-in-person note, "Browse more" link. | ✓ |
| Detailed receipt | Full itemized receipt with every card. | |
| You decide | Claude picks. | |

**User's choice:** Simple success + summary
**Notes:** None.

### Cart after order

| Option | Description | Selected |
|--------|-------------|----------|
| Clear cart automatically | Cart empties on success. Prevents re-orders. | ✓ |
| Keep cart contents | Cart stays as-is. | |
| You decide | Claude picks. | |

**User's choice:** Clear cart automatically
**Notes:** None.

### Error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Error message + retry | Show error with retry button. Cart/form data preserved. | ✓ |
| Silent fallback | Show success anyway, log error server-side. | |
| You decide | Claude picks. | |

**User's choice:** Error message + retry
**Notes:** None.

---

## Deployment Setup

### Hosting platform

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel | Free tier, auto-deploys, serverless functions. | ✓ |
| Other host | Netlify, Railway, etc. | |
| You decide | Claude picks. | |

**User's choice:** Vercel
**Notes:** None.

### Domain

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel default URL | Auto-generated .vercel.app URL. | ✓ |
| Custom domain | Point owned domain at Vercel. | |
| Decide later | Deploy with default, add custom later. | |

**User's choice:** Vercel default URL
**Notes:** None.

### SSG to hybrid

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add API route | /api/checkout serverless function. Rest stays static. | ✓ |
| Stay fully static | Client-side email service instead. | |
| You decide | Claude picks. | |

**User's choice:** Yes, add API route
**Notes:** None.

---

## Claude's Discretion

- Checkout page layout arrangement (stacked vs side-by-side responsive)
- Email HTML template styling details
- Confirmation page visual design
- Vercel project configuration specifics

## Deferred Ideas

- Thermal printer integration for order receipts (future phase — requires hardware setup)
- Custom domain configuration (can be added later without code changes)
