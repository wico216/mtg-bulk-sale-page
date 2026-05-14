---
quick_id: 260514-gxr
slug: github-issue-16-verified-domain-email-co
status: in_progress
created: 2026-05-14
issue: 16
---

# GitHub Issue 16 — Email Confirmation Not Received

## Goal

Stop telling buyers that an email confirmation was sent when the email pipeline did not actually send one, and send order emails from the verified `wikospellbinder.com` Resend domain.

## Plan

1. Update order notification sends to use the verified sender identity `orders@wikospellbinder.com`, keeping buyer replies routed through `SELLER_EMAIL`.
2. Preserve the checkout API notification result in the confirmation-page session payload.
3. Update the confirmation page copy so it only says "Confirmation sent" when `buyerEmailSent` is true, with a neutral/failure message otherwise.
4. Add focused tests for notification sender/reply-to behavior and confirmation-page email status copy.
5. Run focused tests, TypeScript, lint/build checks, then update GSD state and close issue #16.

## Acceptance

- Seller and buyer emails use a sender on the verified Resend domain.
- Buyer email `replyTo` remains `SELLER_EMAIL`, allowing replies to land in the seller's inbox.
- Confirmation page does not promise an email if the buyer email was not sent.
- Existing checkout success behavior remains intact.
