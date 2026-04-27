import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCards,
  mockPlaceCheckoutOrder,
  mockNotifyOrder,
} = vi.hoisted(() => ({
  mockGetCards: vi.fn(),
  mockPlaceCheckoutOrder: vi.fn(),
  mockNotifyOrder: vi.fn(),
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

import { POST } from "../route";

const sampleOrder = {
  orderRef: "ORD-20260427-020304-ABCD12",
  buyerName: "Viki",
  buyerEmail: "viki@example.com",
  message: "pickup tomorrow",
  items: [
    {
      cardId: "lea-232-normal-near_mint",
      name: "Lightning Bolt",
      setName: "Alpha",
      setCode: "lea",
      collectorNumber: "232",
      condition: "near_mint",
      price: 1.25,
      quantity: 2,
      lineTotal: 2.5,
      imageUrl: "https://example.com/bolt.jpg",
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
    mockGetCards.mockRejectedValue(new Error("legacy getCards should not be called"));
    mockNotifyOrder.mockResolvedValue({
      sellerEmailSent: true,
      buyerEmailSent: true,
    });
  });

  it("places an order through the transactional helper and returns 201", async () => {
    mockPlaceCheckoutOrder.mockResolvedValueOnce({ ok: true, order: sampleOrder });

    const response = await POST(makeCheckoutRequest(validBody()));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      success: true,
      orderRef: sampleOrder.orderRef,
      order: sampleOrder,
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
});
