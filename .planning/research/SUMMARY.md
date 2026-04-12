# Research Summary: Viki -- MTG Bulk Store

**Domain:** Simple e-commerce / personal card store
**Researched:** 2026-04-02
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

Viki is a straightforward static storefront for selling Magic: The Gathering bulk cards to friends. The technical complexity is low -- this is essentially a static catalog with client-side cart and a single serverless function for emailing orders. The entire project can be built with Next.js (SSG), Tailwind CSS, Zustand for cart state, PapaParse for CSV import, and Resend for transactional email.

The Scryfall API is the key external dependency and it is well-suited: free, no authentication, comprehensive MTG card database with CDN-served images. The main architectural decision is to treat this as a static site generated from CSV data, with Scryfall images loaded client-side. This approach costs $0 to host on Vercel's free tier.

The biggest risk is not technical but operational: keeping inventory in sync when cards sell. Since there is no database, the CSV must be re-uploaded and the site rebuilt when inventory changes. For a friend-circle store, this is acceptable.

There are no significant technical unknowns. Every piece of this stack is well-established and the integration points are simple. The project could realistically be built in a weekend.

## Key Findings

**Stack:** Next.js 16 (SSG) + Tailwind + Zustand + PapaParse + Scryfall API + Resend. Zero database.
**Architecture:** Static site with client-side cart and one API route for email checkout.
**Critical pitfall:** Scryfall rate limits (10 req/sec) mean you must use image URLs directly, not fetch metadata per-card on page load.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation + CSV Import** - Get the data pipeline working first
   - Addresses: CSV parsing, card data model, Scryfall image integration
   - Avoids: Building UI before data shape is known

2. **Card Catalog UI** - Browse, search, and filter the inventory
   - Addresses: Card grid display, search by name, filter by color
   - Avoids: Premature optimization of search (use native JS filtering)

3. **Cart + Checkout** - Shopping cart and email-based ordering
   - Addresses: Cart state (Zustand), checkout form, email sending (Resend)
   - Avoids: Over-engineering checkout (no payment, no accounts)

4. **Polish + Deploy** - Responsive design, error handling, Vercel deployment
   - Addresses: Mobile layout, loading states, production deployment
   - Avoids: Scope creep into admin features

**Phase ordering rationale:**
- Data pipeline must come first because UI depends on knowing the card data shape
- Catalog before cart because you need something to add to the cart
- Cart before polish because core functionality must work before refinement
- Single deploy phase at the end keeps focus on features during development

**Research flags for phases:**
- Phase 1: May need Manabox CSV sample to confirm field mapping (LOW risk)
- Phase 3: Resend free tier and setup needs verification at implementation time
- Phase 4: Standard patterns, no research needed

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Well-established tools, verified Next.js version |
| Features | HIGH | Requirements are clear and simple |
| Architecture | HIGH | Static site + API route is a solved pattern |
| Pitfalls | MEDIUM | Scryfall specifics from training data, rate limits need runtime verification |

## Gaps to Address

- Exact Manabox CSV export format (need a sample file to confirm field names and structure)
- Resend free tier current limits (verify at signup time)
- Zustand and PapaParse exact current versions (pin at `npm install` time)
