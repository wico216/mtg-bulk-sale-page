import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

const insertBuilder = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};

const deleteBuilder = {
  where: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
    insert: vi.fn(() => insertBuilder),
    delete: vi.fn(() => deleteBuilder),
  },
}));

import { db } from "@/db/client";
import {
  createAdminAuditEntry,
  createImportHistoryEntry,
  deleteCardsByIds,
  getAdminAuditEntries,
  getImportHistory,
} from "../queries";

beforeEach(() => {
  mockExecute.mockReset();
  vi.mocked(db.insert).mockClear();
  vi.mocked(db.delete).mockClear();
  insertBuilder.values.mockClear();
  insertBuilder.returning.mockReset();
  deleteBuilder.where.mockClear();
  deleteBuilder.returning.mockReset();
});

describe("createAdminAuditEntry", () => {
  it("stores action, actor, target fields, timestamped output, and safe bounded metadata", async () => {
    insertBuilder.returning.mockResolvedValueOnce([
      {
        id: 12,
        action: "inventory.update",
        actorEmail: "admin@example.com",
        targetType: "card",
        targetId: "lea-232-normal-near_mint",
        targetCount: 1,
        metadata: { changedFields: ["price"] },
        createdAt: new Date("2026-04-28T03:04:05.000Z"),
      },
    ]);

    const entry = await createAdminAuditEntry({
      action: "inventory.update",
      actorEmail: "admin@example.com",
      targetType: "card",
      targetId: "lea-232-normal-near_mint",
      targetCount: 1,
      metadata: {
        changedFields: ["price"],
        password: "not-for-storage",
        authToken: "secret-token",
        rawCsv: "Name,Set,Collector Number\nLightning Bolt,LEA,232",
        note: "x".repeat(900),
        nested: {
          apiKey: "sk_live_123",
          safe: "kept",
        },
      },
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertBuilder.returning).toHaveBeenCalledTimes(1);
    const stored = insertBuilder.values.mock.calls[0][0] as {
      action: string;
      actorEmail: string;
      targetType: string;
      targetId: string;
      targetCount: number;
      metadata: Record<string, unknown>;
    };

    expect(stored).toMatchObject({
      action: "inventory.update",
      actorEmail: "admin@example.com",
      targetType: "card",
      targetId: "lea-232-normal-near_mint",
      targetCount: 1,
    });
    expect(stored.metadata.changedFields).toEqual(["price"]);
    expect(stored.metadata.password).toBe("[redacted]");
    expect(stored.metadata.authToken).toBe("[redacted]");
    expect(stored.metadata.rawCsv).toBe("[redacted]");
    expect((stored.metadata.note as string).length).toBeLessThanOrEqual(320);
    expect(stored.metadata.nested).toEqual({ apiKey: "[redacted]", safe: "kept" });

    expect(entry).toEqual({
      id: 12,
      action: "inventory.update",
      actorEmail: "admin@example.com",
      targetType: "card",
      targetId: "lea-232-normal-near_mint",
      targetCount: 1,
      metadata: { changedFields: ["price"] },
      createdAt: "2026-04-28T03:04:05.000Z",
    });
  });
});

describe("getAdminAuditEntries", () => {
  it("returns newest-first paginated entries with action and target filters", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            action: "inventory.delete_many",
            actorEmail: "admin@example.com",
            targetType: "inventory",
            targetId: null,
            targetCount: 2,
            metadata: { deletedIds: ["a", "b"] },
            createdAt: "2026-04-28T04:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 11 }] });

    const result = await getAdminAuditEntries({
      page: 2,
      limit: 5,
      action: "inventory.delete_many",
      targetType: "inventory",
    });

    expect(result).toEqual({
      entries: [
        {
          id: 8,
          action: "inventory.delete_many",
          actorEmail: "admin@example.com",
          targetType: "inventory",
          targetId: null,
          targetCount: 2,
          metadata: { deletedIds: ["a", "b"] },
          createdAt: "2026-04-28T04:00:00.000Z",
        },
      ],
      total: 11,
      page: 2,
      limit: 5,
      totalPages: 3,
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("orders audit entries newest first in SQL", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");

    expect(source).toContain("ORDER BY created_at DESC, id DESC");
  });
});

describe("import history", () => {
  it("stores safe file and row-count metadata for an import commit", async () => {
    insertBuilder.returning.mockResolvedValueOnce([
      {
        id: 5,
        actorEmail: "admin@example.com",
        fileNames: ["binder-a.csv", "binder-b.csv"],
        fileCount: 2,
        parsedRows: 12,
        skippedRows: 3,
        insertedCards: 9,
        metadata: { missingPrices: 1 },
        committedAt: new Date("2026-04-28T06:00:00.000Z"),
      },
    ]);

    const entry = await createImportHistoryEntry({
      actorEmail: "admin@example.com",
      fileNames: ["binder-a.csv", "binder-b.csv"],
      fileCount: 2,
      parsedRows: 12,
      skippedRows: 3,
      insertedCards: 9,
      metadata: {
        missingPrices: 1,
        rawCsv: "Name,Set,Collector Number\nLightning Bolt,LEA,232",
        cards: [{ id: "full-card-payload-should-not-store" }],
        apiToken: "secret-token",
      },
    });

    const stored = insertBuilder.values.mock.calls[0][0] as {
      actorEmail: string;
      fileNames: string[];
      fileCount: number;
      parsedRows: number;
      skippedRows: number;
      insertedCards: number;
      metadata: Record<string, unknown>;
    };

    expect(stored).toMatchObject({
      actorEmail: "admin@example.com",
      fileNames: ["binder-a.csv", "binder-b.csv"],
      fileCount: 2,
      parsedRows: 12,
      skippedRows: 3,
      insertedCards: 9,
    });
    expect(stored.metadata.missingPrices).toBe(1);
    expect(stored.metadata.rawCsv).toBe("[redacted]");
    expect(stored.metadata.cards).toBe("[redacted]");
    expect(stored.metadata.apiToken).toBe("[redacted]");

    expect(entry).toEqual({
      id: 5,
      actorEmail: "admin@example.com",
      fileNames: ["binder-a.csv", "binder-b.csv"],
      fileCount: 2,
      parsedRows: 12,
      skippedRows: 3,
      insertedCards: 9,
      metadata: { missingPrices: 1 },
      committedAt: "2026-04-28T06:00:00.000Z",
    });
  });

  it("returns newest-first paginated import history", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 6,
            actorEmail: "admin@example.com",
            fileNames: ["single-binder.csv"],
            fileCount: 1,
            parsedRows: 7,
            skippedRows: 0,
            insertedCards: 7,
            metadata: { missingPrices: 0 },
            committedAt: "2026-04-28T07:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 14 }] });

    const result = await getImportHistory({ page: 2, limit: 5 });

    expect(result).toEqual({
      entries: [
        {
          id: 6,
          actorEmail: "admin@example.com",
          fileNames: ["single-binder.csv"],
          fileCount: 1,
          parsedRows: 7,
          skippedRows: 0,
          insertedCards: 7,
          metadata: { missingPrices: 0 },
          committedAt: "2026-04-28T07:00:00.000Z",
        },
      ],
      total: 14,
      page: 2,
      limit: 5,
      totalPages: 3,
    });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("orders import history newest first in SQL", () => {
    const source = readFileSync(join(process.cwd(), "src/db/queries.ts"), "utf8");

    expect(source).toContain("FROM import_history");
    expect(source).toContain("ORDER BY committed_at DESC, id DESC");
  });
});

describe("deleteCardsByIds audit integration", () => {
  it("writes an inventory.delete_many audit entry for actual deleted rows", async () => {
    deleteBuilder.returning.mockResolvedValueOnce([
      { id: "lea-232-normal-near_mint" },
      { id: "mh2-45-normal-lightly_played" },
    ]);
    insertBuilder.returning.mockResolvedValueOnce([
      {
        id: 21,
        action: "inventory.delete_many",
        actorEmail: "admin@example.com",
        targetType: "inventory",
        targetId: null,
        targetCount: 2,
        metadata: {},
        createdAt: "2026-04-28T05:00:00.000Z",
      },
    ]);

    const result = await deleteCardsByIds(
      [
        "lea-232-normal-near_mint",
        "mh2-45-normal-lightly_played",
        "lea-232-normal-near_mint",
      ],
      { actorEmail: "admin@example.com" },
    );

    expect(result).toEqual({
      deleted: 2,
      ids: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
    });
    const stored = insertBuilder.values.mock.calls[0][0] as {
      action: string;
      actorEmail: string;
      targetType: string;
      targetId: string | null;
      targetCount: number;
      metadata: Record<string, unknown>;
    };
    expect(stored).toMatchObject({
      action: "inventory.delete_many",
      actorEmail: "admin@example.com",
      targetType: "inventory",
      targetId: null,
      targetCount: 2,
    });
    expect(stored.metadata).toEqual({
      requestedCount: 2,
      deletedIds: ["lea-232-normal-near_mint", "mh2-45-normal-lightly_played"],
    });
  });

  it("does not create an audit entry when no rows are deleted", async () => {
    deleteBuilder.returning.mockResolvedValueOnce([]);

    const result = await deleteCardsByIds(["missing-card"], {
      actorEmail: "admin@example.com",
    });

    expect(result).toEqual({ deleted: 0, ids: [] });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
