---
phase: 05-checkout-and-deploy
verified: 2026-04-03T13:00:00Z
status: human_needed
score: 12/13 must-haves verified
human_verification:
  - test: "Verify deployment — push to Vercel with env vars RESEND_API_KEY and SELLER_EMAIL set in the dashboard"
    expected: "Production URL loads /checkout, /api/checkout, and /confirmation without errors; emails deliver from production"
    why_human: "Vercel deployment requires user account credentials and env var configuration in the Vercel dashboard; cannot be automated"
---

# Phase 5: Checkout and Deploy — Verification Report

**Phase Goal:** Users can submit orders via email and the store is live on the internet
**Verified:** 2026-04-03
**Status:** human_needed (all code verified; one item awaiting human action: Vercel deploy)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can enter their name and email on the checkout page without creating an account | VERIFIED | `checkout-client.tsx` has name/email/message form fields with `aria-required`, HTML5 `required`, and server-side validation in `route.ts` (emailRegex, buyerName check) |
| 2 | User sees a full order summary (items, quantities, prices, total) before confirming | VERIFIED | `OrderSummary` component renders item rows with name, setName, quantity badge, line total, and a total row. Wired to `checkout-client.tsx` via `orderSummaryItems` useMemo. `editCartLink={true}` shows "Edit cart" link back to /cart |
| 3 | After submission, the seller receives an email with complete order details | VERIFIED | `notifications.ts` sends seller email first (priority); `seller-email.ts` renders buyer name, email, optional message, item table with set/collector info, and total. `route.ts` calls `notifyOrder` and returns 500 if `sellerEmailSent=false`. Human confirmed email delivery in Plan 03 |
| 4 | After submission, the buyer receives a confirmation email with their order summary | VERIFIED | `notifications.ts` sends buyer email second (best-effort, in try/catch); `buyer-email.ts` renders order table, total, and pay-in-person note. `replyTo` set to `SELLER_EMAIL` per D-16. Human confirmed email delivery |
| 5 | User sees a confirmation page after checkout with a clear "pay in person" note | VERIFIED | `confirmation-client.tsx` shows checkmark SVG, "Order placed!" heading, count/total summary, order ref, "Confirmation sent to" email note, full order list from sessionStorage, "No payment needed now — just pay when you pick up." note, and "Browse more cards" link |
| 6 | Application is deployed and accessible on the internet | HUMAN NEEDED | Code is production-ready (hybrid build confirmed, no `output: "export"` in next.config.ts), pushed to GitHub, but user has not yet deployed to Vercel |

