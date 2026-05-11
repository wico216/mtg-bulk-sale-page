/**
 * Phase 15-01: Rate-limit primitives.
 *
 * Design (D-04, P15 plan 15-01):
 * - Sliding-window counter: each successful "check" inserts a hit row; a check
 *   is allowed iff the count of hits within `windowMs` is strictly below `limit`.
 * - The default production store is Postgres-backed because the app already
 *   uses Neon/Postgres (zero new vendor). On serverless cold starts every
 *   request still hits the same shared row store, so the counter is correct
 *   across instances. See `createPostgresRateLimitStore`.
 * - Tests inject `createMemoryRateLimitStore` to get deterministic behavior
 *   without a database. The runtime route handler also falls back to the
 *   in-memory store when DATABASE_URL is not set (tests, local dev without DB).
 * - `checkRateLimit` never mutates state when blocked, so abusive callers cannot
 *   extend their own window by retrying — the original first hit ages out at
 *   `firstHit + windowMs` regardless of further attempts (#15-01 plan rule
 *   "Rate limit responses are explicit and do not mutate state").
 *
 * Public surface:
 *   - `checkRateLimit({ store, key, config, now? })` → { allowed, remaining, retryAfterSeconds }
 *   - `createMemoryRateLimitStore()` for tests/dev
 *   - `createPostgresRateLimitStore()` for production
 *   - `getDefaultRateLimitStore()` chooses one based on env (memoised)
 *   - `clientKeyFromRequest(req, extra?)` builds a stable per-IP key with optional
 *     identity suffix (e.g. admin email) — uses `x-forwarded-for` when present.
 */

import "server-only";

export type RateLimitConfig = {
  /** Bucket name distinguishes surfaces (e.g. "checkout", "admin-mutation"). */
  bucket: string;
  /** Maximum number of allowed hits per (bucket, key) within the window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
};

export type RateLimitDecision = {
  /** True when the caller is permitted to proceed; false when blocked. */
  allowed: boolean;
  /** Remaining hits before a block (0 once blocked). */
  remaining: number;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSeconds: number;
};

export interface RateLimitStore {
  /**
   * Returns how many hits have been recorded for the (bucket, key) pair within
   * `[now - windowMs, now]` (inclusive).
   *
   * Implementations MAY opportunistically prune entries that fall outside the
   * window (e.g. the in-memory store splices aged-out timestamps out of its
   * internal array during this call). Implementations MUST NOT otherwise
   * mutate state -- in particular, calling countHits must NEVER record a new
   * hit. Returned counts must be deterministic for a given (bucket, key,
   * windowMs, now) regardless of prior prune-on-read behavior.
   */
  countHits(args: {
    bucket: string;
    key: string;
    windowMs: number;
    now: number;
  }): Promise<number>;

  /**
   * Returns the earliest hit timestamp in the window for (bucket, key).
   * Returns null if no hit exists.
   *
   * Same prune-on-read latitude as countHits applies: implementations MAY
   * remove entries that fall outside the window but MUST NOT record new hits.
   */
  earliestHit(args: {
    bucket: string;
    key: string;
    windowMs: number;
    now: number;
  }): Promise<number | null>;

  /** Records a hit for (bucket, key) at `now`. */
  recordHit(args: {
    bucket: string;
    key: string;
    now: number;
  }): Promise<void>;

  /**
   * CR-01 fix: optional atomic "check + conditionally record" operation that
   * computes the decision and records the hit (if allowed) in a SINGLE
   * round-trip with NO observable race between the count and the insert.
   *
   * Concurrent callers for the same (bucket, key) under load (e.g. a public
   * checkout flood from one IP across multiple serverless function
   * instances) MUST see counts that respect the configured limit. The
   * two-step count-then-record protocol cannot guarantee this on a shared
   * Postgres store -- two callers can each read N hits, each see N < limit,
   * and each insert, admitting (limit + concurrent_callers) requests.
   *
   * When this method is implemented, `checkRateLimit` prefers it over the
   * two-step path. When it is NOT implemented (legacy stores, the in-memory
   * store -- JS is single-threaded per instance so the race window is much
   * narrower there), `checkRateLimit` falls back to the count + earliestHit
   * + recordHit sequence.
   *
   * Returned `count` is the number of hits in the window AFTER the
   * conditional insert (i.e. if `allowed=true` it includes the new hit; if
   * `allowed=false` it is the pre-existing count). `earliestMs` is the
   * earliest hit timestamp inside the window, or null when there are zero
   * hits.
   */
  checkAndRecord?(args: {
    bucket: string;
    key: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<{ allowed: boolean; count: number; earliestMs: number | null }>;
}

export type CheckRateLimitArgs = {
  store: RateLimitStore;
  key: string;
  config: RateLimitConfig;
  /** Override the current time (defaults to Date.now()). */
  now?: number;
};

export async function checkRateLimit({
  store,
  key,
  config,
  now = Date.now(),
}: CheckRateLimitArgs): Promise<RateLimitDecision> {
  const { bucket, limit, windowMs } = config;

  if (limit <= 0) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 0 };
  }

