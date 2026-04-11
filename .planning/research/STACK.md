# Stack Research

**Domain:** Admin panel, database, auth, inventory CRUD for existing MTG bulk card store
**Researched:** 2026-04-11
**Confidence:** MEDIUM-HIGH

## Context

This is a **subsequent milestone** stack research. The existing v1.0 storefront is built with Next.js 16.2, React 19, Tailwind CSS 4, Zustand, PapaParse, Scryfall API, and Resend. The v1.0 STACK.md explicitly said "do NOT use" databases, ORMs, and auth -- those constraints are now reversed for v1.1 which adds an admin panel, database-backed inventory, and GitHub OAuth.

**Existing stack (validated, do not change):**
- Next.js 16.2.2, React 19.2.4, TypeScript 5.x
- Tailwind CSS 4.x, Zustand 5.x
- PapaParse 5.5.3 (reuse for CSV import/export)
- Resend 6.10.0
- Vercel hosting

## Recommended Stack Additions

### Database

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Neon Postgres | N/A (managed service) | Primary database for inventory, orders | Neon is the direct successor to Vercel Postgres (which was deprecated and migrated to Neon in Q4 2024). Available as a first-party Vercel Marketplace integration. Free tier provides 0.5 GB storage, 100 CU-hours/month -- more than sufficient for a friend-circle MTG store with a few thousand cards. Serverless driver works natively with Vercel's edge/serverless functions. |
| @neondatabase/serverless | ^1.0.2 | Neon HTTP/WebSocket driver | Serverless-optimized PostgreSQL driver. Uses HTTP for simple queries (no persistent connection needed), WebSocket for transactions. Required by Drizzle ORM's Neon adapter. Replaces the deprecated @vercel/postgres package. |
| drizzle-orm | ^0.45.2 | TypeScript ORM | Type-safe SQL with zero runtime overhead. Schema defined in TypeScript, generates migration SQL files. Lightweight (~33KB) compared to Prisma (~8MB engine). Perfect for a simple app: define schema, get typed queries, done. Native Neon driver support via `drizzle-orm/neon-http`. |
| drizzle-kit | ^0.31.10 | Migration tooling | CLI companion to drizzle-orm. Generates SQL migrations from schema changes (`drizzle-kit generate`), applies them (`drizzle-kit migrate`), provides database studio for inspection. Must be version-aligned with drizzle-orm. |

**Why Neon over Vercel Postgres:** Vercel Postgres (@vercel/postgres) is deprecated as of mid-2025. All existing Vercel Postgres databases were automatically migrated to Neon. For new projects, Neon via Vercel Marketplace is the official path. The free tier is generous: 0.5 GB storage, 100 compute hours/month, 5 GB egress.

**Why Drizzle over Prisma:** Prisma ships an 8MB query engine binary, requires a generation step, and has a custom schema language. Drizzle schemas are plain TypeScript, the ORM is ~33KB, queries map directly to SQL (no query engine), and it has first-class Neon serverless support. For a simple CRUD app with 3-4 tables, Drizzle's lightweight approach is the right fit.

### Authentication

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| next-auth (Auth.js v5) | 5.0.0-beta.26 | GitHub OAuth for admin | Auth.js v5 is the standard auth solution for Next.js. Despite the "beta" tag, it has been in production across thousands of apps since 2024 and is widely used with Next.js 14-16. For this project: single GitHub OAuth provider, JWT sessions (no database adapter needed for sessions), restrict to one admin GitHub username via `signIn` callback. Minimal config: ~30 lines of code total. |

**Why Auth.js v5 over Better Auth:** Better Auth is newer and feature-rich (2FA, passkeys, RBAC). But this project needs exactly one thing: "is this the admin's GitHub account?" Auth.js v5 does this in ~30 lines with JWT sessions and a signIn callback that checks `profile.login === process.env.ADMIN_GITHUB_USERNAME`. Better Auth's plugin ecosystem and feature depth are overkill. Auth.js v5 is also the most documented solution for Next.js, meaning less debugging during implementation.

**Why Auth.js v5 over rolling custom auth:** OAuth flows have security pitfalls (CSRF, token handling, callback validation). Auth.js handles all of this. Even for single-user auth, the security benefit of a battle-tested library outweighs the perceived simplicity of a custom solution.

**Session strategy: JWT (not database sessions).** Single admin user, no need to store sessions in the database, no need for server-side session invalidation. JWT sessions are simpler and work on the edge.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PapaParse | 5.5.3 (already installed) | CSV import/export | Reuse for admin CSV import (parse Manabox exports) and CSV export (generate downloadable inventory file). Already proven in v1.0 build-time pipeline. Now used at runtime in admin server actions. |
| zod | ^3.24 | Schema validation | Validate server action inputs, CSV row data, and form submissions. Prevents malformed data from reaching the database. Works with Auth.js v5 for type-safe session data. Small (~15KB), zero dependencies. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| drizzle-kit | Schema migrations & DB studio | `drizzle-kit generate` creates SQL migration files; `drizzle-kit migrate` applies them; `drizzle-kit studio` provides a web UI for inspecting the database during development. |
| dotenv | Environment variable loading | Already handled by Next.js for `.env.local`, but drizzle-kit CLI needs it for running migrations outside of Next.js context. The @neondatabase/serverless driver reads `DATABASE_URL` from env. |

