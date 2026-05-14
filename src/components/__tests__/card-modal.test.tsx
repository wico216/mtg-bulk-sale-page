// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    backImageUrl: null,
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

  it("flips double-faced card images front to back and back again", async () => {
    const user = userEvent.setup();
    const onImageClick = vi.fn();

    render(
      <CardModal
        card={publicCard({
          imageUrl: "https://cards.scryfall.io/normal/front.jpg",
          backImageUrl: "https://cards.scryfall.io/normal/back.jpg",
        })}
        onClose={() => {}}
        onImageClick={onImageClick}
      />,
    );

    expect(screen.getByAltText("Lightning Bolt front")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /view full image/i }));
    expect(onImageClick).toHaveBeenLastCalledWith(
      "https://cards.scryfall.io/normal/front.jpg",
    );

    await user.click(
      screen.getByRole("button", { name: /transform card to back side/i }),
    );
    expect(screen.getByAltText("Lightning Bolt back")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /view full image/i }));
    expect(onImageClick).toHaveBeenLastCalledWith(
      "https://cards.scryfall.io/normal/back.jpg",
    );

    await user.click(
      screen.getByRole("button", { name: /transform card to front side/i }),
    );
    expect(screen.getByAltText("Lightning Bolt front")).toBeInTheDocument();
  });

  it("does not show the flip action for single-faced cards", () => {
    render(
      <CardModal
        card={publicCard({ imageUrl: "https://cards.scryfall.io/normal/front.jpg" })}
        onClose={() => {}}
        onImageClick={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /transform card to back side/i }),
    ).toBeNull();
  });
});
