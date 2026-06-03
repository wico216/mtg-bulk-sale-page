// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

  it("sorts sets by total quantity so the deepest inventory appears first", () => {
    resetFilterStore([
      publicCard({ setName: "Alpha", quantity: 1 }),
      publicCard({ id: "bet-1", setName: "Beta", quantity: 7 }),
      publicCard({ id: "gam-1", setName: "Gamma", quantity: 3 }),
      publicCard({ id: "bet-2", setName: "Beta", quantity: 2 }),
    ]);

    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    const beta = screen.getByText("Beta");
    const gamma = screen.getByText("Gamma");
    const alpha = screen.getByText("Alpha");

    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(Boolean(beta.compareDocumentPosition(gamma) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(gamma.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("pins selected sets above the rest of the set list", async () => {
    const user = userEvent.setup();
    resetFilterStore([
      publicCard({ setName: "Alpha", quantity: 1 }),
      publicCard({ id: "bet-1", setName: "Beta", quantity: 7 }),
      publicCard({ id: "gam-1", setName: "Gamma", quantity: 3 }),
    ]);

    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    await user.click(screen.getByText("Alpha"));

    const selectedLabel = screen.getByText("Selected");
    const alpha = screen.getByText("Alpha");
    const beta = screen.getByText("Beta");

    expect(useFilterStore.getState().selectedSets.has("Alpha")).toBe(true);
    expect(Boolean(selectedLabel.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(alpha.compareDocumentPosition(beta) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("counts grouped foil and nonfoil printings in the rail summary", async () => {
    resetFilterStore([
      publicCard(),
      publicCard({ id: "lea-161-foil-near_mint", finish: "foil", price: 3 }),
      publicCard({
        id: "bet-1-normal-near_mint",
        name: "Counterspell",
        setCode: "bet",
        setName: "Beta",
        collectorNumber: "1",
        colorIdentity: ["U"],
      }),
    ]);

    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    expect(screen.getByText(/2 of 2 cards/i)).toBeInTheDocument();

    act(() => {
      useFilterStore.getState().setSearchQuery("Counterspell");
    });

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 cards/i)).toBeInTheDocument();
    });
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

  it("renders price as the final filter section", () => {
    render(<FilterRail collapsed={false} onToggleCollapse={() => {}} />);

    const price = screen.getByRole("button", { name: /^price/i });

    [
      screen.getByRole("button", { name: /^color/i }),
      screen.getByRole("button", { name: /^rarity/i }),
      screen.getByRole("button", { name: /^card type/i }),
      screen.getByRole("button", { name: /^finish/i }),
      screen.getByRole("button", { name: /^set/i }),
    ].forEach((section) => {
      expect(
        Boolean(
          section.compareDocumentPosition(price) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    });
  });
});
