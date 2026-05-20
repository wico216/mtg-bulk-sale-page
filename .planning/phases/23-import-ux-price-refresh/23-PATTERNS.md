# Phase 23: Import UX & Price Refresh - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 11 (4 NEW + 6 MODIFY + 1 root-config NEW)
**Analogs found:** 10 / 11 (vercel.json has no in-repo analog by design)

> Plan split: Plan 23-01 owns the price-refresh vertical slice (NEW + DB / lib /
> health MODIFY + vercel.json). Plan 23-02 owns the picker UX (3 MODIFY files,
> all client-side). Per CONTEXT D-17, 23-01 ships first.

> Non-standard Next.js notice (per `CLAUDE.md` → `AGENTS.md`): all route-handler
> conventions cited below were verified by reading `node_modules/next/dist/docs/`
> and by inspecting the project's existing route handlers (`import/preview/route.ts`,
> `import/commit/route.ts`, `cards/bulk-delete/route.ts`, `admin/health/route.ts`).
> The shapes shown here are what this Next.js actually accepts, not training-data
> memory.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality | Plan |
|-------------------|------|-----------|----------------|---------------|------|
| `src/lib/price-refresh.ts` (NEW) | shared service (server-only) | batch transform → DB UPDATE → audit insert | `src/lib/enrichment.ts` (server-side card-pipeline service) + `src/db/queries.ts` `replaceCardsForBinders` (chunked bulk DB write pattern) | role-match | 23-01 |
| `src/app/api/cron/refresh-prices/route.ts` (NEW) | route handler (GET, Bearer auth) | request-response (no body) | None in-repo — first cron route. Auth-shape pattern from Vercel docs + token-equality pattern from `cards/bulk-delete/route.ts:36-53` for the wrapper shell | partial (no exact in-repo analog) | 23-01 |
| `src/app/api/admin/prices/refresh/route.ts` (NEW) | route handler (POST, requireAdmin + ADMIN_BULK) | request-response (no body) | `src/app/api/admin/cards/bulk-delete/route.ts` | exact | 23-01 |
| `src/app/admin/health/_components/refresh-prices-button.tsx` (NEW) | client component (mutation + router.refresh) | request-response (POST → router.refresh) | `src/app/admin/orders/_components/order-detail.tsx` lines 354-386 (`handleAdvance` PATCH+refresh pattern) — closest. Visual/disabled-state lexicon from `src/app/admin/_components/inventory-danger-zone.tsx` | role-match | 23-01 |
| `vercel.json` (NEW, repo root) | infrastructure config | n/a (declarative cron schedule) | **None** — file does not currently exist in repo (verified). Shape comes from Vercel docs + `STACK.md` / `ARCHITECTURE.md` | no analog | 23-01 |
| `src/db/admin-health.ts` (MODIFY) | DB query helper (server-only) | parallel SELECT MAX (read) | self (extend in-file parallel-query pattern) | exact (extend in place) | 23-01 |
| `src/app/api/admin/health/route.ts` (MODIFY) | route handler (GET) | request-response (read) | self (extend `envChecks()` + `AdminHealthRecent`) | exact (extend in place) | 23-01 |
| `src/app/admin/health/page.tsx` (MODIFY) | RSC page | server render | self (extend the `<dl grid lg:grid-cols-4>` tile section at lines 207-234) | exact (extend in place) | 23-01 |
| `src/lib/enrichment.ts` (MODIFY) | pure helper (export `getPrice`) | n/a (compile-only change) | self (line 114 — flip `function` to `export function`) | exact (1-line diff) | 23-01 |
| `src/app/admin/import/_components/binder-picker.tsx` (MODIFY) | client component (controlled checkbox group) | UI event-driven (onToggle / onBulkSet) | self (extend `<header>` block at lines 73-80; mirror existing `<button>` shape from `import-client.tsx:633-648`) | exact (extend in place) | 23-02 |
| `src/app/admin/import/_components/import-client.tsx` (MODIFY) | client component (state) | UI state | self (line 246: replace `defaultCheckedFor(b)` with `false`; also drop the `defaultCheckedFor` selector at line 140) | exact (in-place edit) | 23-02 |
| `src/lib/store/binder-import-store.ts` (MODIFY or simplify) | zustand store | client persisted state | self (per D-05: simplify `defaultCheckedFor` to `() => false` OR delete it entirely with deprecation comment) | exact (in-place edit) | 23-02 |

---

## Pattern Assignments

### `src/lib/price-refresh.ts` (NEW) — shared service

**Plan:** 23-01
**Role:** server-only async function called by two thin route handlers (cron + admin POST).
**Analogs:** `src/lib/enrichment.ts` (server-only pipeline that loops, calls Scryfall, returns counts) + `src/db/queries.ts` (chunked bulk-write pattern).

**`"server-only"` + import shape** — copy verbatim from `src/db/admin-health.ts:1-4`:

```typescript
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
```

**Audit-insert call shape** — copy from `src/db/queries.ts:585-595` (the public `createAdminAuditEntry` is the right entry point; do NOT use the file-private `createMutationAuditEntry`). Caller passes:

```typescript
// ARCHITECTURE.md §Pattern 1, slightly adapted:
await createAdminAuditEntry({
  action: "price_refresh",          // ⚠ requires AdminAuditAction union extension — see "No Analog Found"
  actorEmail: opts.actorEmail ?? null,
  targetType: "inventory",          // existing literal — see queries.ts:268
  targetId: null,
  targetCount: updated,
  metadata: {                       // D-04: locked scalars only
    trigger: opts.trigger,          // "cron" | "manual"
    updated,
    unchanged,
    failed,
    skipped,
    durationMs,
  },
});
```

