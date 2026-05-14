---
quick_id: 260514-gxr
slug: github-issue-16-verified-domain-email-co
status: complete
completed: 2026-05-14
commit: dc3d624
issue: 16
---

# Summary

GitHub issue #16 is fixed. Order emails now default to the verified sender identity `Viki MTG Store <orders@wikospellbinder.com>`, while buyer replies still use `SELLER_EMAIL` as `replyTo`.

The checkout client now stores the API notification result with the confirmation payload. The confirmation page only shows `Confirmation sent to ...` when `notification.buyerEmailSent` is true; otherwise it shows a save-the-order-number message instead of promising delivery.

## Files Changed

- `src/lib/notifications.ts`
- `src/app/checkout/checkout-client.tsx`
- `src/app/confirmation/confirmation-client.tsx`
- `src/lib/__tests__/notifications.test.ts`
- `src/app/confirmation/__tests__/confirmation-client.test.tsx`
- `.env.local.example`
- `README.md`

## Verification

- `npx vitest run src/app/confirmation/__tests__/confirmation-client.test.tsx src/lib/__tests__/notifications.test.ts` — passed
- `npx tsc --noEmit` — passed
- `npx eslint src/lib/notifications.ts src/app/checkout/checkout-client.tsx src/app/confirmation/confirmation-client.tsx src/lib/__tests__/notifications.test.ts src/app/confirmation/__tests__/confirmation-client.test.tsx` — passed
- `npm test` — passed, 499 tests / 2 skipped
- `npm run build` — passed with existing `src/lib/cache.ts` broad-pattern warnings
- `git diff --check` — passed

## Notes

Full-project `npm run lint` still fails on pre-existing lint debt, including untracked `.claude/` GSD files and older React lint findings outside this quick task. The touched files pass targeted lint.
