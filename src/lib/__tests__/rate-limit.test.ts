import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  createMemoryRateLimitStore,
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