**Scryfall reuse pattern** — copy import shape from `src/lib/enrichment.ts:2`:

```typescript
import { fetchCardsByScryfallIds } from "./scryfall";
// then: const map = await fetchCardsByScryfallIds(uniqueIds);
// (no `onBatchComplete` needed — cron has no NDJSON streaming consumer)
```

**Per-row finish-aware price** — `getPrice(prices, finish)` will be newly-exported from `src/lib/enrichment.ts:114-128`. Excerpt of the helper to mirror semantics (DO NOT duplicate the body — import and call it):

```typescript
// src/lib/enrichment.ts:114-128 — the SINGLE source of truth after Plan 23-01
function getPrice(
  prices: ScryfallCard["prices"],
  finish: Finish,
): number | null {
  const raw =
    finish === "etched"
      ? prices.usd_etched ?? prices.usd_foil ?? prices.usd
      : finish === "foil"
        ? prices.usd_foil ?? prices.usd_etched ?? prices.usd
        : prices.usd ?? prices.usd_foil ?? prices.usd_etched;
  if (raw == null) return null;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}
```

**Cents conversion** — D-14: `Math.round(parseFloat(usd) * 100)`. Schema confirms `cards.price` is `integer("price")` nullable cents (`src/db/schema.ts:43`).

**Advisory lock pattern** — D-08; not present in repo today. Implement via `db.execute(sql\`SELECT pg_try_advisory_lock(hashtext('cron.refresh_prices')) AS acquired\`)`. Auto-released on connection close (neon-http opens a fresh session per request — confirmed in PITFALLS Pitfall 4 / Performance Traps). On `acquired = false`: throw a typed error (e.g. `class PriceRefreshLockedError extends Error`) that the manual route maps to HTTP 409 and the cron route maps to a quiet 200-with-skipped-counter.

**Chunked UPDATE pattern** — established in `src/db/queries.ts` `replaceCardsForBinders` (neon-http compatible, no interactive transactions per STACK.md). Pattern is `UPDATE cards SET price = v.price FROM (VALUES ...) AS v(id, price) WHERE cards.id = v.id`. Recommend 500 rows/chunk (CONTEXT "Claude's Discretion" allows planner adjustment).

**Bulk read shape** — mirror the `db.execute` + typed-row pattern from `src/db/admin-health.ts:39-43`:

```typescript
async function lastTimestamp(query: ReturnType<typeof sql>): Promise<string | null> {
  const result = await db.execute<{ last_at: Date | string | null }>(query);
  // ...
}
```

**What to copy:** server-only + drizzle import block, advisory-lock SQL pattern, audit-insert call signature, getPrice import (do not duplicate body).
**What to adapt:** the audit `action` literal requires extending the `AdminAuditAction` union in `src/db/queries.ts:258-266` AND the runtime allowed-list at `src/db/queries.ts:441-455` (see "Shared Patterns → Audit Action Extension" below).

---

### `src/app/api/cron/refresh-prices/route.ts` (NEW) — Bearer-gated GET

**Plan:** 23-01
**Role:** thin route handler with Bearer-token auth, no body, GET only (Vercel cron requirement per STACK.md).
**Analogs:** No in-repo cron route exists today (first one). For the **wrapper shape** (try/catch, structured logger, ROUTE literal, success/failure response shapes), the closest analog is `src/app/api/admin/cards/bulk-delete/route.ts:36-87`. For the **Bearer-token comparison**, use the canonical Vercel pattern from ARCHITECTURE.md §Pattern 2 and STACK.md.

**Route segment config** — established convention from `src/app/api/admin/import/commit/route.ts:18-21` and `preview/route.ts:23-30`:

```typescript
const ROUTE = "/api/cron/refresh-prices";
export const runtime = "nodejs";   // required for advisory-lock SQL via neon-http
export const maxDuration = 300;    // D-18: Vercel Hobby 2026 default is 300s; ~26s refresh has 11× headroom
```

**Logger imports** — copy verbatim from `cards/bulk-delete/route.ts:8`:

```typescript
import { logEvent, logError } from "@/lib/logger";
```

**Bearer-token gate** — D-12 (fails closed when env missing → 401). Reference shape from PITFALLS Pitfall 1:

```typescript
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // ⚠ DO NOT log the auth header value on bypass (PITFALLS Security Mistakes).
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logEvent({
      level: "warn",
      event: "cron.refresh_prices.unauthorized",
      route: ROUTE,
    });
    return new Response("Unauthorized", { status: 401 });
  }
  // ... call runPriceRefresh({ trigger: "cron" })
}
```

**Try/catch + logEvent/logError shape** — copy from `cards/bulk-delete/route.ts:65-87`:

```typescript
try {
  const summary = await runPriceRefresh({ trigger: "cron" });
  logEvent({
    level: "info",
    event: "cron.refresh_prices.succeeded",
    route: ROUTE,
    metadata: summary,
  });
  return Response.json({ ok: true, ...summary });
} catch (err) {
  // ⚠ Map PriceRefreshLockedError → 200 + { ok: false, reason: "locked" } (cron should not alarm on the cron-vs-manual race).
  logError({
    event: "cron.refresh_prices.failed",
    route: ROUTE,
    error: err,
  });
  return Response.json({ ok: false, error: "Refresh failed" }, { status: 500 });
}
```

**No requireAdmin, no rate-limit** — cron has neither an admin session nor an IP-stable caller. Bearer-only is the load-bearing guard (PITFALLS Security Mistakes).