## Installation

```bash
# Database: Neon driver + Drizzle ORM
npm install drizzle-orm @neondatabase/serverless

# Auth: Auth.js v5 (beta, but production-stable)
npm install next-auth@beta

# Validation
npm install zod

# Dev dependencies: Drizzle migration tooling
npm install -D drizzle-kit
```

**Total new dependencies: 4 runtime, 1 dev.** Minimal footprint.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Neon Postgres | Supabase Postgres | If you want a built-in auth system, real-time subscriptions, or a dashboard UI for data management. Supabase free tier is comparable (500 MB). Overkill here -- we just need a Postgres database. |
| Neon Postgres | SQLite (Turso/LibSQL) | If you want even simpler setup and embedded database feel. But Turso's Vercel integration is less mature than Neon's, and PostgreSQL is more future-proof if the project grows. |
| Drizzle ORM | Prisma | If team already knows Prisma, or if project needs complex relations/nested queries. But Prisma's 8MB engine, generation step, and custom schema language are unnecessary weight for 3-4 simple tables. |
| Drizzle ORM | Raw SQL via @neondatabase/serverless | If the project has only 1-2 queries. But once you have CRUD for cards, orders, and order items, type-safe queries save debugging time. Drizzle adds negligible overhead. |
| Auth.js v5 (next-auth@beta) | Better Auth | If you need 2FA, passkeys, RBAC plugins, or multi-provider auth. This project needs one GitHub provider and one admin user -- Auth.js is simpler for this scope. |
| Auth.js v5 (next-auth@beta) | Custom middleware with GitHub OAuth API | If you want zero auth dependencies. But OAuth has security pitfalls (CSRF, state parameters, token refresh) that Auth.js handles automatically. Not worth the risk for saving one dependency. |
| Zod | Valibot | If bundle size is critical (Valibot is ~1KB vs Zod's ~15KB). But Zod has better Auth.js integration, more community examples, and the size difference is negligible for server-side validation. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| @vercel/postgres | **Deprecated.** Last published 2+ years ago (v0.10.0). Vercel Postgres was sunset and migrated to Neon in late 2024. | @neondatabase/serverless + drizzle-orm |
| Prisma | 8MB query engine binary, custom schema language (.prisma files), required generation step. Over-engineered for 3-4 simple tables. | drizzle-orm (TypeScript schema, ~33KB, no engine) |
| tRPC | Adds a layer of API abstraction. With Next.js 16 server actions, you get type-safe server mutations without tRPC's complexity. | Next.js server actions directly |
| React Query / SWR | The admin panel is server-rendered. Data fetching happens in server components and server actions, not client-side. Cart state (Zustand) is the only client state. | Server components for reads, server actions for writes |
| NextAuth v4 (next-auth@latest) | v4 is legacy. v5 has a cleaner API, better App Router support, and is the actively developed version. The npm `latest` tag still points to v4.24.13, so you must explicitly install `next-auth@beta` to get v5. | next-auth@beta (v5) |
| Clerk / Auth0 / Kinde | Third-party auth services with dashboards, user management UIs, etc. Massive overkill for single-admin-user GitHub OAuth. Also introduces vendor dependency and potential cost. | Auth.js v5 with GitHub provider |
| Admin UI frameworks (React Admin, Refine) | Full admin panel frameworks assume CRUD-heavy enterprise apps. This admin has ~5 pages. Building with Tailwind + server components is simpler than learning/configuring an admin framework. | Custom pages with Tailwind CSS |
| Shadcn/UI or Radix | Component libraries add complexity. The admin UI is simple: tables, forms, buttons. Tailwind utility classes handle this without a component library dependency. | Tailwind CSS (already installed) |
| File-based database (JSON, SQLite on disk) | Vercel's serverless functions have ephemeral file systems. File-based storage doesn't persist across function invocations. | Neon Postgres (persistent, managed) |

## Integration Points with Existing Stack

### Data Flow Change: Static JSON to Live Database

**Before (v1.0):**
```
CSV file --> build-time PapaParse --> static JSON --> SSG pages --> client-side rendering
```

**After (v1.1):**
```
CSV upload --> server action PapaParse --> Drizzle ORM --> Neon Postgres
                                                              |
                                         server components <--+-- storefront reads
                                         server actions <------+-- admin writes
                                         server actions <------+-- checkout (decrement stock)
```

### Key Integration Decisions

1. **Storefront pages become dynamic.** Currently SSG (static). With database-backed inventory, card catalog pages must fetch from the database at request time. Use server components with `fetch` or direct Drizzle queries. Consider ISR (Incremental Static Regeneration) with revalidation if performance matters, but for a friend-circle store, dynamic rendering is fine.

2. **Checkout API route gains database writes.** The existing `/api/checkout` email route must also decrement inventory quantities. This becomes a server action or stays as an API route but adds a database transaction: decrement stock, record order, send email -- all in one atomic operation.

3. **PapaParse stays.** Already installed and working. Admin CSV import reuses PapaParse to parse Manabox exports, then inserts rows via Drizzle. CSV export queries the database and generates CSV with PapaParse's `unparse()`.

4. **Zustand stays for cart.** Cart remains client-side with localStorage persistence. No change needed. The cart submits to the checkout server action, which now writes to the database.

5. **Admin layout is separate.** The admin panel lives under `/admin/*` with its own layout. Auth.js middleware protects all `/admin/*` routes. The storefront remains public and unchanged.

## Environment Variables Needed

```bash
# Neon Postgres (from Vercel Marketplace integration)
DATABASE_URL="postgresql://user:pass@ep-xxx.region.neon.tech/dbname?sslmode=require"

# Auth.js
AUTH_SECRET="generated-secret"              # npx auth secret
AUTH_GITHUB_ID="github-oauth-app-client-id"
AUTH_GITHUB_SECRET="github-oauth-app-secret"

# Admin restriction
ADMIN_GITHUB_USERNAME="your-github-username"
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| next-auth@5.0.0-beta.26 | Next.js >= 14.0 | Works with Next.js 16.2.2. Uses App Router's route handlers for OAuth callbacks. In Next.js 16, middleware.ts may be renamed to proxy.ts -- verify during implementation. |
| drizzle-orm@0.45.2 | drizzle-kit@0.31.10 | These versions must stay aligned. Always upgrade both together. |
| drizzle-orm@0.45.2 | @neondatabase/serverless@1.0.2 | Native support via `drizzle-orm/neon-http` driver. |
| @neondatabase/serverless@1.0.2 | Neon free tier | HTTP driver for serverless (Vercel functions). No connection pooling needed at this scale. |
| zod@3.24 | next-auth@5.0.0-beta.26 | Auth.js v5 uses Zod internally and supports Zod schemas for session type augmentation. |

## Sources

- Neon free tier limits: [Neon Plans](https://neon.com/docs/introduction/plans) -- 0.5 GB storage, 100 CU-hours/month (MEDIUM confidence, verified via WebSearch)
- Vercel Postgres deprecation and Neon transition: [Neon Transition Guide](https://neon.com/docs/guides/vercel-postgres-transition-guide) -- confirmed deprecated (HIGH confidence)
- @neondatabase/serverless v1.0.2: [npm](https://www.npmjs.com/package/@neondatabase/serverless) -- latest version (MEDIUM confidence, WebSearch-verified)
- Drizzle ORM v0.45.2: [npm](https://www.npmjs.com/package/drizzle-orm) -- published ~15 days ago (MEDIUM confidence, WebSearch-verified)
- Drizzle + Neon setup: [Drizzle with Neon tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) -- official docs (HIGH confidence)
- drizzle-kit v0.31.10 compatibility: [GitHub issues](https://github.com/drizzle-team/drizzle-orm/issues/5521) -- confirmed compatible with drizzle-orm 0.45.1+ (MEDIUM confidence)
- Auth.js v5 (next-auth@beta): [npm](https://www.npmjs.com/package/next-auth?activeTab=versions) -- v5.0.0-beta.26 (MEDIUM confidence, beta tag but production-stable)
- Auth.js v5 + Next.js 16 guide: [DEV Community](https://dev.to/huangyongshan46a11y/authjs-v5-with-nextjs-16-the-complete-authentication-guide-2026-2lg) -- configuration patterns (MEDIUM confidence)
- Auth.js v5 setup patterns: [Auth.js official docs](https://authjs.dev/reference/nextjs) -- route handler, middleware, callbacks (HIGH confidence)
- Auth.js v5 migration guide: [Auth.js migration guide](https://authjs.dev/getting-started/migrating-to-v5) -- v5 API changes (HIGH confidence)
- Better Auth vs Auth.js comparison: [supastarter](https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk) -- Auth.js simpler for basic OAuth (MEDIUM confidence)
- Next.js 16 server actions patterns: [makerkit](https://makerkit.dev/blog/tutorials/nextjs-server-actions) -- CRUD patterns (MEDIUM confidence)

---
*Stack research for: Viki MTG Bulk Store v1.1 -- Admin Panel & Inventory Management*
*Researched: 2026-04-11*
