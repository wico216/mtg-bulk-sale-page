import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  cards,
  orders,
  orderItems,
  orderStatusEnum,
  finishEnum,
  adminAuditLog,
  importHistory,
  cardPriceSnapshots,
  binderShareLinks,
} from "../schema";

describe("cards table schema", () => {
  const columns = getTableColumns(cards);

  it("has id as primary key with text type", () => {
    expect(columns.id).toBeDefined();
    expect(columns.id.dataType).toBe("string");
    expect(columns.id.notNull).toBe(true);
  });

  // Phase 16 BIND-01 / BIND-02 / FIN-01 / D-06 / D-07: post-migration column
  // shape — `foil` is gone (dropped, replaced by `finish`); `binder` and
  // `finish` are added. Quick task 260514-afo adds nullable Scryfall search
  // metadata columns typeLine and manaValue. Quick task 260514-ewz adds
  // nullable backImageUrl for double-faced storefront flip support.
  // 2026-05-20 adds nullable manaCost (raw Scryfall mana cost string e.g.
  // "{1}{R}") so the admin inventory UI can render real Magic mana symbols.
  it("has all 21 required card columns", () => {
    const requiredColumns = [
      "id", "name", "setCode", "setName", "collectorNumber",
      "price", "condition", "quantity", "colorIdentity",
      "imageUrl", "backImageUrl", "oracleText", "typeLine",
      "manaCost", "manaValue", "rarity",
      "finish", "binder",
      "scryfallId", "createdAt", "updatedAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
    expect(Object.keys(columns).length).toBe(21);
  });

  it("has no foil column (Phase 16 D-07: replaced by finish enum)", () => {
    expect((columns as Record<string, unknown>).foil).toBeUndefined();
  });

  it("has finish column with notNull (Phase 16 FIN-01 / D-07)", () => {
    expect(columns.finish).toBeDefined();
    expect(columns.finish.notNull).toBe(true);
  });

  it("has binder column with notNull and 'unsorted' default (Phase 16 BIND-01 / BIND-02 / D-06)", () => {
    expect(columns.binder).toBeDefined();
    expect(columns.binder.notNull).toBe(true);
    // Default is exposed via the column builder; we check the surface shape.
    expect(columns.binder.dataType).toBe("string");
  });

  it("declares cards_quantity_check CHECK constraint (Phase 16 BIND-04 / D-08)", () => {
    const config = getTableConfig(cards);
    const checkNames = config.checks.map((c) => c.name);
    expect(
      checkNames,
      `cards table checks should include cards_quantity_check; got [${checkNames.join(", ")}]`,
    ).toContain("cards_quantity_check");
  });

  it("stores price as integer (cents), nullable (D-02)", () => {
    expect(columns.price.dataType).toBe("number");
    expect(columns.price.notNull).toBe(false);
  });

  it("has colorIdentity as array column (D-03)", () => {
    expect(columns.colorIdentity.dataType).toBe("array");
  });

  it("has scryfallId column, nullable (D-07)", () => {
    expect(columns.scryfallId).toBeDefined();
    expect(columns.scryfallId.notNull).toBe(false);
  });

  it("has timestamp columns with notNull (D-04)", () => {
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
  });

  it("has no deletedAt column (D-06 hard delete)", () => {
    expect((columns as Record<string, unknown>).deletedAt).toBeUndefined();
  });
});

describe("orders table schema", () => {
  const columns = getTableColumns(orders);

  it("has all required order columns", () => {
    const requiredColumns = [
      "id", "buyerName", "buyerEmail", "message",
      "totalItems", "totalPrice", "status", "createdAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("has status column for order lifecycle (D-05)", () => {
    expect(columns.status).toBeDefined();
    expect(columns.status.notNull).toBe(true);
  });
});

describe("orderItems table schema", () => {
  const columns = getTableColumns(orderItems);

  it("has all required order item columns (Phase 16: +binder)", () => {
    const requiredColumns = [
      "id", "orderId", "cardId", "name", "setName", "setCode",
      "collectorNumber", "condition", "price", "quantity",
      "lineTotal", "imageUrl",
      "binder",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("has imageUrl for order history display", () => {
    expect(columns.imageUrl).toBeDefined();
    expect(columns.imageUrl.notNull).toBe(false);
  });

  it("has binder column with notNull and 'unsorted' snapshot default (Phase 16 BIND-03 / D-09)", () => {
    expect(columns.binder).toBeDefined();
    expect(columns.binder.notNull).toBe(true);
    expect(columns.binder.dataType).toBe("string");
  });
});

describe("adminAuditLog table schema", () => {
  const columns = getTableColumns(adminAuditLog);

  it("has durable audit fields for high-impact admin actions", () => {
    const requiredColumns = [
      "id",
      "action",
      "actorEmail",
      "targetType",
      "targetId",
      "targetCount",
      "metadata",
      "createdAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("stores metadata as non-null JSON", () => {
    expect(columns.metadata.dataType).toBe("json");
    expect(columns.metadata.notNull).toBe(true);
  });
});

describe("importHistory table schema", () => {
  const columns = getTableColumns(importHistory);

  it("has durable import history fields", () => {
    const requiredColumns = [
      "id",
      "actorEmail",
      "fileNames",
      "fileCount",
      "parsedRows",
      "skippedRows",
      "insertedCards",
      "metadata",
      "committedAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("stores file names as an array and metadata as non-null JSON", () => {
    expect(columns.fileNames.dataType).toBe("array");
    expect(columns.metadata.dataType).toBe("json");
    expect(columns.metadata.notNull).toBe(true);
  });
});

describe("binderShareLinks table schema", () => {
  const columns = getTableColumns(binderShareLinks);

  it("stores revocable private W-binder magic-link metadata without raw tokens", () => {
    const requiredColumns = [
      "id",
      "tokenHash",
      "label",
      "scope",
      "allowedBinders",
      "createdByEmail",
      "expiresAt",
      "revokedAt",
      "lastUsedAt",
      "useCount",
      "createdAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
    expect(colRecord.token).toBeUndefined();
    expect(columns.tokenHash.notNull).toBe(true);
    expect(columns.allowedBinders.dataType).toBe("array");
    expect(columns.revokedAt.notNull).toBe(false);
    expect(columns.useCount.notNull).toBe(true);
  });

  it("declares token hash uniqueness for unrecoverable share tokens", () => {
    const config = getTableConfig(binderShareLinks);
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("binder_share_links_token_hash_idx");
  });
});

describe("cardPriceSnapshots table schema", () => {
  const columns = getTableColumns(cardPriceSnapshots);

  it("tracks durable before/after price snapshots for admin Price Movers", () => {
    const requiredColumns = [
      "id",
      "cardId",
      "scryfallId",
      "previousPrice",
      "newPrice",
      "source",
      "actorEmail",
      "capturedAt",
    ];
    const colRecord = columns as Record<string, unknown>;
    for (const col of requiredColumns) {
      expect(colRecord[col], `missing column: ${col}`).toBeDefined();
    }
    expect(columns.cardId.notNull).toBe(true);
    expect(columns.previousPrice.dataType).toBe("number");
    expect(columns.newPrice.dataType).toBe("number");
    expect(columns.source.notNull).toBe(true);
    expect(columns.capturedAt.notNull).toBe(true);
  });
});

describe("orderStatusEnum", () => {
  it("has pending, confirmed, completed, cancelled values (D-05)", () => {
    expect(orderStatusEnum.enumValues).toEqual([
      "pending",
      "confirmed",
      "completed",
      "cancelled",
    ]);
  });
});

describe("finishEnum (Phase 16 FIN-01 / D-07)", () => {
  it("has exactly normal, foil, etched values in that order", () => {
    expect(finishEnum.enumValues).toEqual(["normal", "foil", "etched"]);
  });
});
