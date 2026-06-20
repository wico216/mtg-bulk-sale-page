# Commander EDHREC Links

## Scope

Add a small admin-only area where Wiko can save Commander shortcuts and click the commander image to open that commander's EDHREC page.

## Goal

- Admin path: `/admin/commanders`
- Wiko can add commander name + EDHREC URL.
- Image URL is optional; if omitted, the server tries to resolve commander art from Scryfall by name.
- Saved commanders render as image cards.
- Clicking a commander image opens the saved EDHREC URL in a new tab.

## Non-goals

- No customer-facing surface.
- No EDHREC scraping or automated new-card notifications.
- No decklist storage.
- No cart/checkout changes.

## Safety / privacy

- Admin-only route and API.
- EDHREC URLs are validated to `edhrec.com`.
- Optional image URLs must be http(s).
- Scryfall auto-image lookup is best-effort only and stores no secrets.

## Verification

- Unit tests for input normalization.
- API route tests for admin enforcement and create/list behavior.
- Mobile Playwright coverage for `/admin/commanders` fixture page.
- `npm run build` before release.
