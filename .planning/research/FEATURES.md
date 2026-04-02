# Feature Landscape

**Domain:** MTG bulk card store for friends
**Researched:** 2026-04-02

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Card browsing with images | This is a card store -- seeing the cards is fundamental | Medium | Images from Scryfall API, resolved at build time |
| Search by card name | Friends know what they want, need to find it fast | Low | Simple string matching on card name field |
| Filter by mana color | Core MTG taxonomy -- players think in colors (WUBRG) | Low | Toggle buttons, multi-select |
| Shopping cart | Must collect multiple cards before ordering | Medium | Zustand + localStorage persistence |
| Checkout with email confirmation | Friends need to submit their order | Medium | Form: name + email, sends to seller + buyer |
| Card condition display | NM vs HP matters for pricing and expectations | Low | Text badge from CSV data |
| Card quantity display | Friends need to know if cards are available | Low | Show "x available" from CSV quantity |
| Card price display | Friends need to know what they owe | Low | Price from CSV (seller sets prices in Manabox) |
| Set name display | Players identify cards by name + set | Low | From CSV and/or Scryfall data |
| Confirmation page | Friend needs to know order went through | Low | Simple order summary with "pay in person" note |
| Mobile-responsive layout | Friends will browse on phones | Low | Tailwind responsive grid handles this by default |

## Differentiators

Features that improve the experience but are not required for launch.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Visual WUBRG mana icons | Feels like a real MTG experience | Low | SVG mana symbols for filter buttons |
| Set/expansion filter | Browse by set ("show me all Dominaria cards") | Low | Dropdown from CSV set data |
| Rarity filter | Find hidden gems in bulk | Low | Color-coded: black/silver/gold/orange per MTG convention |
| Sort options (price, name, color) | Helps find deals or browse alphabetically | Low | Client-side sort on loaded data |
| Card detail modal | Tap card to see oracle text, full metadata | Medium | Pull from Scryfall data resolved at build time |
| Card count badge on cart icon | Visual feedback of cart contents | Low | Number badge in header |
| Bulk add to cart | "Add 4x" instead of clicking four times | Low | Quantity selector on add-to-cart |
| Inventory freshness indicator | "Last updated: March 28" builds trust | Low | Store CSV upload timestamp |
| Order summary review step | Shows exact order before final submit | Low | Part of checkout flow |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User accounts / login | Auth complexity for zero benefit in a friend circle | Checkout form with name + email fields |
| Payment processing | Friends pay in person. Stripe adds complexity, fees, legal obligations | Display total, "pay in person" note |
| Admin dashboard | Over-engineering. CSV re-upload and rebuild is sufficient | Re-upload CSV, trigger Vercel rebuild |
| Real-time inventory sync | No database means no real-time sync. Acceptable for friend circle | Manual CSV re-upload, show "last updated" date |
| Wishlists / saved items | Cart with localStorage persistence is sufficient | Cart persists across sessions already |
| Reviews / ratings | Friend store, not a marketplace | Talk in person |
| Card price comparison | Seller sets prices manually. Market data adds scope | Simple price from CSV |
| Multi-seller support | This is YOUR store, not TCGPlayer | Single seller, single CSV |
| Deck builder integration | Separate application. Massive scope creep | Link to Moxfield/Archidekt |
| Shipping / logistics | Friends pick up in person | Display pickup instructions |
| Advanced search syntax | Scryfall-style queries are complex to implement | Simple name search + visual filters |
| Internationalization | Friend circle shares a language | Build in one language |

## Feature Dependencies

```
CSV Import --> Card Data Model --> Card Display (images from Scryfall)
Card Display --> Search/Filter (needs cards to filter)
Card Display --> Shopping Cart (needs cards to add)
Shopping Cart --> Checkout Form --> Email Sending --> Confirmation Page
```

All features depend on the CSV import and card data model being established first.

## MVP Recommendation

**Launch with these table stakes features:**
1. CSV import + card data parsing + Scryfall enrichment
2. Card grid with images, price, condition, quantity, set
3. Card name search
4. Mana color filter (WUBRG toggle buttons)
5. Shopping cart (add/remove/adjust quantity)
6. Checkout form (name + email)
7. Email to seller + buyer
8. Confirmation page
9. Mobile-responsive layout

**Defer to post-launch (easy to add based on friend feedback):**
- Set/rarity/type filters
- Sort options
- Card detail modal
- Inventory freshness indicator
- WUBRG icon styling (functional filter first, polish later)

## Sources

- Project requirements: `.planning/PROJECT.md` (HIGH confidence)
- MTG store feature patterns from TCGPlayer, Card Kingdom, ChannelFireball (MEDIUM confidence -- training data)
- Scryfall API capabilities (HIGH confidence -- well-established, stable API)
