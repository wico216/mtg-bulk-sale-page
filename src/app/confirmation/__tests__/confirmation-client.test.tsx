// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutResponse, PublicOrderData } from "@/lib/types";
import ConfirmationClient from "../confirmation-client";

const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

function makeOrder(): PublicOrderData {
  return {
    orderRef: "ORD-20260514-120000-EMAIL1",
    buyerName: "Test Buyer",
    buyerEmail: "buyer@example.com",
    message: "pickup",
    items: [
      {
        cardId: "lea-232-normal-near_mint",
        name: "Lightning Bolt",
        setName: "Alpha",
        setCode: "lea",
        collectorNumber: "232",
        condition: "near_mint",
        price: 1.25,
        quantity: 1,
        lineTotal: 1.25,
        imageUrl: null,
      },
    ],
    totalItems: 1,
    totalPrice: 1.25,
    createdAt: "2026-05-14T12:00:00.000Z",
  };
}

function storeLastOrder(notification?: CheckoutResponse["notification"]) {
  sessionStorage.setItem(
    "lastOrder",
    JSON.stringify({
      order: makeOrder(),
      notification,
    }),
  );
}

describe("ConfirmationClient", () => {
  beforeEach(() => {
    mockSearchParams.mockReturnValue(
      new URLSearchParams(
        "ref=ORD-20260514-120000-EMAIL1&email=buyer%40example.com&total=1.25&count=1&name=Test%20Buyer",
      ),
    );
  });

  it("shows that confirmation was sent only when the buyer email sent", async () => {
    storeLastOrder({ sellerEmailSent: true, buyerEmailSent: true });

    render(<ConfirmationClient />);

    expect(
      await screen.findByText("Confirmation sent to buyer@example.com"),
    ).toBeInTheDocument();
  });

  it("does not promise email delivery when the buyer email failed", async () => {
    storeLastOrder({ sellerEmailSent: true, buyerEmailSent: false });

    render(<ConfirmationClient />);

    expect(
      await screen.findByText(
        "Order placed, but email confirmation could not be sent. Save this order number.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Confirmation sent to/i)).not.toBeInTheDocument();
  });
});