**What to copy:** route literal pattern, runtime/maxDuration exports, structured logger calls, try/catch wrapper shape.
**What to adapt:** swap `requireAdmin()` for the Bearer comparison; no `enforceRateLimit` call; method is GET not POST.

---

### `src/app/api/admin/prices/refresh/route.ts` (NEW) — admin POST

**Plan:** 23-01
**Role:** thin admin route handler; requireAdmin → ADMIN_BULK rate-limit → call shared service. Manual escape-hatch path.
**Analog:** `src/app/api/admin/cards/bulk-delete/route.ts` — exact match (same auth + rate-limit pair, same logger shape, same "after-auth bulk bucket" comment convention).

**Imports** (copy verbatim from `cards/bulk-delete/route.ts:1-9`):

```typescript
import { requireAdmin } from "@/lib/auth/admin-check";
import {
  enforceRateLimit,
  clientKeyFromRequest,
  RATE_LIMIT_BUCKETS,
} from "@/lib/rate-limit";
import { logEvent, logError } from "@/lib/logger";
import { runPriceRefresh } from "@/lib/price-refresh";   // NEW dep
```

**Route header** (copy from `cards/bulk-delete/route.ts:10` shape; add runtime/maxDuration like commit/preview routes):

```typescript
const ROUTE = "/api/admin/prices/refresh";
export const runtime = "nodejs";
export const maxDuration = 300;
```

**Auth + rate-limit gate** — exact shape, copy from `cards/bulk-delete/route.ts:36-53`:

```typescript
export async function POST(request: Request) {
  const result = await requireAdmin();
  if (result instanceof Response) return result;

  // Bulk delete is expensive -- apply the bulk bucket AFTER auth.
  // ↑ Existing comment in bulk-delete; adapt to: "Price refresh is expensive — apply ADMIN_BULK AFTER auth."
  const rateLimited = await enforceRateLimit({
    key: clientKeyFromRequest(request, result.user.email),
    config: RATE_LIMIT_BUCKETS.ADMIN_BULK,
  });
  if (rateLimited) {
    logEvent({
      level: "warn",
      event: "admin.price_refresh.rate_limited",
      route: ROUTE,
      actor: result.user.email,
    });
    return rateLimited;
  }
  // ... try/catch the service call
}
```

**Success/failure response** — adapt from `cards/bulk-delete/route.ts:65-87`:

```typescript
try {
  const summary = await runPriceRefresh({
    trigger: "manual",
    actorEmail: result.user.email,
  });
  logEvent({
    level: "info",
    event: "admin.price_refresh.succeeded",
    route: ROUTE,
    actor: result.user.email,
    metadata: summary,
  });
  return Response.json({ success: true, ...summary });
} catch (err) {
  // ⚠ Map PriceRefreshLockedError → 409 with { error: "Refresh in progress" } per D-03 UX requirement.
  logError({
    event: "admin.price_refresh.failed",
    route: ROUTE,
    actor: result.user.email,
    error: err,
  });
  return Response.json(
    { error: "Price refresh failed" },
    { status: 500 },
  );
}
```

**No body parsing** — no `request.json()`; the POST carries no payload. Skip the body-validation branch from bulk-delete (lines 55-63).

**What to copy:** entire wrapper shell (imports, ROUTE literal, requireAdmin pattern, enforceRateLimit + log on block, logEvent/logError shape, JSON response shape).
**What to adapt:** drop body parsing; map advisory-lock error to 409 not 500; swap business call to `runPriceRefresh({ trigger: "manual", actorEmail })`.

---

### `src/app/admin/health/_components/refresh-prices-button.tsx` (NEW) — client mutation button

**Plan:** 23-01
**Role:** `"use client"` component; POSTs to `/api/admin/prices/refresh`, shows button-local state, calls `router.refresh()` on success.
**Analog:** `src/app/admin/orders/_components/order-detail.tsx:354-386` (`handleAdvance` is the closest existing fetch-POST-then-`router.refresh()` pattern). The `/admin/health/_components/` directory does not exist yet — create it (mirrors `/admin/import/_components/`, `/admin/audit/_components/`, etc.).

**"use client" + imports** — copy shape from `inventory-danger-zone.tsx:1-3` (for the bare-minimum useState client component) layered with the useRouter pattern from `order-detail.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
```

**Button-local state machine (D-03)** — mirror the loading/error pattern from `inventory-danger-zone.tsx:21-33` and the fetch/error/refresh pattern from `order-detail.tsx:354-386`:

```typescript
type Status =
  | { kind: "idle" }
  | { kind: "refreshing" }
  | { kind: "error"; message: string };

export function RefreshPricesButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleClick() {
    if (status.kind === "refreshing") return;
    setStatus({ kind: "refreshing" });
    try {
      const res = await fetch("/api/admin/prices/refresh", { method: "POST" });
      if (res.status === 409) {
        setStatus({
          kind: "error",
          message: "Refresh in progress — try again in a moment",
        });
        setTimeout(() => setStatus({ kind: "idle" }), 5000);
        return;
      }
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: "Refresh failed — check logs",
        });
        setTimeout(() => setStatus({ kind: "idle" }), 5000);
        return;
      }
      setStatus({ kind: "idle" });
      router.refresh();  // re-RSC the page; the page is `dynamic = "force-dynamic"` already (page.tsx:19)
    } catch {
      setStatus({
        kind: "error",
        message: "Refresh failed — check logs",
      });
      setTimeout(() => setStatus({ kind: "idle" }), 5000);
    }
  }
  // ... render JSX
}
```

