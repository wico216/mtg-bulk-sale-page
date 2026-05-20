# Architecture Research — v1.4 Import UX & Price Refresh

**Domain:** Next.js 16 App Router admin tooling on Vercel + Neon Postgres (drizzle-orm via neon-http)
**Researched:** 2026-05-20
**Confidence:** HIGH (all integration points verified against on-disk source; cron contract verified against Vercel docs last_updated 2026-02-27)

## Executive Summary

Two features integrate cleanly with the existing v1.3 architecture: one is a pure UI tweak on a known component (binder picker), the other is a vertical slice that follows the well-trodden `/api/admin/*` shape but adds two new surfaces — a public-but-secret-gated `/api/cron/*` route and a manual admin trigger. **No schema change is required**; `cards.price` already exists, and the audit row reuses the existing `admin_audit_log` table with a new `action` literal (`'price_refresh'`). The biggest non-obvious integration point is that **prices are integer cents, not dollars** — and because the schema's 5-segment composite id binds price-per-row to finish (`'normal' | 'foil' | 'etched'`), the refresh service must apply the existing `getPrice(prices, finish)` ladder per-row, not per-Scryfall-id.

> **Path correction:** the milestone context says `src/app/admin/import/binder-picker.tsx`. **The actual path is `src/app/admin/import/_components/binder-picker.tsx`** (under `_components/` — every interactive component on the import flow lives there). All grep searches and refactors must use the corrected path.

---

