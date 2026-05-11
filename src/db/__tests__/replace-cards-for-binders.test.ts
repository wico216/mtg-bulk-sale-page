import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock "server-only" to prevent it from throwing in test environment
vi.mock("server-only", () => ({}));

// Shared builder stubs that surface as the batch() arguments.
const deleteBuilder = {
  __kind: "delete" as const,
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
};
const insertBuilder = {
  __kind: "insert" as const,
  values: vi.fn().mockReturnThis(),
};
const auditInsertBuilder = {
  __kind: "audit-insert" as const,
  values: vi.fn().mockReturnThis(),
};
const importHistoryInsertBuilder = {
  __kind: "import-history-insert" as const,
  values: vi.fn().mockReturnThis(),
};
const selectBuilder = {
  __kind: "select" as const,
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  groupBy: vi.fn(),
};

// Insert call counter — first call returns insertBuilder (cards), second is
// audit (admin_audit_log), third is import_history.
let insertCallCount = 0;

vi.mock("@/db/client", () => ({
  db: {
    batch: vi.fn().mockResolvedValue([]),
    delete: vi.fn(() => deleteBuilder),
    insert: vi.fn(() => {
      insertCallCount += 1;
      if (insertCallCount === 1) return insertBuilder;
      if (insertCallCount === 2) return auditInsertBuilder;
      return importHistoryInsertBuilder;
    }),
    select: vi.fn(() => selectBuilder),
    $count: vi.fn().mockResolvedValue(100),
    transaction: undefined,
  },
}));

import { db } from "@/db/client";
import { replaceCardsForBinders, deleteAllCards } from "../queries";
import type { Card } from "@/lib/types";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "lea-232-normal-near_mint-unsorted",
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
    finish: "normal",
    binder: "unsorted",
    ...overrides,
  };
}

beforeEach(() => {
  insertCallCount = 0;
  vi.mocked(db.batch).mockClear();
  vi.mocked(db.batch).mockResolvedValue([] as never);
  vi.mocked(db.delete).mockClear();
  vi.mocked(db.insert).mockClear();
  vi.mocked(db.select).mockClear();
  // db.$count is dynamically attached on the mock; reset its call history.
  (db as unknown as { $count: ReturnType<typeof vi.fn> }).$count.mockClear();
  (db as unknown as { $count: ReturnType<typeof vi.fn> }).$count.mockResolvedValue(100);
  deleteBuilder.where.mockClear();
  deleteBuilder.where.mockReturnThis();
  deleteBuilder.returning.mockClear();
  deleteBuilder.returning.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  insertBuilder.values.mockClear();
  insertBuilder.values.mockReturnThis();
  auditInsertBuilder.values.mockClear();
  auditInsertBuilder.values.mockReturnThis();
  importHistoryInsertBuilder.values.mockClear();
  importHistoryInsertBuilder.values.mockReturnThis();
  selectBuilder.from.mockClear();
  selectBuilder.from.mockReturnThis();
  selectBuilder.where.mockClear();
  selectBuilder.where.mockReturnThis();
  selectBuilder.groupBy.mockReset();
  selectBuilder.groupBy.mockResolvedValue([
    { binder: "unsorted", count: 12 },
  ]);
});