**Disabled-state visual lexicon** — copy the Tailwind class pattern from `inventory-danger-zone.tsx:90-97` (transparent outlined button, NOT a destructive filled red CTA — price refresh is non-destructive per PITFALLS Anti-Pattern 3):

```tsx
<button
  type="button"
  onClick={handleClick}
  disabled={status.kind === "refreshing"}
  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
  // Outlined / quiet weight — NOT the red destructive style from inventory-danger-zone.
>
  {status.kind === "refreshing" ? "Refreshing…" : "Refresh now"}
</button>
{status.kind === "error" && (
  <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
    {status.message}
  </p>
)}
```

**`router.refresh()` post-mutation** — direct call (NOT wrapped in `startTransition` like `orders-table.tsx:305`). The health page is server-rendered + `dynamic = "force-dynamic"` (`page.tsx:19`), so `router.refresh()` will re-execute `getAdminHealthSnapshot()` and re-render the new `lastPriceRefreshAt` tile naturally.

**What to copy:** "use client" + useState + useRouter import shape; the POST → status-machine → router.refresh flow; the disabled-button class pattern.
**What to adapt:** strip out body parsing (POST carries no body); skip toast / sessionStorage path (D-03: button-local state, no toast); distinguish 409 vs 5xx in inline-error copy per D-03.

---

### `vercel.json` (NEW, repo root) — Vercel cron schedule

**Plan:** 23-01
**Role:** declarative infrastructure config (no JS).
**Analog:** **None in-repo** — the file does not currently exist (verified). Shape pulled from Vercel docs (verified 2026-02-27 in STACK.md) and ARCHITECTURE.md §`vercel.json`.

**Canonical shape** (verified, copy directly):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/refresh-prices", "schedule": "0 9 * * *" }
  ]
}
```

**Schedule (D-07):** `"0 9 * * *"` UTC daily (= 02:00 PT / 04:00 CT / 05:00 ET — off-peak globally). Hobby tier fires anywhere in 09:00–09:59 UTC (±59 min, PITFALLS Pitfall 9).
**Path:** MUST start with `/` (verified in STACK.md). Numeric-only cron fields; no `MON`/`SUN`/`JAN` aliases (Vercel-specific limitation).
**`$schema`:** recommended by Vercel docs for IDE validation; not load-bearing.

**What to copy:** entire JSON shape.
**What to adapt:** nothing — this file is small enough to write whole.

---

### `src/db/admin-health.ts` (MODIFY) — add `lastPriceRefreshAt` parallel query

**Plan:** 23-01
**Role:** server-only DB helper; add a 4th `MAX(created_at) WHERE action='price_refresh'` query to the existing `Promise.all`.
**Analog:** self (file already exhibits the exact pattern needed).

**Insertion point — interface extension** (line 20-25):

```typescript
// Current (admin-health.ts:20-25):
export interface AdminHealthSnapshot {
  database: "ok" | "error";
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  // ADD:
  lastPriceRefreshAt: string | null;
}
```

**Insertion point — `Promise.all` extension** (lines 59-63):

```typescript
// Current (admin-health.ts:59-63):
const [lastOrderAt, lastImportAt, lastAuditAt] = await Promise.all([
  lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM orders`),
  lastTimestamp(sql`SELECT MAX(committed_at) AS last_at FROM import_history`),
  lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM admin_audit_log`),
  // ADD a 4th element:
  lastTimestamp(sql`SELECT MAX(created_at) AS last_at FROM admin_audit_log WHERE action = 'price_refresh'`),
]);
```

**Insertion point — return-object extension** (lines 65-71):

```typescript
return {
  database: "ok",
  lastOrderAt,
  lastImportAt,
  lastAuditAt,
  // ADD:
  lastPriceRefreshAt,
};
```

**Also update the early-return DB-error branch** (lines 51-57) to set `lastPriceRefreshAt: null`.

**Index considerations:** the existing `admin_audit_log_action_idx` (verified at `src/db/schema.ts:107`) covers the `WHERE action = 'price_refresh'` filter — no new index needed (PITFALLS Performance Traps confirms this).

**What to copy:** the existing parallel-query shape one-for-one.
**What to adapt:** add a 4th query with a `WHERE action = '...'` filter (the other three are unfiltered MAX reads).

---

### `src/app/api/admin/health/route.ts` (MODIFY) — add `cronSecret` env-check + `lastPriceRefreshAt` field

**Plan:** 23-01
**Role:** route-level extension; mirrors the `envChecks()` literal-only pattern (D-13).
**Analog:** self (lines 22-34, 46-57, 96-107).

**Insertion point — `AdminHealthCheckStatuses` interface** (lines 22-27):

```typescript
// Add cronSecret field:
export interface AdminHealthCheckStatuses {
  database: "ok" | "error";
  authSecret: "configured" | "missing";
  googleOAuth: "configured" | "missing";
  email: "configured" | "missing";
  cronSecret: "configured" | "missing";   // NEW
}
```

**Insertion point — `AdminHealthRecent` interface** (lines 29-34): per D-06, REPLACE the dead `notificationFailuresLast24h` field with `lastPriceRefreshAt`:

```typescript
// Before (route.ts:29-34):
export interface AdminHealthRecent {
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  notificationFailuresLast24h: number | null;   // REMOVE
}

