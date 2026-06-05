import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRows, executeCalls } = vi.hoisted(() => ({
  mockRows: vi.fn<() => unknown[]>(() => []),
  executeCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));

vi.mock("@/db/client", () => {
  const sqlToString = (q: unknown): string => {
    if (q === null || q === undefined) return "";
    if (typeof q === "string") return q;
    if (typeof q !== "object") return String(q);
    const obj = q as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      return (obj.queryChunks as unknown[]).map(sqlToString).join("");
    }
    if ("value" in obj) {
      const v = obj.value;
      if (Array.isArray(v)) return v.join(" ");
      return sqlToString(v);
    }
    return "";
  };

  return {
    db: {
      execute: vi.fn(async (query: unknown) => {
        const text = sqlToString(query);
        executeCalls.push(text);
        if (text.includes("latest_change")) {
          return { rows: mockRows() };
        }
        return { rows: [] };
      }),
    },
  };
});

const { getPriceMoversReport } = await import("../price-movers");

beforeEach(() => {
  mockRows.mockReset();
  executeCalls.length = 0;
});

describe("getPriceMoversReport", () => {
  it("maps latest positive inventory price changes into operator-ready rows sorted by dollar gain", async () => {
    mockRows.mockReturnValue([
      {
        cardId: "rhystic-study-wot-25-foil-near_mint-a03",
        name: "Rhystic Study",
        setCode: "wot",
        setName: "Wilds of Eldraine Enchanting Tales",
        collectorNumber: "25",
        finish: "foil",
        condition: "near_mint",
        binder: "a03",
        quantity: 2,
        imageUrl: "https://example.com/rhystic.jpg",
        currentPriceCents: 5175,
        previousPriceCents: 3820,
        newPriceCents: 5175,
        capturedAt: "2026-06-04T12:00:00.000Z",
      },
      {
        cardId: "bulk-uncommon-e2e-7-normal-near_mint-trade-box",
        name: "Bulk Uncommon Spike",
        setCode: "e2e",
        setName: "E2E Masters",
        collectorNumber: "7",
        finish: "normal",
        condition: "near_mint",
        binder: "trade-box",
        quantity: 4,
        imageUrl: null,
        currentPriceCents: 250,
        previousPriceCents: 25,
        newPriceCents: 250,
        capturedAt: "2026-06-04T11:00:00.000Z",
      },
    ]);

    const report = await getPriceMoversReport({ limit: 25 });

    expect(report.generatedAt).toEqual(expect.any(String));
    expect(report.totalRows).toBe(2);
    expect(report.totalQuantity).toBe(6);
    expect(report.totalInventoryGain).toBe(36.1);
    expect(report.biggestDollarGain).toBe(13.55);
    expect(report.highestPercentGain).toBe(900);
    expect(report.lastSnapshotAt).toBe("2026-06-04T12:00:00.000Z");
    expect(report.rows.map((row) => row.name)).toEqual([
      "Rhystic Study",
      "Bulk Uncommon Spike",
    ]);
    expect(report.rows[0]).toMatchObject({
      cardId: "rhystic-study-wot-25-foil-near_mint-a03",
      previousPrice: 38.2,
      currentPrice: 51.75,
      dollarGain: 13.55,
      percentGain: 35.47,
      inventoryGain: 27.1,
      binder: "a03",
      quantity: 2,
    });
  });

  it("creates the snapshot table lazily and queries only in-stock cards whose latest tracked change is positive", async () => {
    mockRows.mockReturnValue([]);

    await getPriceMoversReport({ limit: 10 });

    const fullSql = executeCalls.join("\n");
    expect(fullSql).toContain("CREATE TABLE IF NOT EXISTS card_price_snapshots");
    expect(fullSql).toContain("latest_change");
    expect(fullSql).toContain("DISTINCT ON");
    expect(fullSql).toContain("cards.quantity > 0");
    expect(fullSql).toContain("new_price > previous_price");
    expect(fullSql).toContain("ORDER BY dollar_gain_cents DESC");
  });
});
