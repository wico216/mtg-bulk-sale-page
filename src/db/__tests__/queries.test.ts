import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

// Mock @/db/client for getCardsMeta tests
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { rowToCard } from "../queries";

/**
 * Factory for creating mock DB rows matching cards.$inferSelect shape.
 * Typed as `any` to avoid full Drizzle inference in tests --
 * type safety is ensured by the production code.
 */
const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "sld-123-normal-NearMint",
  name: "Test Card",
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "123",
  price: 1299,
  condition: "NearMint",
  quantity: 3,
  colorIdentity: ["W", "U"],
  imageUrl: "https://example.com/card.jpg",
  oracleText: "Flying, vigilance",
  rarity: "rare",
  foil: false,
  scryfallId: null,
  createdAt: new Date("2026-04-11T12:00:00Z"),
  updatedAt: new Date("2026-04-11T14:00:00Z"),
  ...overrides,
});

describe("rowToCard", () => {
  it("converts integer cents to dollars (1299 -> 12.99)", () => {
    expect(rowToCard(makeRow({ price: 1299 }) as any).price).toBe(12.99);
  });

  it("handles null price", () => {
    expect(rowToCard(makeRow({ price: null }) as any).price).toBeNull();
  });

  it("handles zero cents (0 -> 0)", () => {
    expect(rowToCard(makeRow({ price: 0 }) as any).price).toBe(0);
  });

  it("handles large value (99999 -> 999.99)", () => {
    expect(rowToCard(makeRow({ price: 99999 }) as any).price).toBe(999.99);
  });

  it("converts createdAt Date to ISO string", () => {
    expect(rowToCard(makeRow() as any).createdAt).toBe(
      "2026-04-11T12:00:00.000Z",
    );
  });

  it("converts updatedAt Date to ISO string", () => {
    expect(rowToCard(makeRow() as any).updatedAt).toBe(
      "2026-04-11T14:00:00.000Z",
    );
  });

  it("passes through scryfallId (null)", () => {
    expect(
      rowToCard(makeRow({ scryfallId: null }) as any).scryfallId,
    ).toBeNull();
  });

  it("passes through scryfallId (non-null)", () => {
    expect(
      rowToCard(makeRow({ scryfallId: "abc-123" }) as any).scryfallId,
    ).toBe("abc-123");
  });

  it("maps all Card fields correctly", () => {
    const result = rowToCard(makeRow() as any);

    expect(result).toEqual({
      id: "sld-123-normal-NearMint",
      name: "Test Card",
      setCode: "sld",
      setName: "Secret Lair Drop",
      collectorNumber: "123",
      price: 12.99,
      condition: "NearMint",
      quantity: 3,
      colorIdentity: ["W", "U"],
      imageUrl: "https://example.com/card.jpg",
      oracleText: "Flying, vigilance",
      rarity: "rare",
      foil: false,
      scryfallId: null,
      createdAt: "2026-04-11T12:00:00.000Z",
      updatedAt: "2026-04-11T14:00:00.000Z",
    });
  });
});

describe("getCardsMeta", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns CardData['meta'] shape with all 4 required fields", async () => {
    // Set up the mock chain for Drizzle query builder
    const { db } = await import("@/db/client");
    const mockFrom = vi.fn().mockResolvedValue([
      {
        totalCards: 42,
        lastUpdated: new Date("2026-04-11T18:00:00Z"),
      },
    ]);
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db as any).select = mockSelect;

    // Re-import to pick up the mock
    vi.doMock("server-only", () => ({}));
    const { getCardsMeta } = await import("../queries");
    const meta = await getCardsMeta();

    expect(meta).toHaveProperty("lastUpdated");
    expect(meta).toHaveProperty("totalCards");
    expect(meta).toHaveProperty("totalSkipped", 0);
    expect(meta).toHaveProperty("totalMissingPrices", 0);
    expect(typeof meta.lastUpdated).toBe("string");
    expect(typeof meta.totalCards).toBe("number");
  });

  it("returns totalSkipped as exactly 0", async () => {
    const { db } = await import("@/db/client");
    const mockFrom = vi.fn().mockResolvedValue([
      {
        totalCards: 10,
        lastUpdated: new Date("2026-04-11T18:00:00Z"),
      },
    ]);
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db as any).select = mockSelect;

    vi.doMock("server-only", () => ({}));
    const { getCardsMeta } = await import("../queries");
    const meta = await getCardsMeta();
    expect(meta.totalSkipped).toBe(0);
  });

  it("returns totalMissingPrices as exactly 0", async () => {
    const { db } = await import("@/db/client");
    const mockFrom = vi.fn().mockResolvedValue([
      {
        totalCards: 10,
        lastUpdated: new Date("2026-04-11T18:00:00Z"),
      },
    ]);
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    (db as any).select = mockSelect;

    vi.doMock("server-only", () => ({}));
    const { getCardsMeta } = await import("../queries");
    const meta = await getCardsMeta();
    expect(meta.totalMissingPrices).toBe(0);
  });
});
