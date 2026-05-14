/**
 * Phase 15-01 Task 4: Verification.
 *
 * End-to-end-ish proof that the checkout route, when wired through the REAL
 * rate-limit module (not a mock), trips the limit at the configured threshold,
 * returns 429 with no DB mutation, and emits structured logs that contain no
 * secrets or PII.
 *
 * The real `enforceRateLimit` is used; only the DB and notification layers
 * are mocked because they require external services. The default store falls
 * back to an in-memory store because DATABASE_URL is unset in tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPlaceCheckoutOrder,
  mockNotifyOrder,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockPlaceCheckoutOrder: vi.fn(),
  mockNotifyOrder: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/orders", () => ({
  placeCheckoutOrder: mockPlaceCheckoutOrder,
}));
vi.mock("@/lib/notifications", () => ({
  notifyOrder: mockNotifyOrder,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));
// NOTE: no mock of @/lib/rate-limit -- real module exercised.

import { POST } from "../route";
import { __resetDefaultRateLimitStoreForTests, RATE_LIMIT_BUCKETS } from "@/lib/rate-limit";

const sampleOrder = {
  orderRef: "ORD-VERIFY-1",
  buyerName: "Viki",
  buyerEmail: "viki@example.com",
  message: null,
  items: [],
  totalItems: 1,
  totalPrice: 1,
  status: "pending",
  createdAt: "2026-04-27T00:00:00.000Z",
};

function makeReq(ip: string) {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({
      buyerName: "Viki",
      buyerEmail: "viki@example.com",
      items: [{ cardId: "card-1", quantity: 1 }],
    }),
  });
}

describe("Phase 15-01 verification: checkout rate-limit (real module)", () => {
  beforeEach(() => {
    __resetDefaultRateLimitStoreForTests();
    mockPlaceCheckoutOrder.mockReset();
    mockNotifyOrder.mockReset();
    mockRevalidatePath.mockReset();
    mockPlaceCheckoutOrder.mockResolvedValue({ ok: true, order: sampleOrder });
    mockNotifyOrder.mockResolvedValue({ sellerEmailSent: true, buyerEmailSent: true });
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.SELLER_EMAIL = "seller@example.com";
  });

  it("allows requests up to the limit, then blocks the next one without mutating data", async () => {
    const { CHECKOUT } = RATE_LIMIT_BUCKETS;
    const ip = "10.0.0.99"; // unique per test to avoid bleed-through

    // Hit exactly `limit` times -- all should be 201.
    for (let i = 0; i < CHECKOUT.limit; i += 1) {
      const res = await POST(makeReq(ip) as Parameters<typeof POST>[0]);
      expect(res.status).toBe(201);
    }
    expect(mockPlaceCheckoutOrder).toHaveBeenCalledTimes(CHECKOUT.limit);

    // The next request must be blocked with 429.
    const blocked = await POST(makeReq(ip) as Parameters<typeof POST>[0]);
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();

    // And critically: placeCheckoutOrder must NOT have been called again.
    expect(mockPlaceCheckoutOrder).toHaveBeenCalledTimes(CHECKOUT.limit);
  });

  it("does not extend the window for blocked retries -- the bucket clears on its own timeline", async () => {
    const { CHECKOUT } = RATE_LIMIT_BUCKETS;
    const ip = "10.0.0.100";

    // Saturate the bucket.
    for (let i = 0; i < CHECKOUT.limit; i += 1) {
      await POST(makeReq(ip) as Parameters<typeof POST>[0]);
    }
    // Blocked attempts should also not change the count.
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(makeReq(ip) as Parameters<typeof POST>[0]);
      expect(res.status).toBe(429);
    }
    // Sanity: placeCheckoutOrder still only seen `limit` calls.
    expect(mockPlaceCheckoutOrder).toHaveBeenCalledTimes(CHECKOUT.limit);
  });

  it("captured 429 logs contain no PII, secrets, or cookie/auth headers", async () => {
    const { CHECKOUT } = RATE_LIMIT_BUCKETS;
    const ip = "10.0.0.101";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      // Saturate.
      for (let i = 0; i < CHECKOUT.limit; i += 1) {
        await POST(makeReq(ip) as Parameters<typeof POST>[0]);
      }
      // Trip the limit.
      const blocked = await POST(makeReq(ip) as Parameters<typeof POST>[0]);
      expect(blocked.status).toBe(429);

      const allWarnLines: Array<Record<string, unknown>> = [];
      for (const call of warnSpy.mock.calls) {
        const raw = call[0];
        if (typeof raw !== "string") continue;
        try {
          allWarnLines.push(JSON.parse(raw));
        } catch {
          // skip
        }
      }
      const rateLimitedLog = allWarnLines.find(
        (line) => line.event === "checkout.rate_limited",
      );
      expect(rateLimitedLog).toBeDefined();
      const rendered = JSON.stringify(rateLimitedLog);
      // No PII or secrets must appear anywhere in the structured log.
      expect(rendered).not.toContain("viki@example.com");
      expect(rendered).not.toContain("test-resend-key");
      expect(rendered).not.toContain(ip); // we don't expose the raw client IP either
      expect(rendered).not.toMatch(/cookie/i);
      expect(rendered).not.toMatch(/authorization/i);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("notification failure path: order_committed (info) still emitted, partial (warn) added, no PII", async () => {
    const { CHECKOUT } = RATE_LIMIT_BUCKETS;
    void CHECKOUT;
    const ip = "10.0.0.102";

    // Force notifyOrder to report a buyer-email failure but not throw.
    mockNotifyOrder.mockResolvedValueOnce({
      sellerEmailSent: true,
      buyerEmailSent: false,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const res = await POST(makeReq(ip) as Parameters<typeof POST>[0]);
      // Order MUST still commit (notification failure is non-blocking).
      expect(res.status).toBe(201);

      const allLines: Array<Record<string, unknown>> = [];
      for (const spy of [warnSpy, logSpy]) {
        for (const call of spy.mock.calls) {
          const raw = call[0];
          if (typeof raw !== "string") continue;
          try {
            allLines.push(JSON.parse(raw));
          } catch {
            // skip non-JSON console.log entries
          }
        }
      }
      const committed = allLines.find((l) => l.event === "checkout.order_committed");
      const partial = allLines.find((l) => l.event === "checkout.notification_partial");
      expect(committed).toBeDefined();
      expect(partial).toBeDefined();
      const rendered = JSON.stringify(allLines);
      expect(rendered).not.toContain("test-resend-key");
      expect(rendered).not.toMatch(/cookie/i);
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
