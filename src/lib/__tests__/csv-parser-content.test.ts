import { describe, it, expect } from "vitest";
import { parseManaboxCsvContent, parseManaboxCsvContents } from "../csv-parser";

/**
 * Helper: build a CSV string with the canonical Manabox header + data rows.
 * Header order is deterministic so row numbers (2, 3, ...) align with behavior specs.
 */
function makeCsv(rows: Record<string, string>[]): string {
  const headers = [
    "Name",
    "Set code",
    "Set name",
    "Collector number",
    "Condition",
    "Quantity",
    "Foil",
    "Rarity",
  ];
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => row[h] ?? "").join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

describe("parseManaboxCsvContent", () => {
  it("parses a fully valid CSV into Card[] with correct composite IDs and no skippedRows (Test A)", () => {
    const csv = [
      "Name,Set code,Set name,Collector number,Condition,Quantity,Foil,Rarity",
      "Lightning Bolt,lea,Alpha,232,near_mint,1,normal,rare",
      "Counterspell,mh2,Modern Horizons 2,45,lightly_played,2,foil,uncommon",
    ].join("\n");

    const result = parseManaboxCsvContent(csv);

    expect(result.skippedRows).toEqual([]);
    expect(result.cards).toHaveLength(2);

    expect(result.cards[0]).toEqual({
      id: "lea-232-normal-near_mint",
      name: "Lightning Bolt",
      setCode: "lea",
      setName: "Alpha",
      collectorNumber: "232",
      price: null,
      condition: "near_mint",
      quantity: 1,
      colorIdentity: [],
      imageUrl: null,
      oracleText: null,
      rarity: "rare",
      foil: false,
    });

    expect(result.cards[1]).toEqual({
      id: "mh2-45-foil-lightly_played",
      name: "Counterspell",
      setCode: "mh2",
      setName: "Modern Horizons 2",
      collectorNumber: "45",
      price: null,
      condition: "lightly_played",
      quantity: 2,
      colorIdentity: [],
      imageUrl: null,
      oracleText: null,
      rarity: "uncommon",
      foil: true,
    });
  });

  it("records missing Name as SkippedRow with rowNumber=2 and preserves setCode/collectorNumber (Test B)", () => {
    const csv = [
      "Name,Set code,Collector number,Condition,Quantity,Foil,Rarity,Set name",
      ",lea,232,near_mint,1,normal,rare,Alpha",
    ].join("\n");

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toEqual([]);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0]).toEqual({
      rowNumber: 2,
      reason: "missing Name",
      setCode: "lea",
      collectorNumber: "232",
    });
  });

  it("records missing Set code as SkippedRow with rowNumber=2 and correct reason (Test C)", () => {
    const csv = makeCsv([
      {
        Name: "Lightning Bolt",
        "Set code": "",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toEqual([]);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].rowNumber).toBe(2);
    expect(result.skippedRows[0].reason).toBe("missing Set code");
    expect(result.skippedRows[0].name).toBe("Lightning Bolt");
  });

  it("records missing Collector number as SkippedRow with correct reason (Test D)", () => {
    const csv = makeCsv([
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toEqual([]);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].rowNumber).toBe(2);
    expect(result.skippedRows[0].reason).toBe("missing Collector number");
    expect(result.skippedRows[0].name).toBe("Lightning Bolt");
    expect(result.skippedRows[0].setCode).toBe("lea");
  });

  it("parses mixed CSV (1 valid, 2 invalid) with correct rowNumbers on skips (Test E)", () => {
    const csv = makeCsv([
      // row 2: missing Name -> skip
      {
        Name: "",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "100",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
      },
      // row 3: valid
      {
        Name: "Valid Card",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "101",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
      },
      // row 4: missing Set code -> skip
      {
        Name: "Another Card",
        "Set code": "",
        "Set name": "Alpha",
        "Collector number": "102",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe("lea-101-normal-near_mint");
    expect(result.skippedRows).toHaveLength(2);

    const rowNumbers = result.skippedRows.map((r) => r.rowNumber).sort();
    expect(rowNumbers).toEqual([2, 4]);

    const row2 = result.skippedRows.find((r) => r.rowNumber === 2);
    const row4 = result.skippedRows.find((r) => r.rowNumber === 4);
    expect(row2?.reason).toBe("missing Name");
    expect(row4?.reason).toBe("missing Set code");
  });

  it("preserves alphanumeric Collector number '232a' as string (Test F - D-01 string coerce)", () => {
    const csv = makeCsv([
      {
        Name: "Special Card",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232a",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].collectorNumber).toBe("232a");
    expect(result.cards[0].id).toBe("lea-232a-normal-near_mint");
    expect(typeof result.cards[0].collectorNumber).toBe("string");
  });
});

describe("parseManaboxCsvContents", () => {
  it("merges duplicate cards across multiple uploaded CSV files and preserves per-file skip context", () => {
    const first = makeCsv([
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
      },
      {
        Name: "",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "233",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
      },
    ]);
    const second = makeCsv([
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "2",
        Foil: "normal",
        Rarity: "common",
      },
      {
        Name: "Counterspell",
        "Set code": "mh2",
        "Set name": "Modern Horizons 2",
        "Collector number": "45",
        Condition: "lightly_played",
        Quantity: "1",
        Foil: "foil",
        Rarity: "uncommon",
      },
    ]);

    const result = parseManaboxCsvContents([
      { fileName: "red-binder.csv", content: first },
      { fileName: "blue-binder.csv", content: second },
    ]);

    expect(result.cards).toHaveLength(2);
    expect(
      result.cards.find((card) => card.id === "lea-232-normal-near_mint")
        ?.quantity,
    ).toBe(3);
    expect(result.skippedRows).toEqual([
      expect.objectContaining({
        fileName: "red-binder.csv",
        rowNumber: 3,
        reason: "missing Name",
      }),
    ]);
    expect(result.sourceFiles).toEqual([
      { name: "red-binder.csv", parsedCards: 1, skippedRows: 1 },
      { name: "blue-binder.csv", parsedCards: 2, skippedRows: 0 },
    ]);
  });
});
