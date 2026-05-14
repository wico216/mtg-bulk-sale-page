import { describe, it, expect, beforeEach } from "vitest";
import type { PublicCard } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "../filter-store";

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "low-1-normal-near_mint",
    name: "Budget Card",
    setCode: "low",
    setName: "Low Set",
    collectorNumber: "1",
    price: 1,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    oracleText: null,
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
    selectedFinishes: new Set(),
    priceRange: [0, PRICE_MAX],
    sortBy: "price-desc",
  });
}

describe("filter-store defaults", () => {
  beforeEach(() => {
    resetFilterStore([
      publicCard(),
      publicCard({
        id: "high-1-normal-near_mint",
        name: "Expensive Card",
        setCode: "high",
        setName: "High Set",
        collectorNumber: "1",
        price: 10,
      }),
    ]);
  });

  it("defaults storefront sorting to price high to low", () => {
    expect(useFilterStore.getInitialState().sortBy).toBe("price-desc");
    expect(useFilterStore.getState().sortBy).toBe("price-desc");
    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Expensive Card",
      "Budget Card",
    ]);
  });
});
