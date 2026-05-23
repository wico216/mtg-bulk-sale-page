// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCard } from "@/lib/types";

const { mockGetCardsAggregated, mockLogError } = vi.hoisted(() => ({
  mockGetCardsAggregated: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries", () => ({
  getCardsAggregated: mockGetCardsAggregated,
}));
vi.mock("@/lib/logger", () => ({
  logError: mockLogError,
}));

import { GET } from "../route";

function adminCard(index: number, overrides: Partial<AdminCard> = {}): AdminCard {
  const padded = String(index).padStart(2, "0");
  return {
    id: `set-${padded}-normal-near_mint`,
    name: `Card ${padded}`,
    setCode: "set",
    setName: "Test Set",
    collectorNumber: padded,
    price: index + 1,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: null,
    backImageUrl: null,
    oracleText: "Deal damage",
    typeLine: "Creature — Dragon",
    manaValue: 1,
    rarity: "common",
    finish: "normal",
    binders: ["a02"],
    ...overrides,
  };
}

describe("GET /api/cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a paged public storefront result for infinite scroll", async () => {
    mockGetCardsAggregated.mockResolvedValue(
      Array.from({ length: 55 }, (_, index) => adminCard(index)),
    );

    const response = await GET(new Request("https://example.test/api/cards?limit=48&sort=price-desc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards).toHaveLength(48);
    expect(body.total).toBe(55);
    expect(body.nextOffset).toBe(48);
    expect(body.cards[0].name).toBe("Card 54");
  });

  it("uses the storefront page size when limit is omitted", async () => {
    mockGetCardsAggregated.mockResolvedValue(
      Array.from({ length: 55 }, (_, index) => adminCard(index)),
    );

    const response = await GET(new Request("https://example.test/api/cards?sort=price-desc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cards).toHaveLength(48);
    expect(body.nextOffset).toBe(48);
  });

  it("applies search params and never leaks binder names", async () => {
    mockGetCardsAggregated.mockResolvedValue([
      adminCard(0, {
        name: "Goblin Guide",
        typeLine: "Creature — Goblin Scout",
        binders: ["a02", "a05"],
      }),
      adminCard(1, { name: "Sol Ring", typeLine: "Artifact", binders: ["secret"] }),
    ]);

    const response = await GET(new Request("https://example.test/api/cards?q=t%3Agoblin"));
    const body = await response.json();
    const serialized = JSON.stringify(body).toLowerCase();

    expect(body.total).toBe(1);
    expect(body.cards[0].name).toBe("Goblin Guide");
    expect(body.cards[0]).not.toHaveProperty("binders");
    expect(serialized).not.toContain("binder");
    expect(serialized).not.toContain("a02");
    expect(serialized).not.toContain("secret");
  });

  it("returns structured JSON when the database lookup fails", async () => {
    mockGetCardsAggregated.mockRejectedValue(new Error("database down"));

    const response = await GET(new Request("https://example.test/api/cards"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ error: "Failed to load cards" });
    expect(mockLogError).toHaveBeenCalled();
  });
});
