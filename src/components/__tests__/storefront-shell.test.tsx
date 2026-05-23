// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { CardData, PublicCard } from "@/lib/types";
import type CardGrid from "@/components/card-grid";
import type { StorefrontFacets } from "@/lib/storefront";
import { PRICE_MAX, useFilterStore } from "@/lib/store/filter-store";

const cardGridMock = vi.hoisted(() => ({
  latestProps: undefined as ComponentProps<typeof CardGrid> | undefined,
}));

vi.mock("@/components/filter-rail", () => ({
  default: () => <aside data-testid="filter-rail" />,
}));

vi.mock("@/components/sort-bar", () => ({
  default: () => <div data-testid="sort-bar" />,
}));

vi.mock("@/components/card-grid", () => ({
  default: (props: ComponentProps<typeof CardGrid>) => {
    cardGridMock.latestProps = props;
    return <div data-testid="card-grid" />;
  },
}));

import StorefrontShell from "../storefront-shell";

const meta: CardData["meta"] = {
  lastUpdated: "2026-05-22T17:09:52.330Z",
  totalCards: 0,
  totalSkipped: 0,
  totalMissingPrices: 0,
};

const facets: StorefrontFacets = {
  totalCards: 2,
  setCounts: { "Test Set": 2 },
  rarityCounts: { common: 2 },
  typeCounts: { Creature: 2 },
  colorCounts: { W: 0, U: 0, B: 0, R: 2, G: 0 },
  finishCounts: { normal: 2, foil: 0, etched: 0 },
  sets: ["Test Set"],
  rarities: ["common"],
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

function renderShell(cards = [publicCard(0), publicCard(1)]) {
  return render(
    <StorefrontShell
      cards={cards}
      meta={meta}
      initialTotal={cards.length}
      facets={{ ...facets, totalCards: cards.length }}
    />,
  );
}

beforeEach(() => {
  resetFilterStore();
  cardGridMock.latestProps = undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal("fetch", vi.fn());
});

describe("StorefrontShell server pagination lifecycle", () => {
  it("uses the server-rendered default page on first mount without refetching", async () => {
    renderShell();

    await waitFor(() => expect(cardGridMock.latestProps?.cards).toHaveLength(2));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches the matching page on first mount when persisted filters are already active", async () => {
    const goblin = publicCard(9, { name: "Goblin Guide" });
    useFilterStore.getState().setSearchQuery("goblin");
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ cards: [goblin], total: 1, nextOffset: null, facets }),
        { status: 200 },
      ),
    );

    renderShell();

    expect(cardGridMock.latestProps?.cards).toHaveLength(0);
    expect(cardGridMock.latestProps?.loading).toBe(true);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("q=goblin");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("offset=0");
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("limit=48");

    await waitFor(() => expect(cardGridMock.latestProps?.cards[0]?.name).toBe("Goblin Guide"));
  });
});
