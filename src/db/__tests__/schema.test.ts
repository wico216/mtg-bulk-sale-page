import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { cards, orders, orderItems, orderStatusEnum } from "../schema";

describe("cards table schema", () => {
  const columns = getTableColumns(cards);

  it("has id as primary key with text type", () => {
    expect(columns.id).toBeDefined();
    expect(columns.id.dataType).toBe("string");
    expect(columns.id.notNull).toBe(true);
  });

  it("has all 16 required card columns", () => {
    const requiredColumns = [
      "id", "name", "setCode", "setName", "collectorNumber",
      "price", "condition", "quantity", "colorIdentity",
      "imageUrl", "oracleText", "rarity", "foil",
      "scryfallId", "createdAt", "updatedAt",
    ];
    for (const col of requiredColumns) {
      expect(columns[col], `missing column: ${col}`).toBeDefined();
    }
    expect(Object.keys(columns).length).toBe(16);
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
    expect((columns as any).deletedAt).toBeUndefined();
  });
});

describe("orders table schema", () => {
  const columns = getTableColumns(orders);

  it("has all required order columns", () => {
    const requiredColumns = [
      "id", "buyerName", "buyerEmail", "message",
      "totalItems", "totalPrice", "status", "createdAt",
    ];
    for (const col of requiredColumns) {
      expect(columns[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("has status column for order lifecycle (D-05)", () => {
    expect(columns.status).toBeDefined();
    expect(columns.status.notNull).toBe(true);
  });
});

describe("orderItems table schema", () => {
  const columns = getTableColumns(orderItems);

  it("has all required order item columns", () => {
    const requiredColumns = [
      "id", "orderId", "cardId", "name", "setName", "setCode",
      "collectorNumber", "condition", "price", "quantity",
      "lineTotal", "imageUrl",
    ];
    for (const col of requiredColumns) {
      expect(columns[col], `missing column: ${col}`).toBeDefined();
    }
  });

  it("has imageUrl for order history display", () => {
    expect(columns.imageUrl).toBeDefined();
    expect(columns.imageUrl.notNull).toBe(false);
  });
});

describe("orderStatusEnum", () => {
  it("has pending, confirmed, completed values (D-05)", () => {
    expect(orderStatusEnum.enumValues).toEqual(["pending", "confirmed", "completed"]);
  });
});