**Score: 5/6 truths verified (automated); 6th truth pending human action (deploy)**

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/types.ts` | VERIFIED | Contains `OrderItem`, `OrderData`, `CheckoutRequest`, `CheckoutResponse`. `OrderItem` extended beyond plan spec with `setCode`, `collectorNumber`, `condition` (user-requested in Plan 03) |
| `src/lib/order.ts` | VERIFIED | Exports `escapeHtml`, `generateOrderRef`, `buildOrderData`. All three functions substantive. `buildOrderData` handles extended `OrderItem` fields |
| `src/lib/email/seller-email.ts` | VERIFIED | Exports `buildSellerEmailHtml`. Contains "New order from", escapeHtml calls on all user input, item table with set/collector/condition, total line |
| `src/lib/email/buyer-email.ts` | VERIFIED | Exports `buildBuyerEmailHtml`. Contains "Thanks for your order", pay-in-person note, item table, total line |
| `src/lib/notifications.ts` | VERIFIED | Exports `notifyOrder`. Imports Resend, calls `buildSellerEmailHtml` and `buildBuyerEmailHtml`. Seller-first pattern, buyer in try/catch. `console.log("[ORDER]")` for D-18. `replyTo` for D-16 |
| `src/app/api/checkout/route.ts` | VERIFIED | Exports `POST`. Uses `NextRequest` / `Response.json`. Validates name, email (emailRegex), items, env vars, stock. Calls `buildOrderData` then `notifyOrder`. Returns `CheckoutResponse` on success |
| `.env.local.example` | VERIFIED | Contains `RESEND_API_KEY` and `SELLER_EMAIL` with documentation |

### Plan 02 Artifacts

| Artifact | Min Lines | Actual | Status | Details |
|----------|-----------|--------|--------|---------|
| `src/components/order-summary.tsx` | 30 | 96 | VERIFIED | Exports `default` and `OrderSummaryItem` interface. Renders item rows with 36px thumbnails (width={36}), quantity badge, line total, total row, optional Edit cart link |
| `src/app/checkout/checkout-client.tsx` | 80 | 306 | VERIFIED | Exports `default`. Full hydration guard, empty cart guard, form with 3 fields, submit logic, error display, sticky mobile bar |
| `src/app/checkout/page.tsx` | — | 21 | VERIFIED | Exports `default` and `metadata`. Loads card data via `loadCardData`, renders `Header` + `CheckoutClient` |
| `src/app/confirmation/confirmation-client.tsx` | 40 | 130 | VERIFIED | Exports `default`. Reads URL params via `useSearchParams`, reads `sessionStorage.getItem("lastOrder")`, renders all confirmation elements |
| `src/app/confirmation/page.tsx` | — | 28 | VERIFIED | Exports `default` and `metadata`. Wraps `ConfirmationClient` in `Suspense` boundary (required for `useSearchParams`) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | `notifications.ts` | `notifyOrder(orderData)` | WIRED | Line 59: `const notifyResult = await notifyOrder(orderData)` |
| `notifications.ts` | `seller-email.ts` | `buildSellerEmailHtml(order)` | WIRED | Line 30: `html: buildSellerEmailHtml(order)` |
| `notifications.ts` | `buyer-email.ts` | `buildBuyerEmailHtml(order)` | WIRED | Line 43: `html: buildBuyerEmailHtml(order)` |
| `route.ts` | `order.ts` | `buildOrderData(body, cards)` | WIRED | Line 56: `const orderData = buildOrderData(body, cards)` |
| `checkout-client.tsx` | `/api/checkout` | `fetch POST in handleSubmit` | WIRED | Line 79: `fetch("/api/checkout", { method: "POST", ... })` |
| `checkout-client.tsx` | `cart-store.ts` | `useCartStore` | WIRED | Lines 19-21: `useCartStore((s) => s.items)`, `s.clearCart`, `s.totalItems()` |
| `checkout-client.tsx` | `/confirmation` | `router.push after success` | WIRED | Line 104: `router.push(\`/confirmation?ref=...\`)` |
| `confirmation-client.tsx` | `sessionStorage` | reads `lastOrder` | WIRED | Line 22: `sessionStorage.getItem("lastOrder")` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `checkout-client.tsx` | `orderSummaryItems` | `useCartStore` items + `cards` prop from server | Real data: cart Zustand store populated from user interactions; `cards` loaded from `loadCardData()` (cards.json) | FLOWING |
| `confirmation-client.tsx` | `fullOrder` / URL params | `sessionStorage.getItem("lastOrder")` set by checkout-client + URL search params | Real data: populated from API response before navigation | FLOWING |
| `seller-email.ts` | `order` parameter | `buildOrderData(body, cards)` in route.ts | Real data: derived from POST body + live card data | FLOWING |
| `buyer-email.ts` | `order` parameter | Same as seller | Real data | FLOWING |

Note: `confirmation-client.tsx` sets `imageUrl: null` for all order summary items (line 63) because `OrderData.items` does not carry image URLs. This is a documented limitation from 05-02-SUMMARY.md ("OrderData items don't carry imageUrl, so confirmation order summary shows placeholder thumbnails"). Images display as "No img" placeholder on the confirmation page. This is acceptable UX (order was placed, images are cosmetic) and was a deliberate design choice.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| API route file exists and exports POST | `grep "export async function POST" src/app/api/checkout/route.ts` | Found at line 7 | PASS |
| Resend dependency installed | `grep '"resend"' package.json` | `"resend": "^6.10.0"` | PASS |
| next.config.ts has no `output: "export"` | grep check | Not present — only `images.remotePatterns` config | PASS |
| Route uses Web API (not legacy Next.js API) | grep for `Response.json` | Found at lines 13, 18, 21, 27, 31, 51, 64, 74 | PASS |
| Resend live invocation | Cannot test without server + RESEND_API_KEY | — | SKIP (needs running server + env vars) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHKT-01 | 05-01, 05-02, 05-03 | User can enter name and email to place an order (no account required) | SATISFIED | `checkout-client.tsx` form with name/email/message fields; server validates name (non-empty string) and email (regex) |
| CHKT-02 | 05-02, 05-03 | User sees order review/summary before final submission | SATISFIED | `OrderSummary` component rendered above form in checkout page; shows items, quantities, prices, total, and Edit cart link |
| CHKT-03 | 05-01, 05-03 | Checkout sends order details email to seller | SATISFIED | `notifications.ts` sends seller email first (critical path); `seller-email.ts` includes full order table, buyer contact, set/collector details; human-confirmed delivery |
| CHKT-04 | 05-01, 05-03 | Checkout sends confirmation email to buyer | SATISFIED | `notifications.ts` sends buyer email (best-effort); `buyer-email.ts` includes order table, total, pay-in-person note; `replyTo` set to seller email; human-confirmed delivery |
| CHKT-05 | 05-02, 05-03 | User sees confirmation page after successful order with "pay in person" note | SATISFIED | `confirmation-client.tsx` renders "Order placed!", count/total summary, order ref, email note, full order list, "No payment needed now — just pay when you pick up." note, and Browse more cards link |

All 5 CHKT requirements satisfied.

No orphaned requirements: REQUIREMENTS.md traceability table maps only CHKT-01 through CHKT-05 to Phase 5, and all 5 are accounted for across Plans 01, 02, and 03.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `confirmation-client.tsx` | 63 | `imageUrl: null` hardcoded for order summary items | Info | Confirmation page shows "No img" placeholders instead of card images. Documented and intentional — `OrderData` does not carry `imageUrl`. Not a stub (the component renders real data for all other fields) |

No blockers or warnings found. The `imageUrl: null` is a documented design decision, not a stub — all other data fields (name, setName, price, quantity) flow correctly from the API response.

---

## Deviation: Layout Order Changed (D-05)

Plan 02 specified form-first on mobile (D-05 action-first pattern). After human testing in Plan 03, the user requested summary-first layout. This was applied in commit `d829c70` and documented in 05-03-SUMMARY.md.

The current implementation renders `OrderSummary` first (line 170, `md:col-span-3`) and the form second (line 180, `md:col-span-3`). The sticky mobile submit bar (D-06) remains fully implemented and is always visible at the screen bottom. The grid approach changed from 2-column (form left, summary right) to single full-width column stacked vertically.

This deviation is user-approved and does not affect any CHKT requirement. It is not a gap.

---

## Human Verification Required

### 1. Deploy to Vercel

**Test:** Run `vercel` CLI or connect the GitHub repo to the Vercel dashboard. Set environment variables `RESEND_API_KEY` and `SELLER_EMAIL` in the Vercel project settings.
**Expected:** Production URL loads `/checkout`, `/api/checkout`, and `/confirmation` without errors. Full checkout flow (add cards → submit → emails delivered → confirmation page) works identically to local testing.
**Why human:** Deployment requires the user's Vercel account credentials and cannot be automated. The code and build are verified ready. The user confirmed the flow works locally and emails deliver.

---

## Gaps Summary

No gaps found in the codebase. All 5 CHKT requirements are implemented and verified:

- Backend pipeline (order types, email templates, notification dispatcher, API route) is complete and wired.
- Frontend flow (checkout page with form + order summary, confirmation page with receipt) is complete and wired.
- Build is hybrid-mode compatible (no `output: "export"` in next.config.ts).
- Resend SDK installed and integrated.
- Human-confirmed: full checkout flow tested locally, seller and buyer emails received.

The only outstanding item is Vercel deployment (CHKT-05 partial: "store is live on the internet"), which is a human action, not a code gap. The phase goal "Users can submit orders via email and the store is live on the internet" is half-achieved programmatically (submit orders via email: DONE) and pending the human deployment step (live on the internet: NOT YET).

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
