# Commander Scryfall picker

Date: 2026-06-20
Branch: `feat/commander-scryfall-picker`

## Goal

Improve `/admin/commanders` so Wiko can search for a commander by name, select a Scryfall result from a dropdown, and have Spellbook auto-fill the commander name, card art, and EDHREC URL.

## Non-goals

- No public storefront changes.
- No checkout/cart/import/ManaBox behavior changes.
- No schema migration; reuse existing `commander_links` table.
- No production release in this slice unless Wiko asks to push/merge.

## Current architecture

- Admin page: `src/app/admin/commanders/page.tsx`
- Client manager: `src/app/admin/commanders/_components/commander-links-manager.tsx`
- Existing admin API: `src/app/api/admin/commander-links/route.ts`
- DB/helpers: `src/db/commander-links.ts`
- Shared types: `src/lib/commander-links-types.ts`
- Mobile/admin E2E coverage: `e2e/admin-responsive.spec.ts`

## Implementation shape

1. Add a typed `CommanderSearchResult` shared type.
2. Add Scryfall commander search helper using `/cards/search?q=is:commander <query>` with required Scryfall headers.
3. Add EDHREC slug builder from the canonical Scryfall card name.
4. Add admin-only `GET /api/admin/commander-search?q=...` with requireAdmin and rate limiting.
5. Update the client form into a search combobox/dropdown.
6. Keep EDHREC URL and image URL as editable override fields after auto-fill.
7. Let POST `/api/admin/commander-links` auto-generate EDHREC URL from name when omitted.

## Verification plan

- Helper unit tests for query normalization, EDHREC slugging, Scryfall search mapping, and headers.
- API tests for search auth, short query behavior, invalid query, and happy path.
- Existing create route tests plus omitted-EDHREC auto-generation test.
- Focused mobile/admin Playwright test for selecting a commander, auto-filled URL/image, POST payload, and saved card rendering.
- Broader gates: typecheck, lint, full unit suite, build.

## Risks

- EDHREC slug rules may have special cases for partner pairs or unusual commander pages; keep manual override field visible.
- Scryfall search is external; route returns empty results on Scryfall miss/failure and remains admin-only.
- No migration rollback needed because this slice changes behavior only.
