// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicCard } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import FilterRail from "../filter-rail";

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
    oracleText: null,
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
    sortBy: "price-desc",
  });
}

describe("FilterRail set filter", () => {
  beforeEach(() => {
    resetFilterStore([
      publicCard(),
      publicCard({
        id: "bet-1-normal-near_mint",
        name: "Counterspell",
        setCode: "bet",
        setName: "Beta",
        collectorNumber: "1",
        colorIdentity: ["U"],
        typeLine: "Creature — Merfolk Wizard",
      }),
    ]);
  });

  it("renders set search as the first set-list row and clears it after selecting a set", async () => {
    const user = userEvent.setup();

    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    const search = screen.getByPlaceholderText("Search sets");
    const alpha = screen.getByText("Alpha");

    expect(
      Boolean(search.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    await user.type(search, "alph");

    expect(search).toHaveValue("alph");
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();

    await user.click(alpha);

    expect(search).toHaveValue("");
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(useFilterStore.getState().selectedSets.has("Alpha")).toBe(true);
  });

  it("renders official Scryfall mana symbols in color filters", () => {
    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    const redMana = screen.getByAltText("{R}");
    expect(redMana).toHaveAttribute(
      "src",
      "https://svgs.scryfall.io/card-symbols/R.svg",
    );
  });

  it("adds a card type filter section with counts", async () => {
    const user = userEvent.setup();

    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    await user.click(screen.getByText("Creature"));

    expect(useFilterStore.getState().selectedTypes.has("Creature")).toBe(true);
    expect(useFilterStore.getState().getFilteredCards().map((card) => card.name)).toEqual([
      "Counterspell",
    ]);
  });

  it("opens card type and set filter sections by default", () => {
    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    expect(screen.getByPlaceholderText("Search sets")).toBeInTheDocument();
    expect(screen.getByText("Creature")).toBeInTheDocument();
  });
});
