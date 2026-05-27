import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
  },
}));

import {
  getManaBoxRemovalReport,
  manaBoxRemovalReportToCsv,
  markManaBoxItemsRemoved,
} from "../manabox-removals";

const unremovedRows = [
  {
    orderItemId: 10,
    orderRef: "ORD-20260526-0001",
    status: "confirmed",
    soldAt: "2026-05-26T12:00:00.000Z",
    cardId: "pmei-2024-5-foil-near_mint-trade_box",
    name: "Diabolic Edict",
    setName: "Pioneer Masters 2024",
    setCode: "pmei-2024",
    collectorNumber: "5",
    condition: "near_mint",
    price: 125,
    quantity: 1,
    lineTotal: 125,
    imageUrl: null,
    binder: "trade_box",
  },
  {
    orderItemId: 11,
    orderRef: "ORD-20260526-0002",
    status: "completed",
    soldAt: "2026-05-26T13:00:00.000Z",
    cardId: "pmei-2024-5-foil-near_mint-trade_box",
    name: "Diabolic Edict",
    setName: "Pioneer Masters 2024",
    setCode: "pmei-2024",
    collectorNumber: "5",
    condition: "near_mint",
    price: 100,
    quantity: 2,
    lineTotal: 200,
    imageUrl: null,
    binder: "trade_box",
  },
  {
    orderItemId: 12,
    orderRef: "ORD-20260526-0003",
    status: "pending",
    soldAt: "2026-05-26T14:00:00.000Z",
    cardId: "lea-232-normal-lightly_played-a02",
    name: "Lightning Bolt",
    setName: "Limited Edition Alpha",
    setCode: "lea",
    collectorNumber: "232",
    condition: "lightly_played",
    price: 350,
    quantity: 1,
    lineTotal: 350,
    imageUrl: "https://example.com/bolt.jpg",
    binder: "a02",
  },
];

describe("getManaBoxRemovalReport", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("groups unmarked, non-cancelled order items into ManaBox removal rows", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: unremovedRows })
      .mockResolvedValueOnce({
        rows: [
          {
            lastMarkedAt: "2026-05-25T10:00:00.000Z",
            lastMarkedBy: "admin@example.com",
          },
        ],
      });

    const report = await getManaBoxRemovalReport();

    expect(report.totalQuantity).toBe(4);
    expect(report.totalValue).toBe(6.75);
    expect(report.orderCount).toBe(3);
    expect(report.lastMarkedAt).toBe("2026-05-25T10:00:00.000Z");
    expect(report.lastMarkedBy).toBe("admin@example.com");
    expect(report.rows).toHaveLength(2);

    expect(report.rows[0]).toMatchObject({
      name: "Diabolic Edict",
      setCode: "pmei-2024",
      collectorNumber: "5",
      finish: "foil",
      condition: "near_mint",
      quantity: 3,
      totalValue: 3.25,
      orderRefs: ["ORD-20260526-0001", "ORD-20260526-0002"],
      orderItemIds: [10, 11],
      statuses: ["completed", "confirmed"],
      binders: ["trade_box"],
    });
  });

  it("exports the report as a CSV for ManaBox cleanup", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: unremovedRows.slice(0, 1) })
      .mockResolvedValueOnce({ rows: [] });

    const report = await getManaBoxRemovalReport();
    const csv = manaBoxRemovalReportToCsv(report);

    expect(csv).toContain(
      "Name,Set Code,Set Name,Collector Number,Finish,Condition,Quantity,Total Value,Order Refs,Order Item IDs,Binders,Statuses,First Sold At,Last Sold At",
    );
    expect(csv).toContain("Diabolic Edict,pmei-2024,Pioneer Masters 2024,5,foil,near_mint,1,1.25");
    expect(csv).toContain("ORD-20260526-0001");
  });

  it("uses audit-log marker rows instead of schema columns for idempotency", () => {
    const source = readFileSync(join(process.cwd(), "src/db/manabox-removals.ts"), "utf8");

    expect(source).toContain("manabox.removal_marked");
    expect(source).toContain("target_type = 'order_item'");
    expect(source).toContain("orders.status <> 'cancelled'");
    expect(source).toContain("NOT EXISTS");
  });
});

describe("markManaBoxItemsRemoved", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("deduplicates requested order item ids and reports skipped rows", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          result: {
            requestedItemIds: [10, 11, 999],
            markedItemIds: [10, 11],
            skippedItemIds: [999],
            markedQuantity: 3,
            markedAt: "2026-05-26T15:00:00.000Z",
          },
        },
      ],
    });

    const result = await markManaBoxItemsRemoved({
      orderItemIds: [10, 10, 11, 999],
      audit: { actorEmail: "admin@example.com" },
    });

    expect(result).toEqual({
      requestedItemIds: [10, 11, 999],
      markedItemIds: [10, 11],
      skippedItemIds: [999],
      markedRows: 2,
      markedQuantity: 3,
      markedAt: "2026-05-26T15:00:00.000Z",
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("rejects empty mark requests before hitting the database", async () => {
    await expect(
      markManaBoxItemsRemoved({ orderItemIds: [], audit: { actorEmail: "admin@example.com" } }),
    ).rejects.toThrow("at least one order item");
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
