import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: mockFrom,
    })),
  },
}));

import { getAdminDashboardStats } from "../queries";

describe("getAdminDashboardStats", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns inventory totals and deterministic breakdowns for mixed cards", async () => {
    mockFrom.mockResolvedValueOnce([
      {
        id: "lea-232-normal-near_mint",
        setCode: "lea",
        price: 125,
        quantity: 3,
        colorIdentity: ["R"],
        rarity: "common",
        binder: "a02",
      },
      {
        id: "mh2-45-normal-lightly_played",
        setCode: "mh2",
        price: null,
        quantity: 1,
        colorIdentity: [],
        rarity: "uncommon",
        binder: "unsorted",
      },
      {
        id: "sld-1-normal-near_mint",
        setCode: "sld",
        price: 250,
        quantity: 2,
        colorIdentity: ["U", "W"],
        rarity: "rare",
        binder: "a05",
      },
    ]);

    await expect(getAdminDashboardStats()).resolves.toEqual({
      inventory: {
        uniqueCards: 3,
        totalQuantity: 6,
        totalValue: 8.75,
        lowStockCount: 1,
        missingPriceCount: 1,
      },
      breakdowns: {
        bySet: [
          { setCode: "lea", quantity: 3, uniqueCards: 1, value: 3.75 },
          { setCode: "sld", quantity: 2, uniqueCards: 1, value: 5 },
          { setCode: "mh2", quantity: 1, uniqueCards: 1, value: 0 },
        ],
        byColor: [
          { color: "R", quantity: 3, uniqueCards: 1, value: 3.75 },
          { color: "WU", quantity: 2, uniqueCards: 1, value: 5 },
          { color: "C", quantity: 1, uniqueCards: 1, value: 0 },
        ],
        byRarity: [
          { rarity: "common", quantity: 3, uniqueCards: 1, value: 3.75 },
          { rarity: "rare", quantity: 2, uniqueCards: 1, value: 5 },
          { rarity: "uncommon", quantity: 1, uniqueCards: 1, value: 0 },
        ],
        // Phase 21 Task 2: byBinder mirrors mapBreakdown sort
        // (quantity desc, label asc). a02 leads with quantity 3, then a05
        // with quantity 2, then unsorted with quantity 1.
        byBinder: [
          { binder: "a02", quantity: 3, uniqueCards: 1, value: 3.75 },
          { binder: "a05", quantity: 2, uniqueCards: 1, value: 5 },
          { binder: "unsorted", quantity: 1, uniqueCards: 1, value: 0 },
        ],
      },
    });
  });

  it("returns zero totals and empty breakdowns for empty inventory", async () => {
    mockFrom.mockResolvedValueOnce([]);

    await expect(getAdminDashboardStats()).resolves.toEqual({
      inventory: {
        uniqueCards: 0,
        totalQuantity: 0,
        totalValue: 0,
        lowStockCount: 0,
        missingPriceCount: 0,
      },
      breakdowns: {
        bySet: [],
        byColor: [],
        byRarity: [],
        byBinder: [],
      },
    });
  });
});
