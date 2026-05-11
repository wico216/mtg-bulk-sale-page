# Stack Research — v1.3 Binder-Aware Inventory & Pick Workflow

**Domain:** Subsequent milestone — adds binder-tagged inventory + multi-binder allocator to an existing Next.js bulk-sale store.
**Researched:** 2026-05-10
**Confidence:** HIGH

---

## Verdict: Nothing to Add

**No new dependencies. No version bumps. No new dev tools.**

Every feature in v1.3 (binder-tagged composite PK, per-binder selective replace, server-side allocator, `[binder]` annotation in admin order detail, `etched` finish) is achievable with the **already-pinned versions** of:

- `drizzle-orm@0.45.2` + `drizzle-kit@0.31.10` (custom SQL migration for the PK change)
- `papaparse@5.5.3` (extend existing `ManaboxRow` type with two new optional headers)
- `next@16.2.2` + `react@19.2.4` (no new APIs needed)
- `vitest@4.1.4` (allocator is a pure function — high-leverage unit-test surface)
- Tailwind v4 + native `<input type="checkbox">` (already the project's UI primitive — used in 4 places)

The change is **pure data-model + business-logic** on the existing stack, exactly as the question's prior states. The roadmap should **not** include a "stack setup" or "tooling upgrade" phase. Skip straight to schema migration → parser extension → allocator → UI wiring.

---

## Recommended Stack (current versions, kept as-is)

### Core Technologies

| Technology | Pinned Version | Purpose | Why Kept |
|------------|----------------|---------|----------|
| next | `16.2.2` | App Router + route handlers for `/api/admin/import/*` and `/api/checkout` | AGENTS.md flags "this is NOT the Next.js you know" — current code already follows the project's conventions. Adding/upgrading risks breaking the 28 passing test files. |
| react / react-dom | `19.2.4` | UI for admin import preview + binder picker | No new React features needed; native `<input type="checkbox">` is the project's established pattern. |
| typescript | `^5` | Allocator + parser + schema types | The allocator's correctness benefits enormously from discriminated unions over `binder` and `finish` — pure stack-internal usage. |
| drizzle-orm | `0.45.2` | Schema, queries, atomic batch writes | See **Drizzle PK migration strategy** below. Version is fully capable of the v1.3 schema change. |
| drizzle-kit | `0.31.10` | Schema migrations | See **Drizzle PK migration strategy** below — must use **custom (empty) migration** for the PK change, not auto-generate. |
| @neondatabase/serverless | `1.0.2` | Postgres HTTP client | Already wired through `db.batch([...])` in `src/db/queries.ts` — the per-binder selective replace will reuse the exact same atomic-batch pattern. |
| papaparse | `5.5.3` | CSV parsing | Extending `src/lib/csv-parser.ts` to read `Binder Name` / `Binder Type` is two new optional fields on `ManaboxRow`. PapaParse already returns whatever headers are present. |
| @types/papaparse | `5.5.2` | Type defs | No bump needed. |
| zustand | `5.0.12` | Client state for binder picker selection (remembered between imports) | Already used for cart + filter store. The "selection remembered between imports" requirement maps to a single `useBinderImportStore` slice with `persist` (or sessionStorage) — **no new state lib**. |
| next-auth | `5.0.0-beta.30` | Admin gate on `/api/admin/import/*` | Already wired via `requireAdmin()` in every admin route handler. No new auth surface. |
| tailwindcss | `^4` + `@tailwindcss/postcss` | Styling | Native `<input type="checkbox">` + Tailwind classes is the project's established UI-primitive pattern (filter-rail.tsx, inventory-table.tsx x2, order-detail.tsx). Reuse it for the binder picker. |

### Supporting Libraries (existing, reused)

| Library | Pinned Version | Purpose | When to Reuse |
|---------|----------------|---------|---------------|
| Custom rate-limit (`src/lib/rate-limit.ts`) | n/a (in-tree) | Sliding-window + Postgres CTE store | The new `/api/admin/import/preview` and `/commit` paths already pass through `enforceRateLimit({ config: RATE_LIMIT_BUCKETS.ADMIN_BULK })`. The **per-binder commit will reuse the same `ADMIN_BULK` bucket** — no new bucket, no new config. |
| Custom logger (`src/lib/logger.ts`) | n/a (in-tree) | Structured + deep-redacted logging | Add `binderCount` and `selectedBinders` to existing `admin.import_commit.succeeded` event metadata. The deep redactor is already pinned by tests so this is additive. |
| `admin_audit_log` (Phase 14 table) | n/a | Audit trail for admin mutations | Per-binder selective commits log a new `inventory.import_commit_per_binder` action; metadata schema is open (`jsonb`), so adding `selectedBinders: string[]` is trivial. |
| `import_history` (Phase 14 table) | n/a | First-class import history rows | Same — add `selectedBinders` and `binderCount` to its `metadata jsonb` column. No schema change to this table. |
| `fast-glob@3.3.3` | dev dep | Filesystem CSV walking in `parseAllCsvFiles` | Untouched by v1.3 (server-uploaded import path doesn't use it). |
| `tsx@4.21.0` | dev dep | Smoke script runner | Untouched by v1.3. |

### Development Tools (no changes)

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest 4.1.4 | Test runner | The allocator is a **pure function** taking `(line, sourceRows[]) -> splits[]` and is exactly what vitest is best at. Add ~6-10 unit tests covering: single-binder line, multi-binder split, exact-fit, oversold, deterministic ordering. No new tooling. |
| eslint 9 + eslint-config-next 16.2.2 | Linting | No changes. |
| drizzle-kit 0.31.10 | Migrations | **Use custom-migration mode** (see below) — do NOT rely on `drizzle-kit generate` for the PK change. |

---

## Direct Answers to the Four Questions

### 1. Drizzle composite-PK change — what migration strategy?

**Answer: do NOT use `drizzle-kit generate` for the PK change. Write a custom (empty) migration manually.**

**Why:** drizzle-kit has two known PK-migration bugs that affect this exact scenario:

- [Issue #3496](https://github.com/drizzle-team/drizzle-orm/issues/3496) — "Primary key migration fails when changing from one column to another." The generated SQL omits `DROP CONSTRAINT cards_pkey` before `ADD CONSTRAINT cards_pkey PRIMARY KEY (...)`, so the migration fails on first apply. Filed against drizzle-orm 0.36 / drizzle-kit 0.27, status not confirmed fixed in 0.45 / 0.31.10.
- [Issue #3117](https://github.com/drizzle-team/drizzle-orm/issues/3117) — adding a column AND making it part of the PK in one go produces an invalid migration.

**Recommended migration sequence** (write as a custom drizzle-kit migration via `drizzle-kit generate --custom`):

```sql
-- 1. Add nullable column
ALTER TABLE cards ADD COLUMN binder text;

-- 2. Backfill existing rows (matches PROJECT.md: "binder = 'unsorted'")
UPDATE cards SET binder = 'unsorted' WHERE binder IS NULL;

-- 3. Enforce NOT NULL after backfill
ALTER TABLE cards ALTER COLUMN binder SET NOT NULL;

-- 4. Drop the old single-column PK constraint
ALTER TABLE cards DROP CONSTRAINT cards_pkey;

-- 5. Recompute the composite id column to include binder, e.g.
--    `${setCode}-${collectorNumber}-${foil}-${condition}-${binder}`
UPDATE cards SET id = id || '-unsorted';  -- backfill rows have known suffix

-- 6. Re-add PK on the new id (still single-column TEXT, but now binder-aware)
ALTER TABLE cards ADD CONSTRAINT cards_pkey PRIMARY KEY (id);

-- 7. Optional: index on (set_code, collector_number, foil, condition) so the
--    storefront aggregation (sum quantity across binders) is fast.
CREATE INDEX cards_buyer_facing_idx ON cards (set_code, collector_number, foil, condition);
```

**Important nuance:** the existing `cards.id` is a **single text column** holding a composite *string* (`${setCode}-${collectorNumber}-${foil}-${condition}`), not a true composite PK. So this is structurally an **id-format change**, not a `PRIMARY KEY (a, b, c)` reshape. That makes step 4 simple (drop is on `id`'s implicit PK, which never changes), and step 5 is the real work. Drizzle-kit issues #3496/#3117 do **not** apply to this case directly — but the safe pattern is still "custom migration, not auto-generated", because drizzle-kit cannot infer the `id ||= '-' || binder` data-rewrite step.

The neon-http driver routes `db.batch([...])` through Neon's HTTP transaction endpoint, so this migration can run as a single atomic batch from a one-off script (the project already uses `db.batch()` in `replaceAllCards` for atomic destructive writes — same pattern).

**See:** [Drizzle Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations), [Issue #3496](https://github.com/drizzle-team/drizzle-orm/issues/3496).

**Confidence:** HIGH (verified against installed drizzle-orm 0.45.2, installed drizzle-kit 0.31.10, and the existing `replaceAllCards` batch pattern in `src/db/queries.ts:809`).

---

### 2. Manabox npm package — does one exist?

**Answer: NO. Extend the existing handwritten parser.**

There is **no published npm package** that parses Manabox CSV exports. WebSearch returned only:

- [`StepKie/MtgCsvHelper`](https://github.com/StepKie/MtgCsvHelper) — C# CLI converter, not a JS lib
- [`sboulema/ManaBoxImporter`](https://github.com/sboulema/ManaBoxImporter) — converts Arena -> ManaBox, not a parser
- [`d0ngl3md/Manabox2TCGP`](https://github.com/d0ngl3md/Manabox2TCGP) — a personal Python script

Manabox itself does not publish a parser. The CSV format is documented loosely on [the Manabox import/export guide](https://www.manabox.app/guides/collection/import-export/) but column sets vary by collection layout, which is exactly why the existing parser is defensive (it tolerates extra/missing columns via PapaParse's header mode).

**What to do:** extend `src/lib/types.ts:ManaboxRow` with two new optional fields:

```typescript
export interface ManaboxRow {
  // ... existing fields ...
  "Binder Name"?: string;
  "Binder Type"?: string;  // e.g., "binder", "list" — used to skip non-binder rows
}
```

And extend `rowToCardOrSkip` in `src/lib/csv-parser.ts` to:
- Skip rows where `Binder Type !== "binder"` with a new `SkippedRow.reason` of `"non-binder row"`.
- Default missing `Binder Name` to `"unsorted"` (matches the migration backfill).
- Append `binder` to the composite `id` so the same card in two binders becomes two rows.

The merge step (`mergeCards`) **automatically does the right thing** — same id ⇒ sum, different id ⇒ separate rows — once the id includes binder.

**Confidence:** HIGH (no published package found; PapaParse already supports unknown extra headers).

---

### 3. UI primitive for "multi-select with row counts" — reuse or hand-roll?

**Answer: hand-roll. The project's established pattern is native `<input type="checkbox">` + Tailwind, used in 4 places already.**

Audit of existing checkbox usage in the repo:

| File | Pattern |
|------|---------|
| `src/components/filter-rail.tsx:202` | Color/rarity multi-select with counts |
| `src/app/admin/_components/inventory-table.tsx:85` | Header "select all" |
| `src/app/admin/_components/inventory-table.tsx:692` | Per-row select |
| `src/app/admin/orders/_components/order-detail.tsx:334` | Status checkbox |

`filter-rail.tsx` is **already** "multi-select with counts" — it renders a row per option (color/rarity) with a count badge. The binder picker is the same component shape with a different data source (binder name + parsed-row count from the preview payload). Copy that pattern.

**Adding a UI primitive library now (Headless UI, Radix, cmdk, react-select) would:**
1. Inject a new dependency for one feature.
2. Diverge from the established hand-rolled style across 4 existing files.
3. Pull in client JS the storefront doesn't need.

**Recommendation:** add a new `src/app/admin/import/_components/binder-picker.tsx` that mirrors the structure of `filter-rail.tsx`. Selection persists via a `useBinderImportStore` zustand slice (zustand@5.0.12 is already pinned; `persist` middleware ships with it), satisfying "selection is remembered between imports".

**Confidence:** HIGH (verified by grep of `src/` for `type="checkbox"` and confirmation no UI primitive lib is in `package.json`).

---

### 4. Anything else the milestone needs that ISN'T in the stack?

**Answer: nothing.**

I checked each v1.3 target feature from PROJECT.md against the installed stack:

| v1.3 Feature | Required Tech | Status |
|--------------|---------------|--------|
| Manabox parser ingests `Binder Name` / `Binder Type` | papaparse@5.5.3 + extend `ManaboxRow` | Already installed. Two new optional type fields. |
| Composite ID gains `binder` dimension | text PK rebuild | Custom drizzle migration (Q1). No version bump. |
| Import preview shows binder picker | React + Tailwind + zustand | All installed. Hand-roll component. |
| Selection remembered between imports | zustand `persist` middleware | Ships with zustand@5.0.12 — no install. |
| Replace semantics scoped to selected binders | drizzle `.delete().where(inArray(binder, selected))` + `db.batch()` | drizzle-orm@0.45.2 supports `inArray` + `eq` predicates on the cards table. Same atomic batch as existing `replaceAllCards`. |
| Storefront aggregates quantity across binders | drizzle `sum(quantity).groupBy(...)` | drizzle-orm@0.45.2 supports `sum` aggregate + `groupBy`. |
| Server-side binder allocator at checkout commit | Pure TS function | No new deps. Vitest tests are the safety net. |
| One buyer line -> multiple `order_items` rows | Existing `order_items` table accepts N rows per `orderId` | Schema already supports it (`order_items.id` is `generatedAlwaysAsIdentity()`, not unique on cardId). Zero schema change to `order_items`. |
| Admin order detail `[binder]` annotation per line | Add `binder text` column to `order_items` (denormalized snapshot, like `setName`/`condition`) | One additive `ALTER TABLE order_items ADD COLUMN binder text` — drizzle-kit generates this correctly. Backfill existing rows with `'unsorted'`. |
| Admin inventory table "Binder" column + filter | Existing inventory-table.tsx pattern + new column | No new deps. |
| Backfill existing rows with `binder = 'unsorted'` | Custom migration (covered in Q1) | Step 2 of the migration. |
| New `Foil` value `etched` | Schema change | **See gotcha below.** |

#### Gotcha: the `etched` finish

PROJECT.md says "New `Foil` value `etched` becomes a finish enum value", but:

- The current schema (`src/db/schema.ts:44`) declares `foil: boolean("foil").notNull().default(false)` — **a boolean, not an enum**.
- The current `ManaboxRow.Foil` type (`src/lib/types.ts:11`) is `"foil" | "normal"` — also not an enum.
- The current `csv-parser.ts:87` reads `const foil = row.Foil === "foil"` — boolean coercion.
- The `cards.id` composite includes `foil ? "foil" : "normal"`.

To support `etched` you must either:

**Option A (minimal): keep boolean + add `finish` text column.**
- Add `finish text not null default 'normal'` to `cards`. Values: `"normal" | "foil" | "etched"`.
- Keep `foil` boolean for backward compat (or drop it after migration; `foil = (finish !== 'normal')`).
- Composite id becomes `${setCode}-${collectorNumber}-${finish}-${condition}-${binder}`.
- Parser: `const finish = row.Foil ?? "normal"` (Manabox's `Foil` column already emits the string `"etched"` for etched-foil cards in many layouts; the existing `ScryfallCard` type in `src/lib/types.ts:91` already destructures `usd_etched`, so the project's enrichment flow has been *partially* etched-aware all along).

**Option B (idiomatic): introduce `pgEnum("finish", ["normal", "foil", "etched"])` like `orderStatusEnum`.**
- Cleaner but enum changes in Postgres are not auto-handled by drizzle-kit (must use `ALTER TYPE finish ADD VALUE 'etched'` if extending later). For three known values today this is fine.

Both options use existing tech (no new deps). **Recommendation: Option A** — text column `finish` with a TS string-literal-union validator. It mirrors the existing `cards.condition text` pattern (which is also a free-form string, not a pgEnum, and has worked fine for 5 conditions). Lower migration risk and easier to extend if Manabox adds more finish values later.

**Confidence:** HIGH for Option A; MEDIUM for whether Manabox emits the literal string `"etched"` in the Foil column (could not find a published spec — recommend a manual verification step early in the milestone: have the operator export one binder containing an etched-foil card and inspect the CSV).

---

## Installation

```bash
# Nothing.
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom drizzle migration (manual SQL) for the binder PK change | `drizzle-kit generate` | Never — known bugs (#3496, #3117) and drizzle-kit cannot infer the `id ||= '-' || binder` data rewrite. Custom is the only correct path. |
| Extend handwritten `csv-parser.ts` | Adopt a CSV-schema validator like `csv-parser-schema` or `zod-csv` | Only if validation needs grow — but the existing `rowToCardOrSkip` already does per-row validation with structured `SkippedRow` reasons. Adding zod-csv would duplicate the existing pattern. |
| Native `<input type="checkbox">` + Tailwind for binder picker | Headless UI, Radix Primitives, cmdk | Only if you ever build a *combobox* or *command palette*. A flat checkbox list with counts is the wrong shape for those libs. |
| `db.batch([...])` for selective per-binder replace | drizzle `.transaction()` | The neon-http driver **does not support interactive transactions** — `node_modules/drizzle-orm/neon-http/session.js` throws `"No transactions support in neon-http driver"` (already documented in `src/db/queries.ts:798`). `db.batch()` is the only atomic option on this stack. |
| Text column `finish` ('normal'/'foil'/'etched') | `pgEnum("finish", [...])` | Use pgEnum if you want compile-time safety in raw SQL too. Postgres enum extension (`ALTER TYPE ... ADD VALUE`) is a one-statement migration and is well-supported. Either choice is fine; text matches the existing `cards.condition` pattern. |
| Hand-built allocator (pure TS function) | Library like `linear-programming-js` or `glpk.js` | Never — the allocator is "iterate sorted source rows, decrement until line quantity is satisfied". This is ~30 lines of TS with deterministic ordering. LP libraries are 100x overkill for a deterministic greedy split. |
| zustand `persist` for binder selection | localStorage direct, sessionStorage, cookies | zustand persist already wraps localStorage with hydration safety. Already pinned. Use it. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `drizzle-kit generate` for the PK/id-format change | Issues #3496 and #3117 — generated SQL is broken for PK changes; cannot express data-rewrite of `id` | `drizzle-kit generate --custom` (empty migration) and write the SQL by hand. Run via `drizzle-kit migrate`. |
| `db.transaction(...)` anywhere new in v1.3 | Throws on neon-http driver | `db.batch([...])` — already the codebase pattern (`src/db/queries.ts:801`) |
| Adding Headless UI / Radix / cmdk for the binder picker | Diverges from 4 existing native-checkbox files; injects client JS | Native `<input type="checkbox">` + Tailwind, mirroring `src/components/filter-rail.tsx` |
| Adding a CSV-schema lib (zod-csv, csv-parser-schema) | Duplicates the existing `rowToCardOrSkip` validator + `SkippedRow` reason machinery | Extend the existing `rowToCardOrSkip` with two new branches: missing `Binder Name`, non-binder `Binder Type` |
| Bumping next, react, drizzle-orm, drizzle-kit, papaparse, vitest, next-auth, neondatabase, zustand | Risks breaking 28 passing test files; no v1.3 feature requires it | Stay pinned. Only bump if a security CVE forces it (none currently known). |
| New `RATE_LIMIT_BUCKETS.ADMIN_BINDER` bucket | Reuses are cheaper than new buckets — and the per-binder commit is the same operational shape as a full commit | `RATE_LIMIT_BUCKETS.ADMIN_BULK` already covers `/api/admin/import/commit` and applies cleanly to per-binder commits |
| Logging the full `selectedBinders` array verbatim if it could ever be large | The structured logger has deep redaction but no length cap on arrays in user-supplied positions | Log `selectedBinders.length` always; log `selectedBinders` only if `<= 20`. Mirrors the existing `truncateAuditString` defensive pattern in `src/db/queries.ts:241` |

---

## Stack Patterns by Variant

**If the operator imports a Manabox CSV with no binder columns (legacy export):**
- Treat all rows as `binder = "unsorted"` and `Binder Type = "binder"` (skip nothing).
- This makes the v1.3 parser **backward-compatible** with existing v1.2 import flows — same code path, default values fill in.

**If the operator imports a CSV containing rows with `Binder Type != "binder"` (e.g., wishlist, trade list):**
- Skip with `SkippedRow.reason = "non-binder row"` and surface in the existing skipped-rows zone of the preview UI. No new UI surface required.

**If a buyer's line quantity exceeds the sum across all binder rows for that card:**
- Existing `StockConflict` (`src/lib/types.ts:110`) and `409` response from `/api/checkout` already covers oversold detection. Allocator runs **after** the existing oversold check in the same transaction batch — never run allocator on an oversold line.

**If two binders have an identical card and the operator deselects one mid-import:**
- The selective replace deletes only `WHERE binder IN (selected)` — untouched binder rows remain. Storefront aggregation re-sums on next read. No cache invalidation needed (current code reads from DB on every page render).

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| drizzle-orm@0.45.2 | drizzle-kit@0.31.10 | Already in lockstep in this repo. Both must be bumped together if ever upgraded — drizzle-kit emits SQL its companion ORM expects. |
| drizzle-orm/neon-http | @neondatabase/serverless@1.0.2 | Wired in `src/db/index.ts` (assumed). The "no interactive transactions" constraint is a property of the **driver pair**, not just one. |
| papaparse@5.5.3 | @types/papaparse@5.5.2 | Type defs lag the runtime by minor patch; harmless for header-mode parsing of new optional headers. |
| zustand@5.0.12 | React 19.2.4 | zustand 5.x is the React 19-compatible line. `persist` middleware ships in the same package. |
| next@16.2.2 | next-auth@5.0.0-beta.30 | Already wired through Auth.js v5; v1.3 adds no new auth surface. |

---

## Sources

- **Existing repo audit** (HIGH confidence — direct file reads):
  - `package.json` — pinned versions
  - `src/db/schema.ts` — current schema (boolean `foil`, single-column text PK)
  - `src/db/queries.ts:736-846` — existing `db.batch()` and `replaceAllCards` patterns
  - `src/lib/csv-parser.ts` — handwritten Manabox parser, `rowToCardOrSkip` pattern, `mergeCards`
  - `src/lib/types.ts` — `ManaboxRow`, `Card`, `StockConflict` types; note `ScryfallCard.prices.usd_etched` already exists
  - `src/lib/import-contract.ts` — preview/commit message contract
  - `src/app/api/admin/import/commit/route.ts` — rate-limit/audit/import-history wiring
  - `src/components/filter-rail.tsx`, `src/app/admin/_components/inventory-table.tsx`, `src/app/admin/orders/_components/order-detail.tsx` — existing checkbox UI pattern (4 hits)
  - `node_modules/drizzle-orm/package.json` — confirmed 0.45.2
  - `node_modules/drizzle-kit/package.json` — confirmed 0.31.10
- [Drizzle ORM Custom Migrations docs](https://orm.drizzle.team/docs/kit-custom-migrations) — workaround pattern for unsupported DDL (HIGH)
- [Drizzle ORM Batch API docs](https://orm.drizzle.team/docs/batch-api) — confirms atomic batched DELETE+INSERT with neon-http (HIGH)
- [Drizzle ORM Migrations overview](https://orm.drizzle.team/docs/migrations) — confirms `drizzle-kit generate --custom` flow (HIGH)
- [GitHub Issue #3496 — PK migration fails](https://github.com/drizzle-team/drizzle-orm/issues/3496) — known PK-change codegen bug (MEDIUM — issue exists; fix status not confirmed for 0.31.10)
- [GitHub Issue #3117 — adding column as PK generates broken migration](https://github.com/drizzle-team/drizzle-orm/issues/3117) — second PK-related bug class (MEDIUM)
- [Manabox import/export guide](https://www.manabox.app/guides/collection/import-export/) — confirms binder/list info is included in exports; column names not formally specified (MEDIUM)
- WebSearch for `npm "manabox" csv parser` — **no published JS/TS package found** (HIGH — exhaustive search returned only C# / Python / personal scripts)

---

*Stack research for: Subsequent milestone v1.3 — binder-aware inventory & pick workflow*
*Researched: 2026-05-10*
*Bottom line for downstream consumers (roadmapper / planner): no `npm install` step belongs in the v1.3 roadmap. Plan phases around (1) custom Drizzle migration for binder + finish + id-format change, (2) parser extension, (3) selective per-binder commit, (4) allocator, (5) UI wiring (binder picker + admin column + order-detail annotation). Reuse `db.batch()`, `requireAdmin()`, `enforceRateLimit({ ADMIN_BULK })`, `logEvent`, `admin_audit_log`, `import_history`, native `<input type="checkbox">`, and zustand `persist`.*
