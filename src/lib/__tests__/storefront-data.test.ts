import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/db/queries", () => ({
  getCardsAggregated: vi.fn(),
  getCardsMeta: vi.fn(),
  getRecentlyAddedCards: vi.fn(),
}));

describe("loadRecentlyAddedStorefrontData", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not cap fixture-backed New arrivals at 60 cards", async () => {
    vi.stubEnv("E2E_FIXTURES", "1");
    vi.stubEnv("E2E_BULK_FIXTURE_COUNT", "75");

    const { loadRecentlyAddedStorefrontData } = await import("../storefront-data");

    const data = await loadRecentlyAddedStorefrontData();

    expect(data.cards).toHaveLength(75);
    expect(data.cards[0]?.name).toBe("Fixture Bulk Card 0075");
    expect(data.cards.at(-1)?.name).toBe("Fixture Bulk Card 0001");
  });
});
