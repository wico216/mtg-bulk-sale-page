import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderData } from "@/lib/types";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSend,
      },
    };
  }),
}));
vi.mock("server-only", () => ({}));

import { DEFAULT_ORDER_EMAIL_FROM, notifyOrder } from "@/lib/notifications";

function makeOrder(): OrderData {
  return {
    orderRef: "ORD-20260514-120000-EMAIL1",
    buyerName: "Test Buyer",
    buyerEmail: "buyer@example.com",
    buyerPhone: null,
    message: "pickup",
    items: [
      {
        cardId: "lea-232-normal-near_mint-a02",
        name: "Lightning Bolt",
        setName: "Alpha",
        setCode: "lea",
        collectorNumber: "232",
        condition: "near_mint",
        price: 1.25,
        quantity: 1,
        lineTotal: 1.25,
        imageUrl: null,
        binder: "a02",
      },
    ],
    totalItems: 1,
    totalPrice: 1.25,
    createdAt: "2026-05-14T12:00:00.000Z",
  };
}

describe("notifyOrder", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ error: null });
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SELLER_EMAIL = "wico216@gmail.com";
    delete process.env.ORDER_EMAIL_FROM;
  });

  it("sends order emails from the verified domain and routes buyer replies to the seller", async () => {
    const result = await notifyOrder(makeOrder());

    expect(result).toEqual({
      sellerEmailSent: true,
      buyerEmailSent: true,
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      from: DEFAULT_ORDER_EMAIL_FROM,
      to: ["wico216@gmail.com"],
      subject: "New order from Test Buyer",
    });
    expect(mockSend.mock.calls[1][0]).toMatchObject({
      from: DEFAULT_ORDER_EMAIL_FROM,
      to: ["buyer@example.com"],
      replyTo: "wico216@gmail.com",
      subject: "Your order is confirmed!",
    });
  });
});