describe("replaceCardsForBinders", () => {
  // ---- Test A: db.batch shape on the canonical happy path ------------------
  it("calls db.batch exactly once with [delete, insert, audit, importHistory] when audit + importHistory are present (Test A)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "unsorted", count: 12 },
    ]);
    const result = await replaceCardsForBinders(
      [
        makeCard(),
        makeCard({ id: "lea-233-normal-near_mint-unsorted", collectorNumber: "233" }),
      ],
      ["unsorted"],
      {
        actorEmail: "admin@example.com",
        metadata: { fileNames: ["a.csv"] },
        importHistory: {
          fileNames: ["a.csv"],
          fileCount: 1,
          parsedRows: 2,
          skippedRows: 0,
          insertedCards: 0,
        },
      },
    );

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = vi.mocked(db.batch).mock.calls[0][0] as unknown[];
    expect(Array.isArray(batchArgs)).toBe(true);
    expect(batchArgs).toHaveLength(4);
    expect(batchArgs[0]).toBe(deleteBuilder);
    expect(batchArgs[1]).toBe(insertBuilder);
    expect(batchArgs[2]).toBe(auditInsertBuilder);
    expect(batchArgs[3]).toBe(importHistoryInsertBuilder);
    expect(result.inserted).toBe(2);
  });

  // ---- Test B: empty cards => [delete, audit, importHistory] ---------------
  it("calls db.batch with [delete, audit, importHistory] for empty cards + non-empty selectedBinders (Test B)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "unsorted", count: 5 },
    ]);
    const result = await replaceCardsForBinders([], ["unsorted"], {
      actorEmail: "admin@example.com",
      importHistory: {
        fileNames: ["a.csv"],
        fileCount: 1,
        parsedRows: 0,
        skippedRows: 0,
        insertedCards: 0,
      },
    });

    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchArgs = vi.mocked(db.batch).mock.calls[0][0] as unknown[];
    expect(batchArgs).toHaveLength(3);
    expect(batchArgs[0]).toBe(deleteBuilder);
    expect(insertBuilder.values).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
  });

  // ---- Test C: never invokes db.transaction --------------------------------
  it("never invokes db.transaction (Test C)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "unsorted", count: 0 },
    ]);
    await replaceCardsForBinders([makeCard()], ["unsorted"]);
    expect((db as unknown as { transaction: unknown }).transaction).toBeUndefined();
  });

  // ---- Test D: re-throws on db.batch rejection -----------------------------
  it("re-throws the same error when db.batch rejects (Test D - atomicity)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "unsorted", count: 0 },
    ]);
    vi.mocked(db.batch).mockRejectedValueOnce(new Error("insert failed"));
    await expect(
      replaceCardsForBinders([makeCard()], ["unsorted"]),
    ).rejects.toThrow("insert failed");
  });

  // ---- Test E: cardToRow applied (price -> cents) --------------------------
  it("passes rows with dollars->cents price to insert.values (Test E)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "unsorted", count: 0 },
    ]);
    const card = makeCard({ price: 12.99 });
    await replaceCardsForBinders([card], ["unsorted"]);

    expect(insertBuilder.values).toHaveBeenCalledTimes(1);
    const rowsArg = insertBuilder.values.mock.calls[0][0] as Array<{
      price: number | null;
    }>;
    expect(rowsArg).toHaveLength(1);
    expect(rowsArg[0].price).toBe(1299);
  });

  // ---- Test F: scoped DELETE (.where invoked with inArray on binder) -------
  it("calls db.delete(cards).where(inArray(cards.binder, selectedBinders)) — scoped (Test F)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "a02", count: 12 },
      { binder: "a05", count: 7 },
    ]);
    await replaceCardsForBinders(
      [makeCard({ binder: "a02", id: "lea-232-normal-near_mint-a02" })],
      ["a02", "a05"],
    );
    expect(deleteBuilder.where).toHaveBeenCalledTimes(1);
    // The where() arg is a SQL chunk; assert it's a non-undefined object/SQL.
    const whereArg = deleteBuilder.where.mock.calls[0][0];
    expect(whereArg).toBeDefined();
  });

  // ---- Test G: throws when selectedBinders is empty (D-18) -----------------
  it("throws when selectedBinders is empty — would unbound DELETE (Test G — D-18)", async () => {
    await expect(
      replaceCardsForBinders([makeCard()], []),
    ).rejects.toThrow(/selectedBinders.*empty/i);
    expect(db.batch).not.toHaveBeenCalled();
  });

  // ---- Test H: throws when any card.binder NOT in selectedBinders (D-18) ---
  it("throws when any card.binder is not in selectedBinders (Test H — D-18 belt-and-suspenders)", async () => {
    await expect(
      replaceCardsForBinders(
        [makeCard({ binder: "a99", id: "lea-232-normal-near_mint-a99" })],
        ["a02"],
      ),
    ).rejects.toThrow(/binder.*not in selectedBinders/i);
    expect(db.batch).not.toHaveBeenCalled();
  });

  // ---- Test I: audit metadata carries ScopedImportAuditMetadata fields -----
  it("audit metadata carries ScopedImportAuditMetadata fields with deletedFromUnselected: 0 (Test I)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "a02", count: 12 },
      { binder: "a05", count: 7 },
    ]);
    (db as unknown as { $count: ReturnType<typeof vi.fn> }).$count.mockResolvedValueOnce(100);
    const cardsInput: Card[] = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeCard({ binder: "a02", id: `lea-1-normal-near_mint-a02-${i}` }),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeCard({ binder: "a05", id: `lea-1-normal-near_mint-a05-${i}` }),
      ),
    ];
    await replaceCardsForBinders(cardsInput, ["a02", "a05"], {
      actorEmail: "admin@example.com",
      metadata: { fileNames: ["a.csv"] },
      knownBinders: ["a02", "a07"],
    });

    expect(auditInsertBuilder.values).toHaveBeenCalledTimes(1);
    const auditValues = auditInsertBuilder.values.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    const meta = auditValues.metadata;
    expect(meta.selectedBinders).toEqual(["a02", "a05"]);
    expect(meta.totalBindersInExport).toBe(2);
    expect(meta.scopedReplaceCounts).toEqual({
      before: { a02: 12, a05: 7 },
      after: { a02: 12, a05: 7 },
      deletedFromUnselected: 0,
    });
    // totalBefore = 100 (from $count), beforeForSelected = 19, cards.length = 19
    // => totalCardsAfterImport = 100 - 19 + 19 = 100
    expect(meta.totalCardsAfterImport).toBe(100);
    expect(meta.newBindersInExport).toEqual(["a05"]);
    expect(meta.missingBindersFromExport).toEqual(["a07"]);
  });

  // ---- Test J: importHistory metadata has same ScopedImportAuditMetadata ---
  it("importHistory metadata also carries the ScopedImportAuditMetadata fields (Test J)", async () => {
    selectBuilder.groupBy.mockResolvedValueOnce([
      { binder: "a02", count: 12 },
      { binder: "a05", count: 7 },
    ]);
    const cardsInput: Card[] = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeCard({ binder: "a02", id: `lea-1-normal-near_mint-a02-${i}` }),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeCard({ binder: "a05", id: `lea-1-normal-near_mint-a05-${i}` }),
      ),
    ];
    await replaceCardsForBinders(cardsInput, ["a02", "a05"], {
      actorEmail: "admin@example.com",
      knownBinders: ["a02", "a07"],
      importHistory: {
        fileNames: ["a.csv"],
        fileCount: 1,
        parsedRows: 19,
        skippedRows: 0,
        insertedCards: 0,
      },
    });

    expect(importHistoryInsertBuilder.values).toHaveBeenCalledTimes(1);
    const ihValues = importHistoryInsertBuilder.values.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    const meta = ihValues.metadata;
    expect(meta.selectedBinders).toEqual(["a02", "a05"]);
    expect(meta.scopedReplaceCounts).toEqual({
      before: { a02: 12, a05: 7 },
      after: { a02: 12, a05: 7 },
      deletedFromUnselected: 0,
    });
    expect(meta.newBindersInExport).toEqual(["a05"]);
    expect(meta.missingBindersFromExport).toEqual(["a07"]);
  });

  // ---- Test K: respects MAX_AUDIT_ARRAY_LENGTH cap of 50 -------------------
  it("caps selectedBinders/newBindersInExport/missingBindersFromExport at 50 entries (Test K — D-17)", async () => {
    const sixty = Array.from({ length: 60 }, (_, i) => `b_${String(i).padStart(2, "0")}`);
    selectBuilder.groupBy.mockResolvedValueOnce(
      sixty.map((b) => ({ binder: b, count: 1 })),
    );
    const cardsInput = sixty.map((b, i) =>
      makeCard({ binder: b, id: `lea-1-normal-near_mint-${b}-${i}` }),
    );
    const knownBinders = Array.from(
      { length: 60 },
      (_, i) => `k_${String(i).padStart(2, "0")}`,
    );
    await replaceCardsForBinders(cardsInput, sixty, {
      actorEmail: "admin@example.com",
      metadata: {},
      knownBinders,
    });

    expect(auditInsertBuilder.values).toHaveBeenCalledTimes(1);
    const auditValues = auditInsertBuilder.values.mock.calls[0][0] as {
      metadata: Record<string, unknown>;
    };
    const meta = auditValues.metadata;
    expect((meta.selectedBinders as string[]).length).toBe(50);
    // newBinders = sixty - knownBinders (all 60 selected are not in known)
    expect((meta.newBindersInExport as string[]).length).toBe(50);
    // missing = knownBinders - selected (all 60 known are not in selected)
    expect((meta.missingBindersFromExport as string[]).length).toBe(50);
  });
});

describe("deleteAllCards", () => {
  it("deletes every card and reports the deleted row count", async () => {
    deleteBuilder.returning.mockResolvedValueOnce([
      { id: "lea-232-normal-near_mint-unsorted" },
      { id: "mh2-45-foil-lightly_played-unsorted" },
      { id: "sld-1-normal-near_mint-unsorted" },
    ]);

    const result = await deleteAllCards();

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(deleteBuilder.returning).toHaveBeenCalledWith({
      id: expect.anything(),
    });
    expect(result).toEqual({ deleted: 3 });
  });
});
