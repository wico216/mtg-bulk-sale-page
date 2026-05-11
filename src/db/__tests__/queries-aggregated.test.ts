import { vi, describe, it, expect } from "vitest";

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

// Mock @/db/client; we only call rowToAggregatedCard directly so the db
// proxy is never invoked, but the import chain still triggers schema/client
// modules — the mock prevents a Neon connection attempt.
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

import { rowToAggregatedCard } from "../queries";

/**
 * Factory for a fabricated aggregated DB row (matches the AggregatedCardRow
 * shape produced by getCardsAggregated SQL). Typed loose for test ergonomics
 * — production type safety is enforced by the actual SQL `db.execute<T>`
 * generic.
 */
const makeAggregatedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "sld-123-normal-near_mint",
  name: "Test Card",
  setCode: "sld",
  setName: "Secret Lair Drop",
  collectorNumber: "123",
  // Cents from AVG(price)::int (NULL when every binder NULL).
  price: 1299,
  condition: "near_mint",
  quantity: 5,
  colorIdentity: ["W", "U"],
  imageUrl: "https://example.com/card.jpg",
  oracleText: "Flying, vigilance",
  rarity: "rare",
  finish: "normal",
  binders: ["a02", "a05", "unsorted"],
  scryfallId: null,
  createdAt: new Date("2026-04-11T12:00:00Z"),
  updatedAt: new Date("2026-04-11T14:00:00Z"),
  ...overrides,
});

describe("rowToAggregatedCard (Phase 20 D-01/D-04)", () => {
  it("converts integer cents to dollars (1299 -> 12.99)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 1299 }) as any).price).toBe(
      12.99,
    );
  });

  it("handles null price (every-binder NULL → AVG returns NULL → null)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ price: null }) as any).price).toBeNull();
  });

  it("handles zero cents (0 -> 0)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 0 }) as any).price).toBe(0);
  });

  it("handles AVG-rounding edge: prices [100, 200, 300] cents → AVG = 200 → $2.00", () => {
    // AVG(100,200,300)::int = 200 (Postgres rounds toward zero on ::int cast).
    // The fixture supplies the post-AVG value; the test verifies the converter
    // honours it without further rounding.
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 200 }) as any).price).toBe(2);
  });

  it("converts createdAt Date to ISO string", () => {
    expect(rowToAggregatedCard(makeAggregatedRow() as any).createdAt).toBe(
      "2026-04-11T12:00:00.000Z",
    );
  });

  it("converts updatedAt Date to ISO string", () => {
    expect(rowToAggregatedCard(makeAggregatedRow() as any).updatedAt).toBe(
      "2026-04-11T14:00:00.000Z",
    );
  });

  it("passes through createdAt/updatedAt strings unchanged when DB returns strings", () => {
    const result = rowToAggregatedCard(
      makeAggregatedRow({
        createdAt: "2026-04-11T12:00:00.000Z",
        updatedAt: "2026-04-11T14:00:00.000Z",
      }) as any,
    );
    expect(result.createdAt).toBe("2026-04-11T12:00:00.000Z");
    expect(result.updatedAt).toBe("2026-04-11T14:00:00.000Z");
  });

  it("passes through scryfallId (null)", () => {
    expect(
      rowToAggregatedCard(makeAggregatedRow({ scryfallId: null }) as any).scryfallId,
    ).toBeNull();
  });

  it("passes through scryfallId (non-null)", () => {
    expect(
      rowToAggregatedCard(makeAggregatedRow({ scryfallId: "abc-123" }) as any).scryfallId,
    ).toBe("abc-123");
  });

  it("passes binders array through unchanged (sorted distinct as SQL produces)", () => {
    const binders = ["a02", "a05", "unsorted"];
    const result = rowToAggregatedCard(makeAggregatedRow({ binders }) as any);
    expect(result.binders).toEqual(binders);
  });

  it("returns 4-segment aggregated id (no binder suffix)", () => {
    const result = rowToAggregatedCard(
      makeAggregatedRow({ id: "sld-123-normal-near_mint" }) as any,
    );
    expect(result.id).toBe("sld-123-normal-near_mint");
    expect(result.id.split("-").length).toBe(4);
  });

  it("maps every AdminCard field correctly", () => {
    const result = rowToAggregatedCard(makeAggregatedRow() as any);

    expect(result).toEqual({
      id: "sld-123-normal-near_mint",
      name: "Test Card",
      setCode: "sld",
      setName: "Secret Lair Drop",
      collectorNumber: "123",
      price: 12.99,
      condition: "near_mint",
      quantity: 5,
      colorIdentity: ["W", "U"],
      imageUrl: "https://example.com/card.jpg",
      oracleText: "Flying, vigilance",
      rarity: "rare",
      finish: "normal",
      binders: ["a02", "a05", "unsorted"],
      scryfallId: null,
      createdAt: "2026-04-11T12:00:00.000Z",
      updatedAt: "2026-04-11T14:00:00.000Z",
    });
  });

  it("AdminCard return shape exposes binders[] and 4-segment id", () => {
    const result = rowToAggregatedCard(makeAggregatedRow() as any);
    expect(result).toHaveProperty("binders");
    expect(Array.isArray(result.binders)).toBe(true);
    expect(result.id.split("-")).toHaveLength(4);
  });

  it("preserves quantity as SUM(quantity) value (passes through unchanged)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ quantity: 17 }) as any).quantity).toBe(
      17,
    );
  });
});
