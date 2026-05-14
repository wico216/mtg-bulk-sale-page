// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicCard } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import CardModal from "../card-modal";

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "lea-161-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Alpha",
    collectorNumber: "161",
    price: 1,
    condition: "near_mint",
    quantity: 4,
    colorIdentity: ["R"],
    imageUrl: null,
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    typeLine: "Instant",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

beforeEach(() => {
  useCartStore.setState({ items: new Map(), version: "1.3" });
});

describe("CardModal customer actions", () => {
  it("links the selected card to Scryfall", () => {
    render(
      <CardModal
        card={publicCard()}
        onClose={() => {}}
        onImageClick={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: /view on scryfall/i });
    expect(link).toHaveAttribute("href", "https://scryfall.com/card/lea/161");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows close and go-to-cart actions when the card is in the cart", () => {
    const card = publicCard();
    const onClose = vi.fn();
    useCartStore.setState({ items: new Map([[card.id, 1]]), version: "1.3" });

    render(
      <CardModal
        card={card}
        onClose={onClose}
        onImageClick={() => {}}
      />,
    );

    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to cart/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });
});
