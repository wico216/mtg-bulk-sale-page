// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicCard } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import SortBar from "../sort-bar";

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "e2e-150-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "e2e",
    setName: "E2E Masters",
    collectorNumber: "150",
    price: 3.5,
    condition: "near_mint",
    quantity: 3,
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

function resetFilterStore(cards: PublicCard[]) {
  useFilterStore.setState({
    allCards: cards,
    searchQuery: "",
    selectedColors: new Set<string>(),
    selectedSets: new Set<string>(),
    selectedRarities: new Set<string>(),
    selectedTypes: new Set<string>(),
    selectedFinishes: new Set(),
    priceRange: [0, PRICE_MAX],
    sortBy: "name-asc",
  });
}

describe("SortBar grouped storefront count", () => {
  beforeEach(() => {
    resetFilterStore([]);
  });

  it("counts foil and nonfoil copies of the same printing as one visible card", () => {
    resetFilterStore([
      publicCard(),
      publicCard({ id: "e2e-150-foil-near_mint", finish: "foil", price: 8.75 }),
      publicCard({ id: "e2e-150e-foil-near_mint", collectorNumber: "150e", finish: "foil", price: 12 }),
    ]);

    render(<SortBar />);

    expect(screen.getByText(/2 cards in stock/i)).toBeInTheDocument();
  });
});
