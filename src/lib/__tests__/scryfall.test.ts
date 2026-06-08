import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
}));

import { fetchCard, fetchCardsByScryfallIds } from "../scryfall";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function minimalScryfallCard(overrides: Record<string, unknown> = {}) {
  return {
    object: "card",
    id: "fd4b7ee2-de65-4288-872d-486065a4f226",
    name: "Tamiyo's Safekeeping",
    color_identity: ["G"],
    prices: { usd: "1.00", usd_foil: null, usd_etched: null },
    image_uris: { normal: "https://example.com/card.jpg" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Scryfall API client", () => {
  it("sends Scryfall-required Accept and User-Agent headers for single-card lookups", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(minimalScryfallCard()));

    const card = await fetchCard("NEO", "211");

    expect(card?.name).toBe("Tamiyo's Safekeeping");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        Accept: "application/json",
        "User-Agent": expect.stringContaining("WikoSpellbinder"),
      }),
    });
  });

  it("sends Scryfall-required Accept and User-Agent headers for collection batch lookups", async () => {
    const scryfallId = "fd4b7ee2-de65-4288-872d-486065a4f226";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        object: "list",
        not_found: [],
        data: [minimalScryfallCard({ id: scryfallId })],
      }),
    );

    const cards = await fetchCardsByScryfallIds([scryfallId]);

    expect(cards.get(scryfallId)?.name).toBe("Tamiyo's Safekeeping");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": expect.stringContaining("WikoSpellbinder"),
      }),
    });
  });
});
