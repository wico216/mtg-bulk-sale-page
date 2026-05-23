// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicCard } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import CardTile from "../card-tile";

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

describe("CardTile display name", () => {
  it("appends Foil after the card name for foil storefront cards", () => {
    render(
      <CardTile
        card={publicCard({ finish: "foil" })}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Lightning Bolt - Foil")).toBeInTheDocument();
    expect(screen.getByTitle("Lightning Bolt - Foil")).toBeInTheDocument();
  });

  it("keeps normal storefront card names unchanged", () => {
    render(<CardTile card={publicCard()} onClick={vi.fn()} />);

    expect(screen.getByText("Lightning Bolt")).toBeInTheDocument();
    expect(screen.queryByText("Lightning Bolt - Foil")).not.toBeInTheDocument();
  });

  it("keeps quick add visible for touch buyers", () => {
    render(<CardTile card={publicCard()} onClick={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /add lightning bolt to satchel/i }),
    ).toBeVisible();
  });

  it("transforms double-faced cards on the storefront tile without opening the modal", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <CardTile
        card={publicCard({
          imageUrl: "https://cards.scryfall.io/normal/front.jpg",
          backImageUrl: "https://cards.scryfall.io/normal/back.jpg",
        })}
        onClick={onClick}
      />,
    );

    expect(screen.getByAltText("Lightning Bolt front")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /transform card to back side/i }),
    );

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByAltText("Lightning Bolt back")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /transform card to front side/i }),
    );

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByAltText("Lightning Bolt front")).toBeInTheDocument();
  });
});
