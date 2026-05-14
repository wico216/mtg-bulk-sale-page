import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCards,
  mockPlaceCheckoutOrder,
  mockNotifyOrder,
  mockEnforceRateLimit,
} = vi.hoisted(() => ({
  mockGetCards: vi.fn(),
  mockPlaceCheckoutOrder: vi.fn(),
  mockNotifyOrder: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries", () => ({
  getCards: mockGetCards,
}));
vi.mock("@/db/orders", () => ({
  placeCheckoutOrder: mockPlaceCheckoutOrder,
}));
vi.mock("@/lib/notifications", () => ({
  notifyOrder: mockNotifyOrder,
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: mockEnforceRateLimit,
  };
});

import { POST } from "../route";

const sampleOrder = {
  orderRef: "ORD-20260427-020304-ABCD12",
  buyerName: "Viki",
  buyerEmail: "viki@example.com",
  buyerPhone: null as string | null,
  message: "pickup tomorrow",
  items: [
    {
      cardId: "lea-232-normal-near_mint-a02",
      name: "Lightning Bolt",
      setName: "Alpha",
      setCode: "lea",
      collectorNumber: "232",
      condition: "near_mint",
      price: 1.25,
      quantity: 2,
      lineTotal: 2.5,
      imageUrl: "https://example.com/bolt.jpg",
      binder: "a02",
    },
  ],
  totalItems: 2,
  totalPrice: 2.5,
  createdAt: "2026-04-27T02:03:04.000Z",
};

function makeCheckoutRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    buyerName: "Viki",
    buyerEmail: "viki@example.com",
    message: "pickup tomorrow",
    items: [{ cardId: "lea-232-normal-near_mint", quantity: 2 }],
    ...overrides,
  };
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend";
    process.env.SELLER_EMAIL = "seller@example.com";
    mockGetCards.mockReset();
    mockPlaceCheckoutOrder.mockReset();
    mockNotifyOrder.mockReset();
    mockEnforceRateLimit.mockReset();
    mockGetCards.mockRejectedValue(new Error("legacy getCards should not be called"));
    mockNotifyOrder.mockResolvedValue({
      sellerEmailSent: true,
      buyerEmailSent: true,
    });
    // Default: rate limit allows the request (returns null).
    mockEnforceRateLimit.mockResolvedValue(null);
  });

  it("places an order through the transactional helper and returns 201", async () => {
    mockPlaceCheckoutOrder.mockResolvedValueOnce({ ok: true, order: sampleOrder });

    const response = await POST(makeCheckoutRequest(validBody()));
    const data = await response.json();

    expect(response.status).toBe(201);
    // v1.3 Phase 20 D-07/AGG-02 + Quick 260514-7z2: response.order is
    // PublicOrderData with `binder` stripped from each item AND
    // `buyerPhone` stripped from the order itself. Build the expected
    // shape from sampleOrder by destructuring out both.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { buyerPhone: _buyerPhone, ...orderWithoutPhone } = sampleOrder;
    const expectedPublicOrder = {
      ...orderWithoutPhone,
      items: orderWithoutPhone.items.map(
        ({ binder: _binder, ...item }) => item,
      ),
    };
    expect(data).toEqual({
      success: true,
      orderRef: sampleOrder.orderRef,
      order: expectedPublicOrder,
      notification: { sellerEmailSent: true, buyerEmailSent: true },
    });
    expect(mockPlaceCheckoutOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerName: "Viki",
        buyerEmail: "viki@example.com",
        message: "pickup tomorrow",
        items: [{ cardId: "lea-232-normal-near_mint", quantity: 2 }],
      }),
    );
    // notifyOrder STILL receives the full internal OrderData with binder
    // (seller email needs the snapshot for operator pull info per Phase
    // 18 D-15). Only the public response is stripped.
    expect(mockNotifyOrder).toHaveBeenCalledWith(sampleOrder);
    expect(mockGetCards).not.toHaveBeenCalled();
  });

  it("still returns success when post-commit notifications fail", async () => {
    mockPlaceCheckoutOrder.mockResolvedValueOnce({ ok: true, order: sampleOrder });
    mockNotifyOrder.mockResolvedValueOnce({
      sellerEmailSent: false,
      buyerEmailSent: false,
    });

    const response = await POST(makeCheckoutRequest(validBody()));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.notification).toEqual({
      sellerEmailSent: false,
      buyerEmailSent: false,
    });
  });

  it("emits a structured warn log when post-commit notifications partially fail", async () => {
    mockPlaceCheckoutOrder.mockResolvedValueOnce({ ok: true, order: sampleOrder });
    mockNotifyOrder.mockResolvedValueOnce({
      sellerEmailSent: true,
      buyerEmailSent: false,
    });
    // Capture console.warn lines (the logger emits one JSON line per call).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Capture console.log as well -- order_committed lives there.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const response = await POST(makeCheckoutRequest(validBody()));
      expect(response.status).toBe(201);

      // Collect every JSON-line that parsed cleanly.
      const allLines: Array<Record<string, unknown>> = [];
      for (const spy of [warnSpy, logSpy]) {
        for (const call of spy.mock.calls) {
          const raw = call[0];
          if (typeof raw !== "string") continue;
          try {
            allLines.push(JSON.parse(raw));
          } catch {
            // not a JSON log line (legacy console.log) -- skip
          }
        }
      }

      const partial = allLines.find(
        (line) => line.event === "checkout.notification_partial",
      );
      expect(partial).toBeDefined();
      expect(partial!.level).toBe("warn");
      expect(partial!.route).toBe("/api/checkout");
      expect(partial!.metadata).toEqual({
        orderRef: sampleOrder.orderRef,
        sellerEmailSent: true,
        buyerEmailSent: false,
      });
      // Critically: the log must NOT contain the buyer email, secrets, or full
      // order payload.
      const rendered = JSON.stringify(partial);
      expect(rendered).not.toContain("viki@example.com");
      expect(rendered).not.toContain(process.env.RESEND_API_KEY ?? "test-resend");

      // And `checkout.order_committed` should have been emitted as info BEFORE
      // the partial warn (the commit succeeded before the email layer ran).
      const committed = allLines.find(
        (line) => line.event === "checkout.order_committed",
      );
      expect(committed).toBeDefined();
      expect(committed!.level).toBe("info");
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it("returns 409 with structured conflicts and does not send email", async () => {
    const conflicts = [
      {
        cardId: "lea-232-normal-near_mint",
        name: "Lightning Bolt",
        requested: 2,
        available: 1,
      },
    ];
    mockPlaceCheckoutOrder.mockResolvedValueOnce({
      ok: false,
      code: "stock_conflict",
      conflicts,
    });

    const response = await POST(makeCheckoutRequest(validBody()));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({
      success: false,
      code: "stock_conflict",
      error: "Some cards are no longer available.",
      conflicts,
    });
    expect(mockNotifyOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["missing buyer name", { buyerName: "" }, "Name is required"],
    ["invalid email", { buyerEmail: "not-an-email" }, "Valid email is required"],
    ["empty cart", { items: [] }, "Cart is empty"],
    ["invalid quantity", { items: [{ cardId: "card-1", quantity: 0 }] }, "Invalid cart item"],
    ["missing card id", { items: [{ cardId: "", quantity: 1 }] }, "Invalid cart item"],
  ])("returns 400 for %s", async (_name, overrides, error) => {
    const response = await POST(makeCheckoutRequest(validBody(overrides)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error });
    expect(mockPlaceCheckoutOrder).not.toHaveBeenCalled();
    expect(mockNotifyOrder).not.toHaveBeenCalled();
  });

  it("returns 503 and does not send email when the database write fails", async () => {
    mockPlaceCheckoutOrder.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(makeCheckoutRequest(validBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unable to process order right now, please try again",
    });
    expect(mockNotifyOrder).not.toHaveBeenCalled();
  });

  it("returns 429 and does not call placeCheckoutOrder when rate-limited", async () => {
    mockEnforceRateLimit.mockResolvedValueOnce(
      Response.json(
        { error: "Too many requests. Please try again shortly.", code: "rate_limited", retryAfterSeconds: 30 },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );

    const response = await POST(makeCheckoutRequest(validBody()));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    const body = await response.json();
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBe(30);
    expect(mockPlaceCheckoutOrder).not.toHaveBeenCalled();
    expect(mockNotifyOrder).not.toHaveBeenCalled();
  });

  it("rate-limits checkout BEFORE parsing or validating the body", async () => {
    // A blocked request must not even touch the request body -- otherwise
    // a flood of malformed bodies could starve real users via JSON-parse cost.
    mockEnforceRateLimit.mockResolvedValueOnce(
      Response.json(
        { error: "rate_limited", code: "rate_limited", retryAfterSeconds: 60 },
        { status: 429 },
      ),
    );
    // Request body deliberately not-JSON to prove we never parse it.
    const req = new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json{",
    });

    const response = await POST(req);

    expect(response.status).toBe(429);
    expect(mockPlaceCheckoutOrder).not.toHaveBeenCalled();
  });

  it("responds 503 with stock_check_violation code on CHECK-constraint trip (D-08)", async () => {
    // Simulate the Postgres `cards_quantity_check` constraint trip — the
    // schema-level safety net (Phase 16 BIND-04) that should NEVER fire
    // if the allocator's per-binder math is correct. neon-http surfaces
    // the error with `code` and `constraint` fields per node-postgres.
    const constraintError = Object.assign(new Error("check constraint cards_quantity_check violated"), {
      code: "23514",
      constraint: "cards_quantity_check",
    });
    mockPlaceCheckoutOrder.mockRejectedValueOnce(constraintError);

    // Capture the structured log so we can assert the new check_constraint
    // event fired (operators grep this name in logs).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await POST(makeCheckoutRequest(validBody()));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({
        success: false,
        error: "Inventory check failed — please refresh and try again",
        code: "stock_check_violation",
      });
      expect(mockNotifyOrder).not.toHaveBeenCalled();

      // Assert the structured log event was emitted with the new event name.
      const errorLines: Array<Record<string, unknown>> = [];
      for (const call of errorSpy.mock.calls) {
        const raw = call[0];
        if (typeof raw !== "string") continue;
        try {
          errorLines.push(JSON.parse(raw));
        } catch {
          // not JSON; skip
        }
      }
      const constraintLog = errorLines.find(
        (line) => line.event === "checkout.check_constraint_violation",
      );
      expect(constraintLog).toBeDefined();
      expect(constraintLog!.route).toBe("/api/checkout");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("emits binderSourceCount on order_committed log event (D-13)", async () => {
    // Mock an order with 4 items spread across 3 distinct binders.
    // binderSourceCount should equal 3 (the count of DISTINCT binders).
    const multiBinderOrder = {
      ...sampleOrder,
      items: [
        { ...sampleOrder.items[0], binder: "a02", quantity: 1 },
        {
          ...sampleOrder.items[0],
          cardId: "lea-232-normal-near_mint-a05",
          binder: "a02", // duplicate binder; should NOT inflate count
          quantity: 1,
        },
        {
          ...sampleOrder.items[0],
          cardId: "lea-232-normal-near_mint-a07",
          binder: "a05",
          quantity: 1,
        },
        {
          ...sampleOrder.items[0],
          cardId: "lea-232-normal-near_mint-a09",
          binder: "a07",
          quantity: 1,
        },
      ],
      totalItems: 4,
    };
    mockPlaceCheckoutOrder.mockResolvedValueOnce({ ok: true, order: multiBinderOrder });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      const response = await POST(makeCheckoutRequest(validBody()));
      expect(response.status).toBe(201);

      // Find the order_committed log event and assert binderSourceCount.
      const logLines: Array<Record<string, unknown>> = [];
      for (const call of logSpy.mock.calls) {
        const raw = call[0];
        if (typeof raw !== "string") continue;
        try {
          logLines.push(JSON.parse(raw));
        } catch {
          // not JSON; skip
        }
      }
      const committed = logLines.find(
        (line) => line.event === "checkout.order_committed",
      );
      expect(committed).toBeDefined();
      const meta = committed!.metadata as Record<string, unknown>;
      // 3 distinct binders: a02, a05, a07 (the duplicate a02 doesn't inflate).
      expect(meta.binderSourceCount).toBe(3);
      // Per D-12, no per-binder breakdown leaks into metadata.
      const serialized = JSON.stringify(committed);
      expect(serialized).not.toContain("a02");
      expect(serialized).not.toContain("a05");
      expect(serialized).not.toContain("a07");
    } finally {
      logSpy.mockRestore();
    }
  });

  // ---- Phase 20 AGG-02 invariants — public response carries no binder ------
  describe("AGG-02 invariant — public response contains no binder/binders trace", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "test-resend";
      mockEnforceRateLimit.mockReturnValue(null);
      mockNotifyOrder.mockResolvedValue({
        sellerEmailSent: true,
        buyerEmailSent: true,
      });
    });

    it("success response excludes binder/binders field-name trace", async () => {
      // sampleOrder includes an OrderItem with binder: 'a02'. Per AGG-02
      // (CONTEXT D-07/D-18) the public CheckoutResponse must strip the
      // binder snapshot. Plan 20-01 Task 10 ships a server-side projection
      // in src/app/api/checkout/route.ts that does the strip + a
      // PublicOrderItem type that makes the leak a compile error.
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: true,
        order: sampleOrder,
      });
      const res = await POST(makeCheckoutRequest(validBody()));
      expect(res.status).toBe(201);
      const body = await res.json();
      const serialized = JSON.stringify(body).toLowerCase();
      // AGG-02 invariant per CONTEXT: the literal field-name "binder"
      // (and the plural "binders" from AdminCard) must not appear in any
      // public response. The substring check is case-insensitive so the
      // lowercased serialized form is the test surface.
      expect(serialized.includes("binder")).toBe(false);
      expect(serialized.includes("binders")).toBe(false);
      // NOTE: per Phase 18 the order_items snapshot still carries the
      // 5-segment per-binder cardId (e.g., "lea-232-normal-near_mint-a02").
      // Stripping that down to the aggregated 4-segment id is outside
      // Phase 20 scope (would require reformulating allocator output).
      // AGG-02 is the strict spec — substring "binder"/"binders" only.
      // Sanity: the order shape is otherwise preserved end-to-end.
      expect(body.order.orderRef).toBe(sampleOrder.orderRef);
      expect(body.order.items).toHaveLength(1);
      expect(body.order.items[0].cardId).toBe(sampleOrder.items[0].cardId);
    });

    it("stock_conflict response excludes binder/binders trace", async () => {
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: false,
        code: "stock_conflict",
        conflicts: [
          {
            cardId: "sld-123-normal-near_mint",
            name: "Lightning Bolt",
            requested: 5,
            available: 2,
          },
        ],
      });
      const res = await POST(makeCheckoutRequest(validBody()));
      expect(res.status).toBe(409);
      const body = await res.json();
      const serialized = JSON.stringify(body).toLowerCase();
      expect(serialized.includes("binder")).toBe(false);
      expect(serialized.includes("binders")).toBe(false);
    });
  });

  // Quick 260514-7z2: optional buyerPhone field validation + admin-only
  // persistence (the response must NOT carry it back to the buyer).
  describe("buyer phone (Quick 260514-7z2)", () => {
    it("accepts a checkout with no buyerPhone (omitted)", async () => {
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: true,
        order: sampleOrder,
      });
      const response = await POST(makeCheckoutRequest(validBody()));
      expect(response.status).toBe(201);
      expect(mockPlaceCheckoutOrder).toHaveBeenCalledWith(
        expect.objectContaining({ buyerPhone: null }),
      );
    });

    it("accepts a checkout with a valid buyerPhone", async () => {
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: true,
        order: { ...sampleOrder, buyerPhone: "555-1234" },
      });
      const response = await POST(
        makeCheckoutRequest(validBody({ buyerPhone: "555-1234" })),
      );
      expect(response.status).toBe(201);
      expect(mockPlaceCheckoutOrder).toHaveBeenCalledWith(
        expect.objectContaining({ buyerPhone: "555-1234" }),
      );
    });

    it("rejects buyerPhone > 32 chars with 400 Invalid phone", async () => {
      const response = await POST(
        makeCheckoutRequest(validBody({ buyerPhone: "5".repeat(33) })),
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid phone");
      expect(mockPlaceCheckoutOrder).not.toHaveBeenCalled();
    });

    it("rejects buyerPhone with no digits with 400 Invalid phone", async () => {
      const response = await POST(
        makeCheckoutRequest(validBody({ buyerPhone: "abc" })),
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid phone");
      expect(mockPlaceCheckoutOrder).not.toHaveBeenCalled();
    });

    it("strips buyerPhone from the public CheckoutResponse", async () => {
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: true,
        order: { ...sampleOrder, buyerPhone: "555-1234" },
      });
      const response = await POST(
        makeCheckoutRequest(validBody({ buyerPhone: "555-1234" })),
      );
      expect(response.status).toBe(201);
      const data = await response.json();
      // Admin-only field: must not echo back to the buyer's CheckoutResponse.
      expect(data.order).not.toHaveProperty("buyerPhone");
    });

    it("treats whitespace-only buyerPhone as null", async () => {
      mockPlaceCheckoutOrder.mockResolvedValueOnce({
        ok: true,
        order: sampleOrder,
      });
      const response = await POST(
        makeCheckoutRequest(validBody({ buyerPhone: "  " })),
      );
      expect(response.status).toBe(201);
      expect(mockPlaceCheckoutOrder).toHaveBeenCalledWith(
        expect.objectContaining({ buyerPhone: null }),
      );
    });
  });
});