// After:
export interface AdminHealthRecent {
  lastOrderAt: string | null;
  lastImportAt: string | null;
  lastAuditAt: string | null;
  lastPriceRefreshAt: string | null;            // NEW (replaces notificationFailuresLast24h per D-06)
}
```

**`envChecks()` extension** (lines 46-57) — mirror the literal-only "configured"/"missing" pattern:

```typescript
function envChecks(): Omit<AdminHealthCheckStatuses, "database"> {
  const authSecret = isPresent(process.env.AUTH_SECRET) ? "configured" : "missing";
  const googleOAuth =
    isPresent(process.env.AUTH_GOOGLE_ID) && isPresent(process.env.AUTH_GOOGLE_SECRET)
      ? "configured"
      : "missing";
  const email =
    isPresent(process.env.RESEND_API_KEY) && isPresent(process.env.SELLER_EMAIL)
      ? "configured"
      : "missing";
  // ADD:
  const cronSecret = isPresent(process.env.CRON_SECRET) ? "configured" : "missing";
  return { authSecret, googleOAuth, email, cronSecret };
}
```

**`ok` flag extension** (lines 90-94) — D-13 requires top-level `ok` to flip false when `cronSecret === "missing"`:

```typescript
const ok =
  checks.database === "ok" &&
  checks.authSecret === "configured" &&
  checks.googleOAuth === "configured" &&
  checks.email === "configured" &&
  checks.cronSecret === "configured";   // NEW
```

**Response body** (lines 96-107) — swap the dead `notificationFailuresLast24h` for `lastPriceRefreshAt`.

**What to copy:** the literal-only env-check pattern (lines 46-57), the `ok` boolean composition (lines 90-94).
**What to adapt:** replace `notificationFailuresLast24h` with `lastPriceRefreshAt` (NOT add a 5th field — grid stays 4-col per D-06).

---

### `src/app/admin/health/page.tsx` (MODIFY) — replace dead tile, add `RefreshPricesButton`

**Plan:** 23-01
**Role:** server-rendered admin page; replace the "Notification failures (24h)" tile (lines 226-233) with a "Last price refresh" tile + mount the new client button.
**Analog:** self (lines 207-234 — existing `<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">` 4-col tile grid).

**Mirror the existing tile shape** (lines 220-225 — "Last audit entry"):

```tsx
<div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
    Last audit entry
  </dt>
  <dd className="mt-2 text-sm font-medium">{formatTimestamp(snapshot.lastAuditAt)}</dd>
</div>
```

**Replace the dead tile at lines 226-233** with the new tile + button:

```tsx
<div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
    Last price refresh
  </dt>
  <dd className="mt-2 text-sm font-medium">{formatTimestamp(snapshot.lastPriceRefreshAt)}</dd>
  <RefreshPricesButton />   {/* NEW client component, adjacent to its timestamp tile per ARCHITECTURE.md Anti-Pattern 3 */}
</div>
```

**Also REMOVE the dead-tile note paragraph** at lines 235-244 (the "Notification failure counts are emitted to Vercel function logs by…" block — obsoleted by D-06).

**Snapshot fallback** (lines 92-103) — extend the catch-branch to include `lastPriceRefreshAt: null`.

**Grid stays `lg:grid-cols-4`** per D-06 (no `lg:grid-cols-5`).

**STATUS_LABELS check (lines 45-50)** — no change. `cronSecret` will be rendered via the existing `Checks` table (lines 105-142); per Phase 15 SECURITY-REVIEW the STATUS_LABELS path is the only env-state→UI translation and is pinning-tested. Extend the `checks` array (lines 105-142) by appending a 5th row for `cronSecret` mirroring the `authSecret` row at lines 116-123:

```tsx
{
  key: "cronSecret",
  label: "Cron secret",
  status: envState.cronSecret,
  hint:
    envState.cronSecret === "configured"
      ? "CRON_SECRET is set; Vercel cron can authenticate to /api/cron/refresh-prices."
      : "CRON_SECRET is not set. Generate with: openssl rand -hex 32. Daily price refresh will 401 until configured.",
},
```

