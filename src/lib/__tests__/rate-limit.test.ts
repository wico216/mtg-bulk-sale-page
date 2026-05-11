import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  checkRateLimit,
  createMemoryRateLimitStore,
  enforceRateLimit,
  type RateLimitStore,
} from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  let store: RateLimitStore;

  beforeEach(() => {
    store = createMemoryRateLimitStore();
  });

  it("allows requests under the configured limit", async () => {
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const config = { bucket: "checkout", limit: 3, windowMs: 60_000 };

    const r1 = await checkRateLimit({ store, key: "ip:1.2.3.4", config, now });
    const r2 = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 1_000,
    });
    const r3 = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 2_000,
    });

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks the next request once the limit is reached and returns retryAfterSeconds", async () => {
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const config = { bucket: "checkout", limit: 2, windowMs: 60_000 };

    await checkRateLimit({ store, key: "ip:1.2.3.4", config, now });
    await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 1_000,
    });
    const blocked = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 2_000,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    // First hit was at `now`; window slides off at `now + windowMs`.
    // retryAfterSeconds should be the seconds remaining until that first hit ages out.
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("isolates buckets and keys from each other", async () => {
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const checkoutConfig = { bucket: "checkout", limit: 1, windowMs: 60_000 };
    const adminConfig = { bucket: "admin", limit: 1, windowMs: 60_000 };

    const a = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config: checkoutConfig,
      now,
    });
    // Same key but different bucket should not be blocked.
    const b = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config: adminConfig,
      now,
    });
    // Different key in same bucket should not be blocked.
    const c = await checkRateLimit({
      store,
      key: "ip:5.6.7.8",
      config: checkoutConfig,
      now,
    });

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
  });

  it("re-allows requests after the window slides", async () => {
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const config = { bucket: "checkout", limit: 1, windowMs: 60_000 };

    const first = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now,
    });
    expect(first.allowed).toBe(true);

    const blocked = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 1_000,
    });
    expect(blocked.allowed).toBe(false);

    // After windowMs + 1ms, the prior hit should have expired.
    const reAllowed = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 60_001,
    });
    expect(reAllowed.allowed).toBe(true);
  });

  it("does not mutate hit counts when blocked", async () => {
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const config = { bucket: "checkout", limit: 1, windowMs: 60_000 };

    await checkRateLimit({ store, key: "ip:1.2.3.4", config, now });
    const blockedA = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 1_000,
    });
    const blockedB = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 2_000,
    });

    expect(blockedA.allowed).toBe(false);
    expect(blockedB.allowed).toBe(false);
    // Blocked attempts should not extend the window. After the original window
    // expires the next call must be allowed.
    const reAllowed = await checkRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 60_001,
    });
    expect(reAllowed.allowed).toBe(true);
  });
});

describe("checkRateLimit atomic path (CR-01)", () => {
  it("uses the store's checkAndRecord when present and respects exactly the configured limit under concurrent calls", async () => {
    // CR-01: at the limit boundary with N concurrent callers, the previous
    // two-step protocol (count then record) admitted (limit + N) requests.
    // With the atomic path, exactly `limit` are admitted.
    const store = createMemoryRateLimitStore();
    expect(typeof store.checkAndRecord).toBe("function");
    const config = { bucket: "checkout", limit: 5, windowMs: 60_000 };
    const now = Date.parse("2026-04-27T00:00:00.000Z");

    // 20 concurrent callers for the same (bucket, key) at the same instant.
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        checkRateLimit({ store, key: "ip:1.2.3.4", config, now }),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(5);
    expect(blocked).toBe(15);
    // The store must have exactly `limit` hits recorded.
    const count = await store.countHits({
      bucket: config.bucket,
      key: "ip:1.2.3.4",
      windowMs: config.windowMs,
      now,
    });
    expect(count).toBe(5);
  });

  it("falls back to two-step path when the store does not implement checkAndRecord", async () => {
    // A legacy store missing checkAndRecord still works -- checkRateLimit
    // uses count + earliestHit + recordHit as before.
    const inner = createMemoryRateLimitStore();
    const legacy: RateLimitStore = {
      countHits: inner.countHits.bind(inner),
      earliestHit: inner.earliestHit.bind(inner),
      recordHit: inner.recordHit.bind(inner),
      // checkAndRecord intentionally omitted.
    };
    expect(legacy.checkAndRecord).toBeUndefined();

    const config = { bucket: "checkout", limit: 2, windowMs: 60_000 };
    const now = Date.parse("2026-04-27T00:00:00.000Z");
    const r1 = await checkRateLimit({ store: legacy, key: "k", config, now });
    const r2 = await checkRateLimit({ store: legacy, key: "k", config, now: now + 100 });
    const r3 = await checkRateLimit({ store: legacy, key: "k", config, now: now + 200 });

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
  });
});

describe("enforceRateLimit (CR-02 / WR-05: fail-open on store failure)", () => {
  it("returns null (fail-open) when the store throws instead of bubbling the error", async () => {
    // Defense-in-depth: rate-limit store failure must never deny service or
    // surface a generic Next.js 500 to the route handler.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failingStore: RateLimitStore = {
        async countHits() {
          throw new Error("simulated DB outage");
        },
        async earliestHit() {
          throw new Error("simulated DB outage");
        },
        async recordHit() {
          throw new Error("simulated DB outage");
        },
      };

      const result = await enforceRateLimit({
        store: failingStore,
        key: "ip:1.2.3.4",
        config: { bucket: "checkout", limit: 1, windowMs: 60_000 },
      });

      // Fail-open: caller continues without a 429.
      expect(result).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("still emits a 429 response when the store works and the limit is exceeded", async () => {
    const store = createMemoryRateLimitStore();
    const config = { bucket: "checkout", limit: 1, windowMs: 60_000 };
    const now = Date.parse("2026-04-27T00:00:00.000Z");

    const allowed = await enforceRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now,
    });
    expect(allowed).toBeNull();

    const blocked = await enforceRateLimit({
      store,
      key: "ip:1.2.3.4",
      config,
      now: now + 1_000,
    });
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).not.toBeNull();
  });
});
