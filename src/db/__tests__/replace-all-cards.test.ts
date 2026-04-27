import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

// Shared builder stubs that surface as the batch() arguments.
const deleteBuilder = {
  __kind: "delete" as const,
  returning: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
};
const insertBuilder = {
  __kind: "insert" as const,
  values: vi.fn().mockReturnThis(),
};

vi.mock("@/db/client", () => ({
  db: {
    batch: vi.fn().mockResolvedValue([]),
    delete: vi.fn(() => deleteBuilder),
    insert: vi.fn(() => insertBuilder),
    transaction: undefined,
  },
}));

import { db } from "@/db/client";
import { replaceAllCards, deleteAllCards } from "../queries";
import type { Card } from "@/lib/types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "lea-232-normal-near_mint",
    name: "Lightning Bolt",
    setCode: "lea",
    setName: "Alpha",
    collectorNumber: "232",
    price: 12.99,
    condition: "near_mint",
    quantity: 1,
    colorIdentity: ["R"],
    imageUrl: "https://example.com/lightning-bolt.jpg",
    oracleText: "Lightning Bolt deals 3 damage to any target.",
    rarity: "rare",
    foil: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(db.batch).mockClear();
  vi.mocked(db.batch).mockResolvedValue([] as never);
  vi.mocked(db.delete).mockClear();
  vi.mocked(db.insert).mockClear();
  deleteBuilder.returning.mockClear();
  deleteBuilder.returning.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  insertBuilder.values.mockClear();
});

describe("replaceAllCards", () => {
  it("calls db.batch exactly once with [delete, insert] for a non-empty input (Test A)", async () => {
    const result = await replaceAllCards([makeCard(), makeCard({ id: "lea-233-normal-near_mint", collectorNumber: "233" })]);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = vi.mocked(db.batch).mock.calls[0][0] as unknown[];
    expect(Array.isArray(batchArgs)).toBe(true);
    expect(batchArgs).toHaveLength(2);
    // First arg is the delete builder
    expect(batchArgs[0]).toBe(deleteBuilder);
    // Second arg is the insert builder (after .values() chained)
    expect(batchArgs[1]).toBe(insertBuilder);

    expect(result).toEqual({ inserted: 2 });
  });

  it("calls db.batch exactly once with [delete] only for empty input (Test B)", async () => {
    const result = await replaceAllCards([]);

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = vi.mocked(db.batch).mock.calls[0][0] as unknown[];
    expect(Array.isArray(batchArgs)).toBe(true);
    expect(batchArgs).toHaveLength(1);
    expect(batchArgs[0]).toBe(deleteBuilder);
    // insert must NOT be called for the empty path
    expect(db.insert).not.toHaveBeenCalled();

    expect(result).toEqual({ inserted: 0 });
  });

  it("never invokes db.transaction (Test C)", async () => {
    await replaceAllCards([makeCard()]);
    // db.transaction is configured as undefined on the mock; ensure code path
    // doesn't depend on it (if it did, we'd throw TypeError: undefined is not a function).
    expect((db as unknown as { transaction: unknown }).transaction).toBeUndefined();
  });

  it("re-throws the same error when db.batch rejects (Test D - atomicity)", async () => {
    vi.mocked(db.batch).mockRejectedValueOnce(new Error("insert failed"));
    await expect(replaceAllCards([makeCard()])).rejects.toThrow("insert failed");
  });

  it("passes rows with dollars->cents price to insert.values (proves cardToRow is used) (Test E)", async () => {
    const card = makeCard({ price: 12.99 });
    await replaceAllCards([card]);

    expect(insertBuilder.values).toHaveBeenCalledTimes(1);
    const rowsArg = insertBuilder.values.mock.calls[0][0] as Array<{
      price: number | null;
    }>;
    expect(Array.isArray(rowsArg)).toBe(true);
    expect(rowsArg).toHaveLength(1);
    expect(rowsArg[0].price).toBe(1299); // 12.99 * 100 = 1299 cents
  });

  it("calls db.batch exactly once (double-check for Test A pattern)", async () => {
    await replaceAllCards([makeCard()]);
    expect(db.batch).toHaveBeenCalledTimes(1);
  });
});

describe("deleteAllCards", () => {
  it("deletes every card and reports the deleted row count", async () => {
    deleteBuilder.returning.mockResolvedValueOnce([
      { id: "lea-232-normal-near_mint" },
      { id: "mh2-45-foil-lightly_played" },
      { id: "sld-1-normal-near_mint" },
    ]);

    const result = await deleteAllCards();

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteBuilder.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    });
    expect(result).toEqual({ deleted: 3 });
  });
});