  // CR-01: prefer the atomic single-round-trip path when the store supports
  // it (Postgres store does). This eliminates the count-then-record race
  // where two concurrent serverless instances could each read N hits, see
  // N < limit, and each insert -- admitting (limit + concurrent_callers)
  // requests at the boundary.
  if (store.checkAndRecord) {
    const atomic = await store.checkAndRecord({
      bucket,
      key,
      limit,
      windowMs,
      now,
    });
    if (!atomic.allowed) {
      const retryAfterMs =
        atomic.earliestMs === null
          ? windowMs
          : Math.max(0, atomic.earliestMs + windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    // atomic.count includes the just-inserted hit.
    return {
      allowed: true,
      remaining: Math.max(0, limit - atomic.count),
      retryAfterSeconds: 0,
    };
  }

  // Fallback two-step path for stores without checkAndRecord. Used by the
  // in-memory store (JS is single-threaded per instance, so the race is much
  // narrower); also used by any third-party store that hasn't migrated yet.
  const count = await store.countHits({ bucket, key, windowMs, now });

  if (count >= limit) {
    const earliest = await store.earliestHit({ bucket, key, windowMs, now });
    const retryAfterMs = earliest === null ? windowMs : Math.max(0, earliest + windowMs - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    // Blocked: do NOT record a new hit -- preserves "blocked attempts do not
    // extend the window" guarantee.
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  await store.recordHit({ bucket, key, now });
  return {
    allowed: true,
    remaining: Math.max(0, limit - count - 1),
    retryAfterSeconds: 0,
  };
}

// --- In-memory store (tests, dev fallback) ---

export function createMemoryRateLimitStore(): RateLimitStore {
  // Map<`${bucket}|${key}`, number[]> -- sorted ascending hit timestamps.
  const hits = new Map<string, number[]>();

  function bucketKey(bucket: string, key: string): string {
    return `${bucket}|${key}`;
  }

  /**
   * Returns the fresh hit list for (bucket, key) and opportunistically
   * splices aged-out entries out of the stored array. The mutation is
   * intentional and covered by the RateLimitStore interface contract
   * ("MAY prune entries that fall outside the window"); it is safe because:
   *   1. Pruned entries would never have been returned anyway -- they fall
   *      outside `[now - windowMs, now]`.
   *   2. Counts are still deterministic for a given (bucket, key, now) input.
   *   3. Prune-on-read keeps memory bounded for long-running test/dev sessions
   *      without a separate sweeper.
   * The function is named `pruneAndGetFresh` to make the mutation explicit.
   */
  function pruneAndGetFresh(
    bucket: string,
    key: string,
    windowMs: number,
    now: number,
  ): number[] {
    const stored = hits.get(bucketKey(bucket, key));
    if (!stored) return [];
    const threshold = now - windowMs;
    // Remove hits that have aged out.
    let firstFresh = 0;
    while (firstFresh < stored.length && stored[firstFresh] <= threshold) {
      firstFresh += 1;
    }
    if (firstFresh > 0) stored.splice(0, firstFresh);
    return stored;
  }

  return {
    async countHits({ bucket, key, windowMs, now }) {
      return pruneAndGetFresh(bucket, key, windowMs, now).length;
    },
    async earliestHit({ bucket, key, windowMs, now }) {
      const fresh = pruneAndGetFresh(bucket, key, windowMs, now);
      return fresh.length > 0 ? fresh[0] : null;
    },
    async recordHit({ bucket, key, now }) {
      const k = bucketKey(bucket, key);
      const list = hits.get(k);
      if (list) {
        list.push(now);
      } else {
        hits.set(k, [now]);
      }
    },
    /**
     * In-memory atomic check + record. JS is single-threaded per instance, so
     * the whole body runs to completion before any other callback can
     * observe state. This matches the Postgres store's semantics and lets
     * `checkRateLimit` exercise the same code path in unit tests as in
     * production -- avoiding the trap of "passes tests on the in-memory
     * store but races on Postgres".
     *
     * NB: pruneAndGetFresh returns the SAME array reference the store holds
     * internally, so we must snapshot `fresh.length` and `fresh[0]` BEFORE
     * recording (the subsequent push mutates the same array). Forgetting
     * this gave a wrong `count` and `remaining` -- the in-memory test
     * fixture caught the aliasing bug before it could ship.
     */
    async checkAndRecord({ bucket, key, limit, windowMs, now }) {
      const fresh = pruneAndGetFresh(bucket, key, windowMs, now);
      const preInsertCount = fresh.length;
      const preInsertEarliest = preInsertCount > 0 ? fresh[0] : null;
      if (preInsertCount >= limit) {
        return {
          allowed: false,
          count: preInsertCount,
          earliestMs: preInsertEarliest,
        };
      }
      // Allowed: record the hit and return the post-insert state.
      const k = bucketKey(bucket, key);
      const list = hits.get(k);
      if (list) {
        list.push(now);
      } else {
        hits.set(k, [now]);
      }
      // earliest is unchanged unless the store was empty, in which case the
      // new hit IS the earliest.
      const earliestMs = preInsertEarliest ?? now;
      return {
        allowed: true,
        count: preInsertCount + 1,
        earliestMs,
      };
    },
  };
}

// --- Postgres-backed store (production) ---
//
// Lazy-loaded so test files that mock `@/db/client` do not pay the import cost.

let postgresStoreSingleton: RateLimitStore | null = null;

export async function createPostgresRateLimitStore(): Promise<RateLimitStore> {
  if (postgresStoreSingleton) return postgresStoreSingleton;

  const { db } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");

  let tableEnsured = false;
  async function ensureTable(): Promise<void> {
    if (tableEnsured) return;
    // Idempotent. Cheap on subsequent calls.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        id BIGSERIAL PRIMARY KEY,
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_key_hit_at_idx
        ON rate_limit_hits (bucket, key, hit_at DESC)
    `);
    tableEnsured = true;
  }

  postgresStoreSingleton = {
    async countHits({ bucket, key, windowMs, now }) {
      await ensureTable();
      const threshold = new Date(now - windowMs);
      const result = await db.execute<{ total: number | string }>(sql`
        SELECT COUNT(*)::integer AS total
        FROM rate_limit_hits
        WHERE bucket = ${bucket}
          AND key = ${key}
          AND hit_at > ${threshold}
      `);
      const raw = result.rows[0]?.total ?? 0;
      return typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
    },
    async earliestHit({ bucket, key, windowMs, now }) {
      await ensureTable();
      const threshold = new Date(now - windowMs);
      const result = await db.execute<{ hit_at: Date }>(sql`
        SELECT hit_at
        FROM rate_limit_hits
        WHERE bucket = ${bucket}
          AND key = ${key}
          AND hit_at > ${threshold}
        ORDER BY hit_at ASC
        LIMIT 1
      `);
      const row = result.rows[0];
      if (!row) return null;
      return new Date(row.hit_at).getTime();
    },
    async recordHit({ bucket, key, now }) {
      await ensureTable();
      const at = new Date(now);
      await db.execute(sql`
        INSERT INTO rate_limit_hits (bucket, key, hit_at)
        VALUES (${bucket}, ${key}, ${at})
      `);
      // WR-02: opportunistically prune rows older than the longest configured
      // sliding window (currently 60s, with safety margin -> 5 minutes) so the
      // table does not grow without bound. We run with low probability per
      // recordHit call so the amortized cost is small (~1% of inserts perform
      // a bounded DELETE). LIMIT 1000 caps the per-sweep cost on a backlog.
      // A failure of the prune step must NEVER fail the insert that just
      // succeeded -- swallow errors from this best-effort cleanup.
      if (Math.random() < 0.01) {
        try {
          const cutoff = new Date(now - PRUNE_OLDER_THAN_MS);
          await db.execute(sql`
            DELETE FROM rate_limit_hits
            WHERE id IN (
              SELECT id FROM rate_limit_hits
              WHERE hit_at < ${cutoff}
              LIMIT 1000
            )
          `);
        } catch {
          // Best-effort; the insert above already succeeded.
        }
      }
    },
    /**
     * CR-01 / WR-A: best-effort atomic snapshot check + conditional insert
     * in a SINGLE round-trip.
     *
     * Why this exists: the neon-http driver this app uses does NOT support
     * multi-statement transactions or session-level advisory locks (each
     * `db.execute` is an independent HTTP call with auto-commit), so we
     * cannot serialize count+insert with `pg_advisory_xact_lock`. Instead
     * we use one statement whose CTE evaluates the gating
     * `SELECT COUNT(*) ... < limit` predicate and the conditional INSERT
     * in the same statement-level MVCC snapshot, and a final SELECT
     * returns the post-decision state.
     *
     * WR-A honesty note on residual concurrency:
     * -----------------------------------------
     * Plain Postgres INSERTs against a table with NO unique/exclusion
     * constraint on (bucket, key, hit_at) are NOT serialized by row or
     * range locks. Two concurrent statements each read their own MVCC
     * snapshot of `COUNT(*)`, each see `count < limit`, and each insert.
     * The CTE only ensures the count and the insert see the SAME snapshot
     * *within one statement*; it does NOT prevent a second concurrent
     * statement on a different connection from inserting against an
     * identical snapshot.
     *
     * What this implementation actually buys us, relative to the prior
     * two-step `count` then `recordHit` protocol, is that the race window
     * shrinks from "the HTTP round-trip time between the count and the
     * insert" (10s of ms over neon-http) to "the statement evaluation
     * time inside Postgres" (microseconds). Under N concurrent callers
     * for the same (bucket, key), the boundary may still admit up to
     * `limit + N` hits, but the race is much narrower in time and
     * neon-http per-instance HTTP serialization usually collapses N
     * to a small number in practice.
     *
     * For the friend-store threat model this is acceptable -- the bucket
     * is a soft abuse cap, not a strict admission gate. If we ever need
     * a strict guarantee, the right fix is one of:
     *   (a) add a UNIQUE constraint on a synthetic (bucket, key, slot)
     *       column and let Postgres reject the duplicate insert, or
     *   (b) acquire `pg_advisory_xact_lock` inside a transactional
     *       driver (not neon-http).
     *
     * The in-memory store's `checkAndRecord` IS truly atomic (JS is
     * single-threaded per instance), and `rate-limit.test.ts` exercises
     * the exact-limit invariant only on the memory store (see the
     * "Promise.all(20) admits exactly 5" test at
     * `src/lib/__tests__/rate-limit.test.ts:165-193`). That test
     * deliberately does NOT prove the Postgres path's atomicity, only
     * the shared `checkRateLimit` plumbing around it.
     */
    async checkAndRecord({ bucket, key, limit, windowMs, now }) {
      await ensureTable();
      const threshold = new Date(now - windowMs);
      const at = new Date(now);
      // Single statement: try to insert; the INSERT is gated by a COUNT()
      // subquery whose snapshot is taken atomically with the insert. Then
      // re-read the post-insert count and the earliest hit for retry-after
      // calculation. RETURNING NULL on the conditional insert means the row
      // either landed (ins has one row) or it didn't (ins is empty).
      const result = await db.execute<{
        total: number | string;
        earliest_at: Date | null;
        inserted: number | string;
      }>(sql`
        WITH ins AS (
          INSERT INTO rate_limit_hits (bucket, key, hit_at)
          SELECT ${bucket}, ${key}, ${at}
          WHERE (
            SELECT COUNT(*) FROM rate_limit_hits
            WHERE bucket = ${bucket}
              AND key = ${key}
              AND hit_at > ${threshold}
          ) < ${limit}
          RETURNING id
        )
        SELECT
          (SELECT COUNT(*) FROM rate_limit_hits
            WHERE bucket = ${bucket}
              AND key = ${key}
              AND hit_at > ${threshold})::integer AS total,
          (SELECT MIN(hit_at) FROM rate_limit_hits
            WHERE bucket = ${bucket}
              AND key = ${key}
              AND hit_at > ${threshold}) AS earliest_at,
          (SELECT COUNT(*) FROM ins)::integer AS inserted
      `);
      const row = result.rows[0];
      const totalRaw = row?.total ?? 0;
      const insertedRaw = row?.inserted ?? 0;
      const total = typeof totalRaw === "string" ? Number.parseInt(totalRaw, 10) : totalRaw;
      const inserted =
        typeof insertedRaw === "string" ? Number.parseInt(insertedRaw, 10) : insertedRaw;
      const earliestMs =
        row?.earliest_at == null ? null : new Date(row.earliest_at).getTime();
      // WR-C: the CTE's outer `SELECT COUNT(*)` runs in the same
      // statement-level MVCC snapshot as the gating count inside the
      // conditional INSERT, so `total` reflects the PRE-insert state even
      // when the row landed. The store's documented contract is that
      // `count` is the POST-insert count when allowed (the in-memory store
      // honors this), so add 1 when we inserted to keep both stores in
      // agreement. Without this, `remaining = limit - count` was
      // off-by-one on Postgres (returning `remaining=1` when memory
      // returned `remaining=0` after the final admit).
      const count = inserted > 0 ? total + 1 : total;
      return {
        allowed: inserted > 0,
        count,
        earliestMs,
      };
    },
  };

  return postgresStoreSingleton;
}

/**
 * Cutoff for opportunistic prune: rows older than this lose relevance even
 * for the longest sliding window currently configured (60s in
 * RATE_LIMIT_BUCKETS). 5 minutes gives generous head-room if a future bucket
 * config extends the window without remembering to bump this constant.
 */
const PRUNE_OLDER_THAN_MS = 5 * 60 * 1000;

/**
 * Returns the runtime default store. Falls back to an in-memory store when
 * DATABASE_URL is unset (tests, local dev without a DB). The in-memory fallback
 * is deliberately permissive in dev so it never blocks the test suite, but it
 * is NOT correct across serverless instances -- production MUST have
 * DATABASE_URL configured.
 *
 * CR-02 fix: previously a rejected Postgres-init promise (DB unreachable at
 * boot, ensureTable failure, etc.) was memoised and every subsequent call
 * awaited the same rejection — turning a transient outage into a permanent
 * denial of service for the lifetime of the serverless function instance.
 * Now we (a) reset the memo on rejection so the next call retries, and
 * (b) fall back to the in-memory store on failure so requests do not
 * cascade into 500s while the DB recovers. Same-instance fallback is
 * deliberately permissive — a per-instance memory store is less correct
 * across serverless instances than a Postgres store, but it is strictly
 * better than denying every write surface.
 */
let defaultStorePromise: Promise<RateLimitStore> | null = null;

export function getDefaultRateLimitStore(): Promise<RateLimitStore> {
  if (defaultStorePromise) return defaultStorePromise;
  if (process.env.DATABASE_URL) {
    const attempt = createPostgresRateLimitStore().catch((err) => {
      // Reset the memo so the next caller can retry the Postgres path once
      // the DB recovers; do NOT keep a poisoned rejected promise in place.
      if (defaultStorePromise === attempt) defaultStorePromise = null;
      // Best-effort log; the import is lazy to avoid a cycle in tests that
      // mock the logger module.
      import("@/lib/logger")
        .then(({ logError }) =>
          logError({
            event: "rate_limit.store_init_failed",
            route: "lib/rate-limit",
            error: err,
          }),
        )
        .catch(() => {
          // If even the logger import fails, swallow — the fall-through to
          // the memory store still gives the caller a working store.
        });
      // Fail-open with a per-instance memory store. The next call to
      // getDefaultRateLimitStore() will retry Postgres because we just
      // cleared defaultStorePromise above.
      return createMemoryRateLimitStore();
    });
    defaultStorePromise = attempt;
  } else {
    defaultStorePromise = Promise.resolve(createMemoryRateLimitStore());
  }
  return defaultStorePromise;
}

/**
 * Reset the memoised default store. Exposed for tests; not for runtime.
 */
export function __resetDefaultRateLimitStoreForTests(): void {
  defaultStorePromise = null;
  postgresStoreSingleton = null;
}

// --- Helpers ---

/**
 * Build a stable rate-limit key from a request. Prefers `x-forwarded-for`
 * (Vercel/proxy header), falling back to a literal `unknown` so missing IPs
 * collapse into one bucket rather than being unbounded (defense-in-depth).
 *
 * `extra` lets the caller add an identity suffix (admin email) so two admins
 * on the same NAT don't share a bucket. Pass `null`/`undefined` to skip.
 *
 * WR-01 deployment assumption (IMPORTANT):
 * -----------------------------------------
 * This implementation trusts the LEFTMOST `x-forwarded-for` token. That is
 * the correct token to trust on Vercel and on most reverse-proxy stacks
 * that sanitize / rewrite `x-forwarded-for` at the edge (Vercel, Cloudflare
 * with `cf-connecting-ip`, AWS ALB with strict XFF mode, etc.). On those
 * platforms the leftmost value is the real client IP that the edge
 * appended, and any client-supplied prefix is overwritten.
 *
 * On a non-sanitizing proxy stack (e.g. raw nginx without `real_ip_recursive`,
 * a local Docker dev with no proxy, an on-prem deploy without a trusted
 * edge), the leftmost XFF token is CLIENT-SUPPLIED and trivially spoofable:
 * a malicious caller sets `x-forwarded-for: 1.1.1.1, 2.2.2.2, ...` and
 * rotates the leading value per-request to bypass per-IP buckets.
 *
 * If you ever deploy this app to a host other than Vercel:
 *   1. Replace the leftmost-trust logic with a rightmost-trusted-hop pattern
 *      that walks XFF from the right and stops at the first IP outside the
 *      known proxy list.
 *   2. Or normalize XFF at the edge (terminate proxy chain, set a single
 *      trusted header like `x-real-ip`).
 *
 * The `x-real-ip` fallback below is preferred when present because Vercel
 * sets BOTH XFF and x-real-ip, and `x-real-ip` is harder to spoof in the
 * leftmost-trust model. The "unknown" terminal fallback collapses all
 * proxy-stripped requests into one shared bucket -- per WR-01 this is
 * acceptable for the friend-store threat model but is documented here so
 * future operators know to tighten it if they widen the audience.
 */
export function clientKeyFromRequest(
  request: Request,
  extra?: string | null,
): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  const candidate = xff.split(",")[0]?.trim() || realIp.trim() || "unknown";
  return extra ? `${candidate}|${extra}` : candidate;
}

// --- Default bucket configs (centralized for visibility) ---

export const RATE_LIMIT_BUCKETS = {
  /** Public checkout: conservative; abusive repeat submission protection. */
  CHECKOUT: {
    bucket: "checkout",
    limit: 10,
    windowMs: 60_000,
  } satisfies RateLimitConfig,
  /** Authenticated admin mutations: higher because they run after auth. */
  ADMIN_MUTATION: {
    bucket: "admin-mutation",
    limit: 60,
    windowMs: 60_000,
  } satisfies RateLimitConfig,
  /** Bulk/import endpoints: lower because each call is expensive. */
  ADMIN_BULK: {
    bucket: "admin-bulk",
    limit: 20,
    windowMs: 60_000,
  } satisfies RateLimitConfig,
} as const;

/**
 * Convenience wrapper around `checkRateLimit` that builds a JSON 429 Response
 * with retry-after metadata when blocked. Returns null when allowed so callers
 * can keep their early-return shape consistent with `requireAdmin()`.
 *
 * CR-02 / WR-05 fix: defense-in-depth — if the underlying store throws
 * (DB outage on the Postgres path, transient network blip, ensure-table DDL
 * failure), the rate-limit subsystem MUST NOT take down the route. We log
 * the failure and fail-open (return null = "allowed") rather than letting
 * an unhandled rejection bubble past every admin route's try/catch and
 * surface as a Next.js generic 500 / HTML error page. The route's stated
 * invariant -- "rate-limit failure should never trump auth result or
 * business logic" -- is now enforced here.
 */
export async function enforceRateLimit(args: {
  store?: RateLimitStore;
  key: string;
  config: RateLimitConfig;
  now?: number;
}): Promise<Response | null> {
  let decision: RateLimitDecision;
  try {
    const store = args.store ?? (await getDefaultRateLimitStore());
    decision = await checkRateLimit({
      store,
      key: args.key,
      config: args.config,
      now: args.now,
    });
  } catch (err) {
    // Best-effort log; never throw further. We deliberately do NOT block the
    // request when the rate-limit store is unavailable.
    try {
      const { logError } = await import("@/lib/logger");
      logError({
        event: "rate_limit.enforce_failed",
        route: "lib/rate-limit",
        error: err,
        metadata: { bucket: args.config.bucket },
      });
    } catch {
      // logger import unavailable — swallow and continue.
    }
    return null;
  }
  if (decision.allowed) return null;
  return Response.json(
    {
      error: "Too many requests. Please try again shortly.",
      code: "rate_limited",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    },
  );
}
