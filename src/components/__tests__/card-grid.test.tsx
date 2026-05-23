// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import type { ComponentProps } from "react";
import type { PublicCard, CardData } from "@/lib/types";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";
import CardGrid from "../card-grid";

const meta: CardData["meta"] = {
  lastUpdated: "2026-05-22T17:09:52.330Z",
  totalCards: 0,
  totalSkipped: 0,
  totalMissingPrices: 0,
};

function publicCard(index: number, overrides: Partial<PublicCard> = {}): PublicCard {
  const padded = String(index).padStart(2, "0");
  return {
    id: `set-${padded}-normal-near_mint`,
    name: `Card ${padded}`,
    setCode: "set",
    setName: "Test Set",
    collectorNumber: padded,
    price: 1,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: null,
    typeLine: "Creature",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    ...overrides,
  };
}

function resetFilterStore() {
  useFilterStore.setState({
    allCards: [],
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

function renderGrid(props: Partial<ComponentProps<typeof CardGrid>> = {}) {
  const cards = props.cards ?? [publicCard(0), publicCard(1)];
  return render(
    <CardGrid
      cards={cards}
      meta={meta}
      inventoryTotal={props.inventoryTotal ?? cards.length}
      filteredTotal={props.filteredTotal ?? cards.length}
      hasMoreCards={props.hasMoreCards ?? false}
      loading={props.loading ?? false}
      loadingMore={props.loadingMore ?? false}
      onLoadMore={props.onLoadMore ?? vi.fn()}
      onRetry={props.onRetry ?? vi.fn()}
      errorMessage={props.errorMessage}
    />,
  );
}

beforeEach(() => {
  resetFilterStore();
});

describe("CardGrid first paint and infinite loading", () => {
  it("server-renders the first cards from props instead of an empty-store message", () => {
    const html = renderToString(
      <CardGrid
        cards={[publicCard(0), publicCard(1)]}
        meta={meta}
        inventoryTotal={2}
        filteredTotal={2}
        hasMoreCards={false}
        loading={false}
        loadingMore={false}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain("Card 00");
    expect(html).not.toContain("Nothing here.");
  });

  it("renders the paged cards it receives without waiting for the filter store", () => {
    renderGrid({ cards: [publicCard(0), publicCard(47)] });

    expect(screen.getByText("Card 00")).toBeInTheDocument();
    expect(screen.getByText("Card 47")).toBeInTheDocument();
  });

  it("requests the next server page when the load-more affordance is clicked", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();

    renderGrid({
      cards: Array.from({ length: 48 }, (_, index) => publicCard(index)),
      filteredTotal: 55,
      hasMoreCards: true,
      onLoadMore,
    });

    expect(screen.queryByText("Card 48")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show more cards/i }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows an API error with a retry affordance instead of stale empty results", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderGrid({
      cards: [],
      filteredTotal: 0,
      inventoryTotal: 10,
      errorMessage: "Couldn’t load the shelves. Try again, adjust filters, or refresh.",
      onRetry,
    });

    expect(screen.getByText(/couldn’t load the shelves/i)).toBeInTheDocument();
    expect(screen.queryByText("Nothing here.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("suppresses automatic load-more affordances while an error is visible", () => {
    renderGrid({
      cards: Array.from({ length: 48 }, (_, index) => publicCard(index)),
      filteredTotal: 55,
      hasMoreCards: true,
      errorMessage: "Couldn’t load more cards. Try again or adjust filters.",
    });

    expect(screen.getByText(/couldn’t load more cards/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more cards/i })).not.toBeInTheDocument();
  });
});
