// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicCard } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import CardGrid from "../card-grid";

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
    scryfallId: "e2e-lightning-bolt-150",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

const regularNonfoil = publicCard();
const regularFoil = publicCard({
  id: "e2e-150-foil-near_mint",
  finish: "foil",
  price: 8.75,
  quantity: 1,
});
const extendedArtFoil = publicCard({
  id: "e2e-150e-foil-near_mint",
  collectorNumber: "150e",
  finish: "foil",
  price: 12,
  quantity: 1,
  scryfallId: "e2e-lightning-bolt-150e",
});

function resetStores() {
  useCartStore.setState({ items: new Map(), version: "1.3" });
  useFilterStore.setState({
    allCards: [],
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

describe("CardGrid finish variants", () => {
  beforeEach(() => {
    resetStores();
  });

  it("collapses foil and nonfoil copies of the same printing without merging extended art", async () => {
    const { container } = render(
      <CardGrid
        cards={[regularNonfoil, regularFoil, extendedArtFoil]}
        meta={{ lastUpdated: "2026-05-23T00:00:00.000Z", totalCards: 5, totalSkipped: 0, totalMissingPrices: 0 }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".wiko-card-grid .wiko-tile")).toHaveLength(2);
    });

    expect(screen.getByText("2 options")).toBeInTheDocument();
    expect(screen.getByTitle("Lightning Bolt")).toBeInTheDocument();
    expect(screen.getByTitle("Lightning Bolt - Foil")).toBeInTheDocument();
  });

  it("makes customers choose a finish in the details modal before adding grouped variants", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CardGrid
        cards={[regularNonfoil, regularFoil]}
        meta={{ lastUpdated: "2026-05-23T00:00:00.000Z", totalCards: 4, totalSkipped: 0, totalMissingPrices: 0 }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".wiko-card-grid .wiko-tile")).toHaveLength(1);
    });

    expect(screen.queryByRole("button", { name: "Quick add to cart" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /choose finish options/i }));

    expect(screen.getByRole("button", { name: /add nonfoil to satchel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add foil to satchel/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add foil to satchel/i }));

    expect(useCartStore.getState().hasItem(regularFoil.id)).toBe(true);
    expect(useCartStore.getState().hasItem(regularNonfoil.id)).toBe(false);
  });
});
