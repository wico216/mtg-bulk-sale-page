# Deck Check / Spellbook Matcher Discovery

## Project

Deck Check / Spellbook Matcher

## Goal

Give customers a public `/deck-check` flow where they paste a deck link or exported decklist and Spellbook tells them which public-sale cards Wiko has, including exact printings and alternate printings of the same card. Customers can add selected matches or all available matches to the existing satchel for normal checkout review.

## Non-goals for first slice

- No account system, reservations, payments, or checkout semantics changes.
- No database migration or persistent demand tracking yet.
- No public exposure of binder/W-binder data.
- No arbitrary URL fetching; only known deck hosts are allowed.
- No guarantee that ManaBox public links are universally fetchable; first slice accepts ManaBox exports/pasted lists and best-effort known-link parsing.

## Safety constraints

- Use existing public storefront data loader so W binders stay excluded by the public binder scope.
- Cart additions must use the exact public aggregated `card.id` already accepted by checkout.
- External URL import must be allowlisted to avoid SSRF.
- Scryfall requests must use the existing required Accept/User-Agent headers and degrade gracefully.

## Current architecture

- Next app router under `src/app`.
- Public inventory source: `loadStorefrontData()` → `getCardsAggregated()` → `toPublicCards()` strips admin-only `binders`.
- Cart: `useCartStore` stores public aggregated card IDs in localStorage and checkout already reconciles those IDs.
- Finish variants: public card grid groups foil/nonfoil of same exact printing, but cart still receives exact selected variant IDs.
- E2E fixture mode: `E2E_FIXTURES=1` returns fake public cards without database/Scryfall.

## First shippable slice

1. New public `/deck-check` route and header link.
2. A client form that accepts a deck URL or exported/pasted list.
3. Server route `POST /api/deck-check` that:
   - recognizes Moxfield, Archidekt, and ManaBox hosts;
   - parses raw deck text fallback;
   - loads public Spellbook inventory only;
   - resolves Scryfall/oracle IDs where practical;
   - returns exact / alternate / missing rows plus recommended card options.
4. Client result list with option selector, include/exclude checkbox, row add, and add-all-to-satchel.
5. Tests for parsing/matching/cart behavior and fixture E2E.

## Success proof

- Focused unit tests cover parser and exact/alternate/missing matching.
- Component test covers add-all to satchel.
- Playwright fixture test proves `/deck-check` accepts a decklist and adds available cards.
- Typecheck, lint, build, and focused tests pass before PR.
