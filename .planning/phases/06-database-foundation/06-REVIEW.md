---
phase: 06-database-foundation
reviewed: 2026-04-11T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/db/schema.ts
  - src/db/client.ts
  - src/db/seed.ts
  - src/db/__tests__/schema.test.ts
  - src/db/__tests__/seed.test.ts
  - drizzle.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-11T12:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The database foundation layer introduces a Drizzle ORM schema for three tables (cards, orders, order_items), a database client module, a seed script, and supporting tests/config. The schema design is solid -- composite text PKs, integer-cents pricing, proper use of enums, cascading deletes, and well-chosen indexes. The seed script includes thorough verification logic (ID-level checks, not just row counts).

Key concerns: the database client will crash at import time if `DATABASE_URL` is missing (critical for any build/test scenario that imports db modules transitively), the seed script's direct-run detection is fragile, and the `drizzle.config.ts` will throw at module load if the env var is absent.

## Critical Issues

### CR-01: Database client crashes at import time when DATABASE_URL is unset

**File:** `src/db/client.ts:4`
**Issue:** The module calls `drizzle(process.env.DATABASE_URL!)` at the top level. The non-null assertion (`!`) silences TypeScript, but if `DATABASE_URL` is undefined at runtime, `drizzle()` receives `undefined` and will throw an unhandled error. Because this is a top-level side effect, _any_ module that transitively imports `db` (e.g., a server component, an API route, a test file) will crash during module loading. This is especially dangerous during `next build` in CI/CD where database connectivity may not be available, or when running unit tests that do not need a real database connection.
**Fix:** Guard the instantiation or use lazy initialization:
```typescript
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb(): NeonHttpDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Ensure .env.local is loaded or the environment variable is configured."
    );
  }
  return drizzle(url, { schema });
}

// Lazy singleton: connection is created on first access, not at import time
let _db: NeonHttpDatabase<typeof schema> | null = null;
export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Re-export for backward compat if needed, but prefer getDb()
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
```
A simpler alternative if the project only uses `db` in server contexts: add a runtime guard with a clear error message instead of the `!` assertion, so failures are diagnosable rather than cryptic.

## Warnings

### WR-01: Fragile direct-run detection in seed script

**File:** `src/db/seed.ts:152-154`
**Issue:** The `isDirectRun` check uses `process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js")`. This will fail if the script is invoked via an absolute path with a different suffix (e.g., through `tsx` or `ts-node` wrappers that may mangle argv), or if the compiled output lands in a different filename. It also matches any file ending in `seed.ts` regardless of directory.
**Fix:** Use a more robust pattern, or restructure so the seed function is exported and a separate entry-point file calls it:
```typescript
// Option A: Match on the full resolved path
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] === __filename;

// Option B: Export seed() and create a bin/seed.ts entry point
// src/db/seed.ts -- just export { seed, cardToRow }
// scripts/seed.ts -- import { seed } from "../src/db/seed"; seed();
```

### WR-02: drizzle.config.ts crashes on missing DATABASE_URL without useful message

**File:** `drizzle.config.ts:12`
**Issue:** `url: process.env.DATABASE_URL!` uses a non-null assertion. If a developer runs `npx drizzle-kit generate` without `.env.local` configured, they get a cryptic error from the Drizzle driver rather than a clear message about the missing env var.
**Fix:** Add a guard before the config export:
```typescript
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create .env.local with DATABASE_URL=your_connection_string"
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

### WR-03: Seed script does not handle JSON parse errors gracefully

**File:** `src/db/seed.ts:51`
**Issue:** `JSON.parse(raw)` will throw a raw `SyntaxError` if `cards.json` is malformed (e.g., truncated write, encoding issue). The error is caught by the top-level `.catch()` on line 160, but the message "Seed failed: SyntaxError: Unexpected end of JSON input" gives no indication that the problem is with `cards.json` specifically. Given that this file is generated by another pipeline step, parse failures are a realistic scenario.
**Fix:** Wrap the parse in a try-catch with context:
```typescript
let cardData: CardData;
try {
  cardData = JSON.parse(raw);
} catch (err) {
  console.error(`ERROR: Failed to parse ${jsonPath}:`, err);
  process.exit(1);
}
```

## Info

### IN-01: `as any` type assertion in test file

**File:** `src/db/__tests__/schema.test.ts:50`
**Issue:** `(columns as any).deletedAt` uses a type assertion. While acceptable in tests, this could be replaced with a type-safe check using `Object.keys(columns).includes("deletedAt")` or an `in` operator check.
**Fix:**
```typescript
it("has no deletedAt column (D-06 hard delete)", () => {
  expect("deletedAt" in columns).toBe(false);
});
```

### IN-02: Seed script creates a separate drizzle instance instead of reusing client

**File:** `src/db/seed.ts:37`
**Issue:** The `seed()` function creates its own `drizzle(process.env.DATABASE_URL!)` instance rather than importing from `./client`. This is intentional (seed is a standalone CLI script with its own dotenv loading), but it duplicates the connection creation pattern and the non-null assertion issue noted in CR-01. If the client module is later refactored to add connection pooling or middleware, the seed script will not benefit.
**Fix:** No immediate action required. This is a minor maintainability note. If/when the client module gains a more robust initialization pattern per CR-01, consider having the seed script reuse it.

---

_Reviewed: 2026-04-11T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