(Note: the page-local `envChecks()` at lines 27-43 will also need the `cronSecret` line — this is a separate function from the route-handler's `envChecks()`, which is one of the known small duplications in the Phase 15 codebase.)

**Update `overallOk` (lines 144-148)** to include `envState.cronSecret === "configured"`.

**What to copy:** the existing tile-card markup verbatim; the existing `checks` row shape verbatim.
**What to adapt:** swap the rendered timestamp from `lastAuditAt` to `lastPriceRefreshAt`; mount `<RefreshPricesButton />` inside the new tile's `<div>`; extend `envChecks()` + `overallOk` for `cronSecret`.

---

### `src/lib/enrichment.ts` (MODIFY) — export `getPrice`

**Plan:** 23-01
**Role:** trivial visibility change — flip `function` → `export function` at line 114.
**Analog:** self.

**Insertion point — line 114:**

```typescript
// Before:
function getPrice(prices: ScryfallCard["prices"], finish: Finish): number | null {

// After (D-09: single source of truth for the etched-finish ladder):
export function getPrice(prices: ScryfallCard["prices"], finish: Finish): number | null {
```

**Existing in-file caller** (line 277: `card.price = getPrice(scryfallData.prices, card.finish);`) — no change needed; in-module callers can use the now-exported binding.

**Sanity check** (Plan 23-01 task): verify nothing else in `src/lib/enrichment.ts` is named `getPrice` and shadowed. Verified at read-time: only one definition (line 114). Safe to export.

**What to copy:** the existing function body verbatim.
**What to adapt:** the one keyword `export`.

---

### `src/app/admin/import/_components/binder-picker.tsx` (MODIFY) — Select All / Deselect All

**Plan:** 23-02
**Role:** controlled client component; add two `<button>` elements + new `onBulkSet` callback in the existing `<header>` block.
**Analog:** self (existing `<header>` at lines 73-80) + button shape from `import-client.tsx:633-648` (existing Cancel/Continue button styling).

**Insertion point — props extension** (lines 19-27):

```typescript
export interface BinderPickerProps {
  binders: BinderSummary[];
  knownBinderNames: string[];
  selection: Record<string, boolean>;
  onToggle: (binderName: string, checked: boolean) => void;
  // ADD (D-15: avoids N renders by batching select-all / deselect-all in one parent state update):
  onBulkSet: (binderNames: string[], checked: boolean) => void;
}
```

**Current `<header>` block** (lines 73-80) — copy excerpt to mirror layout:

```tsx
<header className="flex items-center justify-between mb-3">
  <h2
    id="binder-picker-heading"
    className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
  >
    Select binders to import ({selectedCount} of {binders.length})
  </h2>
</header>
```

**Replacement `<header>` block** — add a `<div>` of two `<button>`s on the right (counter stays on the left per CONTEXT "Claude's Discretion"):

```tsx
<header className="flex items-center justify-between mb-3">
  <h2
    id="binder-picker-heading"
    className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
  >
    Select binders to import ({selectedCount} of {binders.length})
  </h2>
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onBulkSet(binders.map((b) => b.name), true)}
      className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      Select all
    </button>
    <button
      type="button"
      onClick={() => onBulkSet(binders.map((b) => b.name), false)}
      className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      Deselect all
    </button>
  </div>
</header>
```

**Button styling source** — pulled from `import-client.tsx:636-637` (the existing Cancel button class chain): `border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors`. Smaller size (`text-xs px-2 py-1`) because these are secondary affordances next to a heading.

**Native `<button>`** per PITFALLS Pitfall 15 (keyboard nav). Tab order falls out naturally: filename → Select all → Deselect all → first checkbox → ... → Continue.

**What to copy:** the `<header>` flex layout; the `<button type="button" className="...">` shape from existing buttons.
**What to adapt:** add the new `onBulkSet` prop; size buttons smaller than the primary CTA; mirror dark-mode classes.

---

### `src/app/admin/import/_components/import-client.tsx` (MODIFY) — drop `defaultCheckedFor`, wire `onBulkSet`

**Plan:** 23-02
**Role:** parent state holder for the picker.
**Analog:** self.

**Insertion point — drop the `defaultCheckedFor` selector** (line 140):

```typescript
// Before (line 140):
const defaultCheckedFor = useBinderImportStore((s) => s.defaultCheckedFor);

// After: delete this line entirely (D-05).
```

**Insertion point — replace `defaultCheckedFor(b)` with `false`** (line 246):

```typescript
// Before (lines 244-247):
const initialSelection: Record<string, boolean> = {};
for (const b of binders as BinderSummary[]) {
  initialSelection[b.name] = defaultCheckedFor(b);   // ← replace
}
setPickerSelection(initialSelection);

// After (D-05: picker opens all-unchecked every session):
const initialSelection: Record<string, boolean> = {};
for (const b of binders as BinderSummary[]) {
  initialSelection[b.name] = false;
}
setPickerSelection(initialSelection);
```

**Insertion point — pass `onBulkSet` to `<BinderPicker>`** (lines 624-631):

```tsx
// Before:
<BinderPicker
  binders={stage.binders}
  knownBinderNames={knownBinderNamesFn()}
  selection={pickerSelection}
  onToggle={(name, checked) =>
    setPickerSelection((prev) => ({ ...prev, [name]: checked }))
  }
/>

// After:
<BinderPicker
  binders={stage.binders}
  knownBinderNames={knownBinderNamesFn()}
  selection={pickerSelection}
  onToggle={(name, checked) =>
    setPickerSelection((prev) => ({ ...prev, [name]: checked }))
  }
  onBulkSet={(names, checked) =>
    setPickerSelection((prev) => {
      const next = { ...prev };
      for (const name of names) next[name] = checked;
      return next;
    })
  }
/>
```

The single-`setPickerSelection` batch (functional updater + spread) keeps the picker re-rendering once per click — directly satisfies D-15's "avoid N renders" guarantee.

**Will-delete panel** (lines 255-257) — NO CHANGE per D-05 explanatory note. The amber will-delete panel default-CHECKED behavior is unaffected; only the picker's per-binder memory feature is dropped.

**What to copy:** the existing functional-updater pattern `setPickerSelection((prev) => ({ ...prev, [name]: checked }))` from line 629.
**What to adapt:** loop the spread inside a single `setPickerSelection` call (one render for N names).

---

### `src/lib/store/binder-import-store.ts` (MODIFY or simplify) — drop `defaultCheckedFor` policy

**Plan:** 23-02
**Role:** zustand store; per D-05, the `defaultCheckedFor` function becomes orphan dead code OR is removed.
**Analog:** self.

**Two acceptable shapes (planner picks one):**

**Shape A — simplify in place** (preserves type contract; lowest blast radius):

```typescript
// Lines 53-58 BEFORE:
defaultCheckedFor: ({ name, isNew }) => {
  if (name === "unsorted") return false;
  const prior = get().lastSelection[name];
  return prior ?? isNew;
},

// AFTER:
// D-05 (Plan 23-02): picker now opens all-unchecked every session. Select All
// is the recovery affordance. This helper is retained for backward-compat with
// any older callers but always returns false; consider removing in v1.5.
defaultCheckedFor: () => false,
```

**Shape B — delete from interface and implementation** (preferred per PITFALLS Pitfall 3 "explicit removal"):

1. Remove `defaultCheckedFor` from the `BinderImportState` interface (line 30).
2. Remove the implementation from the `create()` call (lines 53-58).
3. Update the file-header docblock (lines 4-17) to note: "Phase 23 / v1.4 D-05: `defaultCheckedFor` removed. Picker opens all-unchecked every session; Select All is the recovery affordance. `lastSelection` + `recordCommit` are RETAINED for the `knownBinderNames()` derivation (used by the import-client to compute `will-delete`)."

**`lastSelection`, `recordCommit`, `knownBinderNames`** — RETAIN in both shapes. The will-delete amber panel still depends on `knownBinderNames()` (`import-client.tsx:149`) to compute which prior-known binders are missing from the current upload. This is the only surviving consumer of `lastSelection` post-Plan 23-02.

**Header docblock update** — the existing lines 4-17 reference D-08/D-09/D-10 ("operator's binder selection memory"). The PITFALLS Pitfall 3 "warning signs" call out drift between this docblock and the new behavior. Rewrite the docblock to describe the post-23-02 invariant.

**What to copy:** the existing zustand `create()` + `persist()` shape (no change).
**What to adapt:** strip `defaultCheckedFor` from the interface + body (Shape B preferred); rewrite the file-header docblock.

---

## Shared Patterns

### Server-only + drizzle import block

**Source:** `src/db/admin-health.ts:1-4`
**Apply to:** `src/lib/price-refresh.ts` (NEW server-only service).

```typescript
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
```

The `"server-only"` import is load-bearing — Next.js will fail the build if a client component tries to import this module. Never omit.

---

### Admin route wrapper shell (POST with auth + rate-limit)

**Source:** `src/app/api/admin/cards/bulk-delete/route.ts:1-87`
**Apply to:** `src/app/api/admin/prices/refresh/route.ts` (NEW).

Full pattern:

1. Imports: `requireAdmin`, `enforceRateLimit` + `clientKeyFromRequest` + `RATE_LIMIT_BUCKETS`, `logEvent` + `logError`.
2. `const ROUTE = "/api/admin/..."` literal at module level.
3. `export const runtime = "nodejs"` + `export const maxDuration = ...`.
4. Inside the handler: `requireAdmin()` first, return-if-Response.
5. Then `enforceRateLimit` with `RATE_LIMIT_BUCKETS.ADMIN_BULK` AFTER auth (Phase 15 invariant — verified in `15-SECURITY-REVIEW.md`).
6. `logEvent({ level: "warn", event: "...rate_limited", route: ROUTE, actor })` on block.
7. Try/catch around business logic with structured success/failure logs.
8. `Response.json({ success: true, ... }, { status: 200 })` for success.

---

### Bearer-token cron auth (fail-closed when env missing)

**Source:** Vercel docs (verified 2026-02-27 in STACK.md / PITFALLS); no in-repo analog yet.
**Apply to:** `src/app/api/cron/refresh-prices/route.ts` (NEW).

```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

The `!cronSecret` clause is the fail-closed guard (D-12). Never log the auth header value (PITFALLS Security Mistakes / logger.ts redaction does not key on `authorization`).

---

### Audit-entry insert (locked-scalars metadata)

**Source:** `src/db/queries.ts:585-595` (`createAdminAuditEntry`) + Phase 14 bounded-metadata invariant.
**Apply to:** `src/lib/price-refresh.ts` (NEW), via call site.

Call shape:

```typescript
await createAdminAuditEntry({
  action: "price_refresh",
  actorEmail: opts.actorEmail ?? null,
  targetType: "inventory",
  targetId: null,
  targetCount: updated,
  metadata: { trigger, updated, unchanged, failed, skipped, durationMs },
});
```

D-04 caps metadata at locked scalars only — no `failedSample[]`, no `errors[]` array. Per-card detail flows through structured logs, not audit metadata. Stays well under the 4KB Phase 14 cap.

---

### Audit action enum extension (REQUIRED — see "No Analog Found")

**Source:** `src/db/queries.ts:258-266` (type union) + `src/db/queries.ts:441-455` (runtime allowed-list).
**Apply to:** Plan 23-01 MUST extend BOTH locations to include `"price_refresh"`.

Current state:

```typescript
// Lines 258-266 (TypeScript union):
export type AdminAuditAction =
  | "inventory.update"
  | "inventory.delete_one"
  | "inventory.delete_many"
  | "inventory.delete_all"
  | "inventory.import_commit"
  | "order.status_update"
  | "order.cancel"
  | "order.restore_inventory";

// Lines 441-455 (runtime guard in normalizeAdminAuditAction):
function normalizeAdminAuditAction(value: string): AdminAuditAction {
  const allowed: readonly AdminAuditAction[] = [
    "inventory.update",
    "inventory.delete_one",
    // ... etc
  ];
  return allowed.includes(value as AdminAuditAction)
    ? (value as AdminAuditAction)
    : "inventory.update";
}
```

**Required change:** add `"price_refresh"` to both lists. The DB column is `text` (D-16 verified at `src/db/schema.ts:92`) so the literal works at the SQL layer regardless. But CONTEXT D-16's claim "`'price_refresh'` literal works as-is" is incomplete — it works at SQL layer but the TypeScript union and the runtime allowed-list both need extending or `createAdminAuditEntry({ action: "price_refresh", ... })` will fail typecheck and the read-back path will silently coerce to `"inventory.update"`.

---

### Route-level `runtime` + `maxDuration` exports

**Source:** `src/app/api/admin/import/preview/route.ts:23-30` + `import/commit/route.ts:18-21`
**Apply to:** both NEW route handlers.

```typescript
export const runtime = "nodejs";   // required for neon-http (no Edge runtime)
export const maxDuration = 300;    // Vercel Hobby 2026 default; D-18 has 11× headroom
```

---

### Client-mutation button with `router.refresh()`

**Source:** `src/app/admin/orders/_components/order-detail.tsx:354-386` (`handleAdvance`).
**Apply to:** `RefreshPricesButton` (NEW).

Pattern: client component → useState status machine → fetch POST → set error inline on non-ok → `router.refresh()` on ok. Page must be `dynamic = "force-dynamic"` for `router.refresh()` to re-execute the snapshot helper — `src/app/admin/health/page.tsx:19` is already configured this way.

**Do NOT** wrap in `useTransition` here — the page is `force-dynamic` and a short imperative spinner is the D-03 UX (`Refreshing…` button state), not a transition-pending state on other unrelated UI.

---

### Tier 1 / Tier 2 test split — "NOT env-gated" header

**Source:** `src/lib/__tests__/csv-parser-perf.test.ts:21-23` (literal "Default-run: this test is NOT env-gated and NOT skipped" header).
**Apply to:** Plan 23-01 test files for `runPriceRefresh` and the cron route (D-01 / D-11).

```typescript
/**
 * ⚠️ This file is the DEFAULT-RUN cron-handler suite. It is NOT env-gated;
 * it runs on every `npm test` in CI. Live-DB integration is intentionally
 * out of scope per Phase 23 D-01.
 * Background: v1.3.5 silent-skip retrospective (.planning/RETROSPECTIVE.md).
 */
```

The CSV perf test is the load-bearing in-repo example of this pattern (verified in PITFALLS Pitfall 2 / Critical Pitfalls). Plan 23-01 tests must follow the same literal-comment convention so a future maintainer can `grep` for the pattern.

---

## No Analog Found

| File | Role | Reason | Substitute |
|------|------|--------|------------|
| `vercel.json` | Root infrastructure config | File does not currently exist in repo (verified) | Use the Vercel-docs shape verbatim from ARCHITECTURE.md §`vercel.json` (3-line JSON) |
| `src/app/api/cron/**/route.ts` (the `/api/cron/*` subtree as a whole) | Cron route handler | No existing cron route in repo — this is the first | Bearer-token comparison from Vercel docs / PITFALLS Pitfall 1; wrapper shape (try/catch, structured logger, ROUTE literal) from `cards/bulk-delete/route.ts` |
| Postgres advisory-lock SQL (`pg_try_advisory_lock(hashtext(...))`) | DB concurrency control | Not used elsewhere in the codebase today | Pattern from PITFALLS Pitfall 4 / ARCHITECTURE.md D-08; verified neon-http supports it via raw `db.execute(sql\`...\`)` |
| Manual-refresh inline error UI (button-local 409/5xx distinction) | Client error UX | No prior admin button distinguishes 409 vs 5xx inline | Compose: `inventory-danger-zone.tsx` (button + disabled state) + `order-detail.tsx:354-386` (POST + router.refresh) + new 5-second inline error pattern per D-03 |
| `AdminAuditAction = "price_refresh"` literal | Audit action enum | Current union enumerates only inventory/order actions (queries.ts:258-266 + 441-455) | Extend the TypeScript union AND the runtime allowed-list — Plan 23-01 must touch both |

---

## Verification of CONTEXT.md "Existing Code Insights" claims

Confirmed by direct read:

| Claim | Verified? | Notes |
|-------|-----------|-------|
| `getPrice(prices, finish)` is file-private | YES | `src/lib/enrichment.ts:114` — no `export` keyword. Single in-file caller at line 277. Safe to export. |
| `getAdminHealthSnapshot()` uses parallel-query pattern | YES | `src/db/admin-health.ts:59-63` — 3-element `Promise.all`. 4th element insertion is a clean extension. |
| `binder-picker.tsx` is controlled `"use client"` component with `onToggle` prop | YES | Lines 1, 19-27 verified. Adding `onBulkSet` is a pure additive change. |
| `cards.price` is `integer("price")` cents, nullable | YES | `src/db/schema.ts:43` with explicit "null means Price N/A" comment. |
| `admin_audit_log.action` is `text` | YES | `src/db/schema.ts:92` — `action: text("action").notNull()`. SQL layer accepts any literal. **But:** see "Audit Action Extension" — the TypeScript union and runtime guard at `queries.ts:258, 441` need explicit extension. |
| `requireAdmin()` returns `AdminSession | Response` | YES | `src/lib/auth/admin-check.ts:13` — exact shape. |
| `RATE_LIMIT_BUCKETS.ADMIN_BULK` exists, 20/min | YES | `src/lib/rate-limit.ts:634-638`. |
| `src/app/admin/health/_components/` directory | DOES NOT EXIST YET | Plan 23-01 must create it (mirror sibling directories under `/admin/import/_components/`). |
| `vercel.json` at repo root | DOES NOT EXIST YET | Confirmed via `test -f vercel.json` (missing). |

---

## Metadata

**Analog search scope:**
- `src/app/api/admin/**` (all admin route handlers)
- `src/app/admin/**` (admin pages + _components)
- `src/lib/**` (shared services + utilities)
- `src/db/**` (DB helpers + schema + queries)
- Project root (for `vercel.json` check)

**Files scanned:** 17 (read in full or in targeted ranges)
**Pattern extraction date:** 2026-05-20
**Plan ordering:** 23-01 (NEW + MODIFY for price refresh, 7 files) → 23-02 (3 MODIFY for picker UX). Per D-17, 23-01 ships first.
