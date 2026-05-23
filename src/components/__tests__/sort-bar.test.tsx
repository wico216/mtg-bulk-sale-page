// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PublicCard } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import SortBar from "../sort-bar";

function publicCard(overrides: Partial<PublicCard> = {}): PublicCard {
  return {
    id: "lea-161-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Alpha",
    collectorNumber: "161",
    price: 1,
    condition: "near_mint",
    quantity: 1,
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
  useFilterStore.setState({
    allCards: [publicCard()],
    searchQuery: "",
    selectedColors: new Set<string>(),
    selectedSets: new Set<string>(),
    selectedRarities: new Set<string>(),
    selectedTypes: new Set<string>(),
    selectedFinishes: new Set(),
    priceRange: [0, PRICE_MAX],
    sortBy: "price-desc",
  });
});

describe("SortBar storefront search", () => {
  it("uses honest search helper copy instead of promising full Scryfall syntax", () => {
    render(<SortBar filteredCount={1} />);

    expect(
      screen.getByPlaceholderText(/Search name, set, text, type, or try t:dragon c:rg/i),
    ).toBeInTheDocument();
  });

  it("stays sticky below the header while the buyer scrolls", () => {
    render(<SortBar filteredCount={1} />);

    const bar = screen.getByTestId("storefront-search-bar");
    expect(bar).toHaveStyle({ position: "sticky", top: "68px" });
  });

  it("renders the server-filtered stock count prop", () => {
    render(<SortBar filteredCount={2} />);

    expect(screen.getByText(/2 cards in stock/i)).toBeInTheDocument();
  });
});
