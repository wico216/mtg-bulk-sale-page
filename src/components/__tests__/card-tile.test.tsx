// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