## Standard Architecture (existing v1.3 surfaces this milestone touches)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                      │
│  ┌────────────────────────────┐  ┌──────────────────────────┐                 │
│  │ /admin/import              │  │ /admin/health (Server RSC)│                 │
│  │  import-client.tsx (state) │  │  HealthPage              │                 │
│  │   ├─ pickerSelection useState│ │   └─ snapshot tiles (dl) │ ← NEW tile      │
│  │   ├─ willDeleteSelection   │  │   └─ NEW: RefreshNow btn │ ← NEW client cpt │
│  │   └─ useBinderImportStore  │  └──────────────────────────┘                 │
│  │       (zustand + localStorage)                                              │
│  └────────────┬───────────────┘                                                │
└───────────────┼───────────────────────────────────────────────────────────────┘
                │ fetch                                                          │ fetch
                ▼                                                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers (src/app/api/*)                                       │
│                                                                                │
│  POST /api/admin/import/preview          POST /api/admin/import/commit         │
│   - requireAdmin → ADMIN_BULK ratelimit   - requireAdmin → ADMIN_BULK rl       │
│   - NDJSON stream: binders→progress→result                                     │
│                                                                                │
│  GET /api/admin/health                   NEW: GET /api/cron/refresh-prices    │
│   - requireAdmin                          - Bearer auth (CRON_SECRET)         │
│   - getAdminHealthSnapshot                - calls runPriceRefresh({trigger:'cron'})│
│                                                                                │
│  NEW: POST /api/admin/prices/refresh                                          │
│   - requireAdmin → ADMIN_BULK ratelimit                                        │
│   - calls runPriceRefresh({trigger:'manual', actorEmail})                      │
└──────────────────────────────────────────────┬───────────────────────────────┘
                                               │
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Service layer (src/lib/*, src/db/*)                                          │
│                                                                                │
│  NEW: src/lib/price-refresh.ts                                                │
│   runPriceRefresh({ trigger, actorEmail? }):                                  │
│    1. SELECT id, scryfallId, finish, price FROM cards                         │
│    2. fetchCardsByScryfallIds(uniqueIds)  ← reuse existing batched fetcher    │
│    3. for each row: newPrice = Math.round(getPrice(card.prices, row.finish)*100)│
│    4. bucket UPDATEs by chunk; one createAdminAuditEntry insert at end        │
│                                                                                │
│  src/db/admin-health.ts                                                       │
│   getAdminHealthSnapshot — ADD 4th parallel query:                            │
│     SELECT MAX(created_at) FROM admin_audit_log WHERE action='price_refresh'  │
└──────────────────────────────────────────────┬───────────────────────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Neon Postgres                                                                │
│   cards (price INTEGER cents)        admin_audit_log (action TEXT, metadata)  │
│   ← bulk UPDATE per chunk            ← single INSERT per refresh run          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities — what changes vs stays put

| Component | Current responsibility | Change in v1.4 |
|-----------|-----------------------|----------------|
| `src/app/admin/import/_components/binder-picker.tsx` | Pure controlled component: renders checkboxes from `selection: Record<string, boolean>`, calls `onToggle` upward | **ADD** Select All / Deselect All buttons in `<header>` block. Wire to `onToggle` for each binder in `binders` prop (or add `onBulkSet` callback). Component stays controlled — no internal state. |
| `src/app/admin/import/_components/import-client.tsx` | Holds `pickerSelection: useState<Record<string,boolean>>` (line 128) + initializes it from store's `defaultCheckedFor` (line 244-248) | **CHANGE** the initialization loop: replace `defaultCheckedFor(b)` call with literal `false` for all binders. This is the "hard-reset, all-deselected by default" interpretation. |
| `src/lib/store/binder-import-store.ts` | Persists `lastSelection` to localStorage; provides `defaultCheckedFor` derivation | **NO CHANGE** required if we hard-reset in `import-client.tsx`. The store can stay — `recordCommit` is still useful for the audit trail of "what did the operator pick this time". If we want pure simplification, `defaultCheckedFor` becomes unused dead code (orphan) — leave for now, remove in v1.5. |
| `src/lib/scryfall.ts` | Exposes `fetchCardsByScryfallIds(ids, opts)` (v1.3.1 batched `/cards/collection`, v1.3.2 gated) | **NO CHANGE** — reused as-is by `runPriceRefresh`. |
| `src/lib/enrichment.ts` | Exposes `enrichCards`; `getPrice(prices, finish)` is file-private | **EXPORT `getPrice`** (or duplicate the 3-line ladder into the refresh service). Recommend export — single source of truth for the etched-bug fix. |
| `src/db/admin-health.ts` | Returns `{ database, lastOrderAt, lastImportAt, lastAuditAt }` | **ADD** `lastPriceRefreshAt: string \| null` to interface + the 4th `Promise.all` query. |
| `src/app/api/admin/health/route.ts` | JSON endpoint; constructs `AdminHealthResponse.recent` | **ADD** `lastPriceRefreshAt` to `AdminHealthRecent` interface + response body. |
| `src/app/admin/health/page.tsx` | Server-rendered tiles + check rows | **ADD** 4th tile in the `<dl className="grid ... lg:grid-cols-4">` (line 207-234) — grid is already 4-col so this slots in naturally. **ADD** `<RefreshPricesButton />` client component as adjacent escape-hatch UI. |
| `src/lib/rate-limit.ts` `RATE_LIMIT_BUCKETS` | Defines CHECKOUT/ADMIN_MUTATION/ADMIN_BULK | **NO CHANGE** — manual refresh uses existing ADMIN_BULK (20/min) bucket. |
| `src/db/queries.ts` `createAdminAuditEntry` | Inserts one row into `admin_audit_log` | **NO CHANGE** — caller passes `action: 'price_refresh'` literal. |
| `src/db/schema.ts` | `cards`, `admin_audit_log`, etc. | **NO CHANGE** — `cards.price` already exists; `admin_audit_log.action` is `text` so any literal works. |

---

## New Files (with rationale)

```
src/
├── lib/
│   └── price-refresh.ts                       # NEW — shared service
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── refresh-prices/
│   │   │       └── route.ts                    # NEW — Vercel cron GET, Bearer auth
│   │   └── admin/
│   │       └── prices/
│   │           └── refresh/
│   │               └── route.ts                # NEW — admin POST, requireAdmin+ADMIN_BULK
│   └── admin/
│       └── health/
│           └── _components/
│               └── refresh-prices-button.tsx   # NEW — client component, posts to /api/admin/prices/refresh
└── lib/
    └── __tests__/
        └── price-refresh.test.ts               # NEW — unit test (in-memory mock or test DB)
```

Plus one root-level file:

```
vercel.json                                     # NEW (does not currently exist)
```

### `vercel.json` — required new root file

Verified: this repo does not have a `vercel.json`. Must create:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 4 * * *" }
  ]
}
```

The `$schema` line gets schema validation in editors and is recommended by the Vercel docs.

### Modified Files (with line-level pointers)

| File | What to change | Approx lines |
|------|----------------|--------------|
| `src/app/admin/import/_components/binder-picker.tsx` | Add Select-All / Deselect-All buttons in `<header>` block | Around lines 73-80 |
| `src/app/admin/import/_components/import-client.tsx` | Change `initialSelection[b.name] = defaultCheckedFor(b)` to `initialSelection[b.name] = false` | Line 246 |
| `src/app/admin/import/_components/__tests__/binder-picker.test.tsx` | Add tests for the new buttons (calls `onToggle` / `onBulkSet` for every binder) | Append |
| `src/db/admin-health.ts` | `AdminHealthSnapshot` interface + `Promise.all` body | Lines 20-25 and 59-63 |
| `src/db/__tests__/admin-health.test.ts` | Cover new field | Append |
| `src/app/api/admin/health/route.ts` | `AdminHealthRecent` interface + body assembly | Lines 29-34 and 99-107 |
| `src/app/api/admin/health/__tests__/route.test.ts` | Cover new field | Append |
| `src/app/admin/health/page.tsx` | Add 4th tile to grid + mount `<RefreshPricesButton />` | Lines 207-234 |
| `src/lib/enrichment.ts` | `export function getPrice(...)` (currently unexported) | Line 114 |

---

## Architectural Patterns

### Pattern 1: Shared service called by two route handlers

**What:** Both the cron route (`GET /api/cron/refresh-prices`) and the admin manual route (`POST /api/admin/prices/refresh`) call **one** function `runPriceRefresh({ trigger, actorEmail? })` in `src/lib/price-refresh.ts`. The route handlers are thin authentication/authorization wrappers — they hold no business logic.

**When to use:** Whenever the same job has multiple entry points with different auth models.

**Trade-offs:** + single source of truth for refresh semantics, audit shape, and progress logs. + tests target the service directly without HTTP plumbing. − the service must be authentication-agnostic; auth happens at the route boundary only.

**Example:**

```typescript
// src/lib/price-refresh.ts
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { cards } from "@/db/schema";
import { fetchCardsByScryfallIds } from "@/lib/scryfall";
import { getPrice } from "@/lib/enrichment";  // newly exported
import { createAdminAuditEntry } from "@/db/queries";

export interface PriceRefreshSummary {
  updated: number;
  unchanged: number;
  failed: number;
  durationMs: number;
}

export async function runPriceRefresh(opts: {
  trigger: "cron" | "manual";
  actorEmail?: string | null;
}): Promise<PriceRefreshSummary> {
  const started = Date.now();
  // 1. Read every (id, scryfallId, finish, price) tuple.
  const rows = await db
    .select({
      id: cards.id,
      scryfallId: cards.scryfallId,
      finish: cards.finish,
      currentPriceCents: cards.price,
    })
    .from(cards);

  // 2. De-dup Scryfall IDs (same id maps to many rows because of 5-segment PK).
  const ids = Array.from(
    new Set(rows.map((r) => r.scryfallId).filter((id): id is string => !!id)),
  );

  // 3. Reuse existing batched fetcher (v1.3.2-hardened gate + retry).
  const scryfallMap = await fetchCardsByScryfallIds(ids);

  // 4. Compute new prices per ROW (finish ladder applied per-row).
  let updated = 0, unchanged = 0, failed = 0;
  const updates: Array<{ id: string; priceCents: number | null }> = [];
  for (const r of rows) {
    if (!r.scryfallId || !scryfallMap.has(r.scryfallId)) { failed++; continue; }
    const card = scryfallMap.get(r.scryfallId)!;
    const priceUsd = getPrice(card.prices, r.finish);  // <-- per-row, per-finish
    const priceCents = priceUsd === null ? null : Math.round(priceUsd * 100);
    if (priceCents === r.currentPriceCents) { unchanged++; continue; }
    updates.push({ id: r.id, priceCents });
    updated++;
  }

  // 5. Chunked bulk UPDATE — keep statement size sane.
  //    Pattern: UPDATE cards SET price = v.price FROM (VALUES ...) AS v(id, price)
  //             WHERE cards.id = v.id
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    // ... emit one parametrized UPDATE per chunk
  }

  const durationMs = Date.now() - started;
  // 6. Single audit row.
  await createAdminAuditEntry({
    action: "price_refresh",
    actorEmail: opts.actorEmail ?? null,
    targetType: "card",
    targetId: null,
    targetCount: updated,
    metadata: { trigger: opts.trigger, updated, unchanged, failed, durationMs },
  });

  return { updated, unchanged, failed, durationMs };
}
```

### Pattern 2: Two-auth-model entry to one service

**What:** Cron uses `Authorization: Bearer ${CRON_SECRET}`; manual uses NextAuth Google session + `requireAdmin()` + `enforceRateLimit(ADMIN_BULK)`. They DO NOT share an auth helper — they share the post-auth service call.

**When to use:** Always when a job is both scheduled AND operator-invokable.

**Trade-offs:** + cron has no rate-limit (Vercel invokes it; no IP) — only the secret matters. + manual reuses existing `requireAdmin()` and `enforceRateLimit()` patterns verbatim. − two route files; can't accidentally share auth in one wrapper.

**Example — cron route (verified against Vercel docs 2026-02-27 + existing repo conventions):**

```typescript
// src/app/api/cron/refresh-prices/route.ts
import { runPriceRefresh } from "@/lib/price-refresh";
import { logEvent, logError } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;  // refresh ~7700 rows takes ~26s; 60s headroom

const ROUTE = "/api/cron/refresh-prices";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const summary = await runPriceRefresh({ trigger: "cron" });
    logEvent({ level: "info", event: "cron.price_refresh.succeeded", route: ROUTE, metadata: summary });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    logError({ event: "cron.price_refresh.failed", route: ROUTE, error: err });
    return Response.json({ ok: false, error: "Refresh failed" }, { status: 500 });
  }
}
```

**Example — manual admin route (mirrors `bulk-delete/route.ts` shape):**

```typescript
// src/app/api/admin/prices/refresh/route.ts
import { requireAdmin } from "@/lib/auth/admin-check";
import { enforceRateLimit, clientKeyFromRequest, RATE_LIMIT_BUCKETS } from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";
import { runPriceRefresh } from "@/lib/price-refresh";

const ROUTE = "/api/admin/prices/refresh";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, auth.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({ level: "warn", event: "admin.price_refresh.rate_limited", route: ROUTE, actor: auth.user.email });
    return rateLimited;
  }
  try {
    const summary = await runPriceRefresh({ trigger: "manual", actorEmail: auth.user.email });
    logEvent({ level: "info", event: "admin.price_refresh.succeeded", route: ROUTE, actor: auth.user.email, metadata: summary });
    return Response.json({ success: true, ...summary });
  } catch (err) {
    logError({ event: "admin.price_refresh.failed", route: ROUTE, actor: auth.user.email, error: err });
    return Response.json({ error: "Price refresh failed" }, { status: 500 });
  }
}
```

### Pattern 3: Controlled checkbox-group + batch selection actions

**What:** The existing binder picker is a controlled component — parent owns `selection: Record<string, boolean>` and passes it down with an `onToggle` callback. Select-All / Deselect-All buttons preserve this contract by calling `onToggle(name, true|false)` for every binder in a loop (or by exposing a separate `onBulkSet` callback for performance).

**When to use:** Anywhere a group of checkboxes has a "select all / deselect all" UX.

**Trade-offs:** + No change to the picker's controlled contract — still a pure render-from-props leaf. + No new state in the picker. − Calling `onToggle` N times causes N renders if parent uses naive `setState`; ok at N ≤ 200 (`MAX_SELECTED_BINDERS` in `commit/route.ts`), and the existing `setPickerSelection((prev) => ({ ...prev, [name]: checked }))` in `import-client.tsx` line 628-630 already does single-key merge. Recommend a small extension: add a second `onBulkSet(names: string[], checked: boolean)` callback that the picker calls once for batch operations, and the parent applies in one `setPickerSelection` to avoid N renders.

**Example:**

```typescript
// In BinderPicker header:
<header className="flex items-center justify-between mb-3">
  <h2 id="binder-picker-heading" className="...">
    Select binders to import ({selectedCount} of {binders.length})
  </h2>
  <div className="flex items-center gap-2">
    <button type="button"
      onClick={() => onBulkSet(binders.map(b => b.name), true)}
      className="text-xs px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-100">
      Select all
    </button>
    <button type="button"
      onClick={() => onBulkSet(binders.map(b => b.name), false)}
      className="text-xs px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-100">
      Deselect all
    </button>
  </div>
</header>
```

---

## Data Flow

### Daily cron flow

```
Vercel scheduler (UTC)
  ↓ GET /api/cron/refresh-prices
  ↓ Authorization: Bearer ${CRON_SECRET}
  ↓ User-Agent: vercel-cron/1.0
[route handler] verify secret → 401 if mismatch
  ↓
runPriceRefresh({ trigger: "cron" })
  ├─ SELECT id, scryfallId, finish, price FROM cards     (one query)
  ├─ fetchCardsByScryfallIds(uniqueIds)                  (~26s, gated at 4 req/s)
  ├─ for each row: compute getPrice(prices, finish) * 100 cents
  ├─ chunked bulk UPDATE cards SET price = ... (500/chunk)
  └─ INSERT admin_audit_log { action: 'price_refresh', metadata: { trigger, updated, unchanged, failed, durationMs } }
  ↓
Response.json({ ok: true, updated, unchanged, failed, durationMs })
```

### Manual refresh flow

```
Operator clicks "Refresh prices now" on /admin/health
  ↓ POST /api/admin/prices/refresh
[requireAdmin] → 401 unauth / 403 wrong email
  ↓
[enforceRateLimit ADMIN_BULK 20/min]
  ↓ allowed
runPriceRefresh({ trigger: "manual", actorEmail })  ← identical body to cron
  ↓
Response.json({ success: true, ...summary })
  ↓
Client refreshes the health tile (router.refresh() or refetch /api/admin/health)
```

### Health page extension

```
GET /admin/health (Server RSC)
  ↓
getAdminHealthSnapshot()
  ├─ SELECT 1                                                          (connectivity)
  ├─ Promise.all([
  │    MAX(orders.created_at),
  │    MAX(import_history.committed_at),
  │    MAX(admin_audit_log.created_at),
  │    MAX(admin_audit_log.created_at) WHERE action='price_refresh'    ← NEW
  │  ])
  ↓
HealthPage renders 4-col grid:
  [Last order] [Last import] [Last audit] [Last price refresh]  ← NEW tile (replaces "Notification failures" placeholder?)
```

**Decision needed by roadmapper:** the existing grid is `sm:grid-cols-2 lg:grid-cols-4` with four tiles, the 4th being "Notification failures (24h) — Unknown — log drain not yet wired". Two options:

1. **Replace** the notification-failures tile with "Last price refresh" — kills a placeholder PROJECT.md decision logged as "⚠️ Revisit when log drain lands".
2. **Add 5th tile** — grid becomes 5-col on large screens (Tailwind would need `lg:grid-cols-5`).

Recommend **option 1** (replace) — the notification-failures tile is a known dead placeholder per Key Decisions row in PROJECT.md, and operator gets a useful tile instead of a permanent "Unknown". Document the replacement explicitly in PROJECT.md Key Decisions at transition.

---

## Integration Points

### External Services

| Service | Integration | Notes |
|---------|-------------|-------|
| Vercel Cron | `vercel.json` `crons[]` array; GET on production URL with `Authorization: Bearer ${CRON_SECRET}`; UA `vercel-cron/1.0` | **Hobby tier limit:** once-per-day max; schedules more frequent than daily fail deploy. Schedule `0 4 * * *` triggers between **04:00 and 04:59 UTC** (hobby is hour-bucketed for load distribution, see Pitfalls). Vercel does NOT retry on failure. Vercel CAN deliver the same event >1x → service is naturally idempotent (re-writing same prices). |
| Scryfall `/cards/collection` | Reused via existing `fetchCardsByScryfallIds()` | No change to the integration; sustained ~8 req/s through `acquireGate()` critical-section. Full refresh of ~7700 unique IDs ≈ 26s. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Route handlers → `runPriceRefresh` | Direct function call (in-process) | Service is `"server-only"`; never imported by client code. |
| `runPriceRefresh` → DB | `db.select` + chunked `db.execute(sql...)` UPDATE + `createAdminAuditEntry` | NOT wrapped in `db.batch()` — chunked UPDATEs are independent and idempotent; failing mid-flight leaves a consistent partial state (some rows refreshed, audit row NOT written until the end, so a retry sees the same view). |
| Health page client ↔ refresh button | Client component `<RefreshPricesButton />` posts; success triggers `router.refresh()` to re-RSC the page | Health page is `dynamic = "force-dynamic"` already (line 19), so `router.refresh()` re-runs `getAdminHealthSnapshot()`. |
| Manual route ↔ cron route | NONE — both call `runPriceRefresh` directly. No HTTP between them. | Critical: don't have manual route call cron route via fetch — that would require the manual route to also know `CRON_SECRET`. |

---

## Anti-Patterns

### Anti-Pattern 1: Updating price by Scryfall ID alone

**What people do:** `UPDATE cards SET price = $newPrice WHERE scryfall_id = $id` — one UPDATE per Scryfall card.

**Why it's wrong:** The same Scryfall card is one Scryfall row but **N database rows** (one per `finish × condition × binder` permutation). The price depends on `finish` (the `getPrice(prices, finish)` ladder — etched/foil/normal prefer different USD fields). Updating by `scryfall_id` alone would write the same price to all finishes — re-introducing the v1.2 etched bug (PROJECT.md context line 50, Phase 17 FIN-01).

**Do this instead:** Compute price per ROW (`getPrice(card.prices, row.finish)`), then bulk-UPDATE by the 5-segment composite `cards.id`.

### Anti-Pattern 2: Single giant UPDATE with N×CASE

**What people do:** `UPDATE cards SET price = CASE id WHEN '...' THEN ... END WHERE id IN (...)` with ~7700 cases.

**Why it's wrong:** SQL statement size balloons; neon-http has per-statement size limits in practice; analyzer time on the CASE is non-trivial.

**Do this instead:** Chunk into ~500-row UPDATEs using a `FROM (VALUES ...)` join. neon-http is HTTP-per-statement so chunking is mostly free.

### Anti-Pattern 3: Adding the manual button to the dashboard (`/admin`)

**What people do:** Put "Refresh prices now" on the main `/admin` page near the inventory danger zone.

**Why it's wrong:** Two reasons. (1) The inventory danger zone is destructive UX — refresh is non-destructive. (2) `lastPriceRefreshAt` is on `/admin/health` — separating the button from the "last refreshed at" timestamp breaks causal locality (operator clicks button, looks for confirmation, can't see it without navigating).

**Do this instead:** Mount the button on `/admin/health` next to the `lastPriceRefreshAt` tile.

### Anti-Pattern 4: Forgetting the price-unit conversion

**What people do:** `cards.price = scryfallCard.prices.usd` (string-to-number cast, dollars).

**Why it's wrong:** Schema `cards.price` is `integer("price")` storing **cents** (verified: `src/db/schema.ts:44`, `src/db/seed.ts:26`, `src/db/queries.ts:858`). All read paths divide by 100 (`src/db/queries.ts:47, 109`).

**Do this instead:** `Math.round(usdFloat * 100)` matches the existing convention.

---

## Scaling Considerations

| Scale | Approach |
|-------|----------|
| Today: ~7,700 unique Scryfall IDs across ~12,749 rows | Single refresh in ~26s (Scryfall gate at ~8 req/s) + DB writes. Comfortably within Vercel 60s function limit. |
| 30,000 rows | Refresh approaches 60s. Bump `maxDuration` to 90s OR split into two cron windows (e.g., 04:00 odd half, 04:15 even half — but hobby tier blocks intra-day scheduling, so this requires upgrading to Pro). |
| 100,000+ rows | Move refresh to a queue (Vercel Queues / Inngest / Trigger.dev) with worker fan-out. Outside v1.4 scope. |

**First bottleneck (verified):** Scryfall rate limit (sustained 8 req/s through `acquireGate`). At ~75 cards/batch this caps real throughput at ~600 cards/sec — fine until ~30k rows.

---

## Build Order (suggested for roadmapper)

The two features are **independent** (no shared files; no shared state) → roadmapper can split into two phases OR keep as one phase with two plans.

**Within the price refresh slice, suggested build order:**

1. **Export `getPrice` from `enrichment.ts`** — read-side change to an existing pure function; trivial.
2. **Add `lastPriceRefreshAt` to `getAdminHealthSnapshot`** — read-side; extends one `Promise.all`. (Risk-free; tests update.)
3. **Build `src/lib/price-refresh.ts`** — pure service; unit-testable against in-memory mocks; can land before any route exists.
4. **Add cron route `/api/cron/refresh-prices/route.ts` + `vercel.json`** — write-side, but gated by `CRON_SECRET`. Operator can deploy with secret unset → 401 (safe inert state).
5. **Add manual admin route `/api/admin/prices/refresh/route.ts`** — write-side, gated by `requireAdmin` + ratelimit.
6. **Health page tile + `RefreshPricesButton` client component** — pure UI on top of (2) + (5).
7. **Binder picker buttons** — independent UI; can interleave at any point. Recommend last because it's lowest-risk and lets the operator UAT the price refresh first.

**Read-side vs write-side risk split:**

| Step | Type | Risk |
|------|------|------|
| 1. Export `getPrice` | read-side (no behavior change) | None |
| 2. `lastPriceRefreshAt` snapshot field | read-side (new query, no writes) | Low |
| 3. `runPriceRefresh` service (unit-tested only) | code with no entry point | None |
| 4. Cron route + vercel.json | write-side; runs daily on schedule | **Medium** — first run will hit production DB; needs UAT |
| 5. Manual admin route | write-side; operator-triggered | **Medium** — same engine as cron; both share fate |
| 6. Health page tile + button | read-side + thin POST wrapper | Low |
| 7. Binder picker buttons | client-side UX | Low |

**Reversibility:** All steps are reversible without schema change. The cron job is disabled by removing the `crons[]` entry from `vercel.json` and redeploying. The audit rows accumulate but are read-only history — they don't gate any other feature.

**Suggested phase shape:**

- **Phase 23 (Plan 01): Price refresh** — steps 1-6 above; includes vercel.json + CRON_SECRET operator runbook. Validated by: cron route returns 401 without secret, returns 200 with secret, audit row visible at `/admin/audit`, `lastPriceRefreshAt` tile populates, manual button works end-to-end.
- **Phase 23 (Plan 02): Import picker UX** — steps 7 above. Validated by: binder picker opens with all binders unchecked (including any that were checked last session), Select All checks every binder, Deselect All unchecks every binder, will-delete amber panel still default-checked.

OR one combined phase with two plans — choice depends on whether roadmapper prefers tight grouping or independent transitions.

---

## Sources

- **Vercel Cron Jobs** (last_updated 2026-02-27): https://vercel.com/docs/cron-jobs and https://vercel.com/docs/cron-jobs/manage-cron-jobs — verified: GET method, `Authorization: Bearer ${CRON_SECRET}` header, operator-provided env var, UA `vercel-cron/1.0`, Hobby tier daily-only with hour-bucketed timing, no retry on failure, events MAY be delivered >1x. HIGH confidence.
- **Next.js 16 Route Handler conventions** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`): `export async function GET(request: Request)` shape confirmed for Next 16.2.2 in this repo. HIGH confidence.
- **In-repo source files**: All paths and line numbers cited above were read directly from working tree at 2026-05-20. HIGH confidence.
- **PROJECT.md** decisions log: confirms `cards.price` integer-cents convention (Phase 16 D-02), 5-segment composite PK (D-05/BIND-01), and the etched-bug fix that requires per-row finish-aware price ladder (Phase 17 FIN-01).

---
*Architecture research for: v1.4 Import UX & Price Refresh*
*Researched: 2026-05-20*
