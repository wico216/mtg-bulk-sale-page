import { readFileSync } from "node:fs";
import { join } from "node:path";
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

type AggregatedRowFixture = Parameters<typeof rowToAggregatedCard>[0];

/**
 * Factory for a fabricated aggregated DB row (matches the AggregatedCardRow
 * shape produced by getCardsAggregated SQL).
 */
const makeAggregatedRow = (
  overrides: Partial<AggregatedRowFixture> = {},
): AggregatedRowFixture => ({
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
  backImageUrl: "https://example.com/card-back.jpg",
  oracleText: "Flying, vigilance",
  typeLine: "Creature — Angel",
  manaValue: 4,
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
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 1299 })).price).toBe(
      12.99,
    );
  });

  it("handles null price (every-binder NULL → AVG returns NULL → null)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ price: null })).price).toBeNull();
  });

  it("handles zero cents (0 -> 0)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 0 })).price).toBe(0);
  });

  it("handles AVG-rounding edge: prices [100, 200, 300] cents → AVG = 200 → $2.00", () => {
    // AVG(100,200,300)::int = 200 (Postgres rounds toward zero on ::int cast).
    // The fixture supplies the post-AVG value; the test verifies the converter
    // honours it without further rounding.
    expect(rowToAggregatedCard(makeAggregatedRow({ price: 200 })).price).toBe(2);
  });

  it("converts createdAt Date to ISO string", () => {
    expect(rowToAggregatedCard(makeAggregatedRow()).createdAt).toBe(
      "2026-04-11T12:00:00.000Z",
    );
  });

  it("converts updatedAt Date to ISO string", () => {
    expect(rowToAggregatedCard(makeAggregatedRow()).updatedAt).toBe(
      "2026-04-11T14:00:00.000Z",
    );
  });

  it("passes through createdAt/updatedAt strings unchanged when DB returns strings", () => {
    const result = rowToAggregatedCard(
      makeAggregatedRow({
        createdAt: "2026-04-11T12:00:00.000Z",
        updatedAt: "2026-04-11T14:00:00.000Z",
      }),
    );
    expect(result.createdAt).toBe("2026-04-11T12:00:00.000Z");
    expect(result.updatedAt).toBe("2026-04-11T14:00:00.000Z");
  });

  it("passes through scryfallId (null)", () => {
    expect(
      rowToAggregatedCard(makeAggregatedRow({ scryfallId: null })).scryfallId,
    ).toBeNull();
  });

  it("passes through scryfallId (non-null)", () => {
    expect(
      rowToAggregatedCard(makeAggregatedRow({ scryfallId: "abc-123" })).scryfallId,
    ).toBe("abc-123");
  });

  it("passes binders array through unchanged (sorted distinct as SQL produces)", () => {
    const binders = ["a02", "a05", "unsorted"];
    const result = rowToAggregatedCard(makeAggregatedRow({ binders }));
    expect(result.binders).toEqual(binders);
  });

  it("returns 4-segment aggregated id (no binder suffix)", () => {
    const result = rowToAggregatedCard(
      makeAggregatedRow({ id: "sld-123-normal-near_mint" }),
    );
    expect(result.id).toBe("sld-123-normal-near_mint");
    expect(result.id.split("-").length).toBe(4);
  });

  it("maps every AdminCard field correctly", () => {
    const result = rowToAggregatedCard(makeAggregatedRow());

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
      backImageUrl: "https://example.com/card-back.jpg",
      oracleText: "Flying, vigilance",
      typeLine: "Creature — Angel",
      manaValue: 4,
      rarity: "rare",
      finish: "normal",
      binders: ["a02", "a05", "unsorted"],
      scryfallId: null,
      createdAt: "2026-04-11T12:00:00.000Z",
      updatedAt: "2026-04-11T14:00:00.000Z",
    });
  });

  it("AdminCard return shape exposes binders[] and 4-segment id", () => {
    const result = rowToAggregatedCard(makeAggregatedRow());
    expect(result).toHaveProperty("binders");
    expect(Array.isArray(result.binders)).toBe(true);
    expect(result.id.split("-")).toHaveLength(4);
  });

  it("preserves quantity as SUM(quantity) value (passes through unchanged)", () => {
    expect(rowToAggregatedCard(makeAggregatedRow({ quantity: 17 })).quantity).toBe(
      17,
    );
  });

  it("getCardsAggregated excludes sold-out grouped cards", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");

    expect(source).toMatch(
      /GROUP BY set_code, collector_number, finish, condition\s+HAVING SUM\(quantity\) > 0/s,
    );
  });

  it("public aggregate and meta queries exclude private W binders before sale aggregation", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");

    expect(source).toContain("PUBLIC_SALE_BINDER_SQL = sql`LOWER(binder) NOT LIKE 'w%'`");
    expect(source).toContain("WHERE ${PUBLIC_SALE_BINDER_SQL}");
    expect(source).toContain(".where(publicSaleBinderWhere())");
  });

  it("admin W binder aggregate query includes only private W binders", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");
    const privateQuery = source.match(
      /export async function getPrivateWBinderCardsAggregated\(\): Promise<AdminCard\[\]> \{[\s\S]*?return result\.rows\.map\(rowToAggregatedCard\);\n\}/,
    )?.[0];

    expect(privateQuery).toBeDefined();
    expect(privateQuery).toContain("WHERE ${PRIVATE_W_BINDER_SQL}");
    expect(privateQuery).toContain("ARRAY_AGG(DISTINCT binder ORDER BY binder ASC)");
  });

  it("getRecentlyAddedCards returns only latest-upload grouped cards without a hard cap", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");
    const recentQuery = source.match(
      /export async function getRecentlyAddedCards\(\): Promise<AdminCard\[\]> \{[\s\S]*?return result\.rows\.map\(rowToAggregatedCard\);\n\}/,
    )?.[0];

    expect(recentQuery).toBeDefined();
    expect(recentQuery).toMatch(/import_history/);
    expect(recentQuery).toMatch(/MAX\(created_at\)\s+AS "createdAt"/);
    expect(recentQuery).toMatch(/MAX\(latest_upload\.uploaded_at\) IS NOT NULL/);
    expect(recentQuery).toMatch(
      /MAX\(created_at\) >= MAX\(latest_upload\.uploaded_at\) - INTERVAL '10 minutes'/,
    );
    expect(recentQuery).toMatch(
      /MAX\(created_at\) <= MAX\(latest_upload\.uploaded_at\) \+ INTERVAL '10 minutes'/,
    );
    expect(recentQuery).toMatch(/ORDER BY MAX\(created_at\) DESC, MAX\(name\) ASC/);
    expect(recentQuery).not.toMatch(/INTERVAL '30 days'/);
    expect(recentQuery).not.toMatch(/NOW\(\)/);
    expect(recentQuery).not.toMatch(/LIMIT \$\{normalizedLimit\}/);
  });
});
