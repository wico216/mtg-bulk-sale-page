import { describe, it, expect } from "vitest";
import { parseManaboxCsvContent, parseManaboxCsvContents } from "../csv-parser";

/**
 * Helper: build a CSV string with the canonical Manabox header + data rows.
 *
 * The base 8 headers stay in fixed order for deterministic row numbers
 * (header = row 1, first data row = row 2). The two Phase 17 binder columns
 * (`Binder Name`, `Binder Type`) are appended ONLY if at least one row
 * provides them — that way legacy tests (Tests A..F below) keep their
 * original 8-column shape and the new tests opt in by including the keys
 * in their row dicts.
 */
function makeCsv(rows: Record<string, string>[]): string {
  const baseHeaders = [
    "Name",
    "Set code",
    "Set name",
    "Collector number",
    "Condition",
    "Quantity",
    "Foil",
    "Rarity",
  ];

  const wantsBinderColumns = rows.some(
    (r) => "Binder Name" in r || "Binder Type" in r,
  );
  const headers = wantsBinderColumns
    ? [...baseHeaders, "Binder Name", "Binder Type"]
    : baseHeaders;

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
      id: "lea-232-normal-near_mint-unsorted",
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
      finish: "normal",
      binder: "unsorted",
    });

    expect(result.cards[1]).toEqual({
      id: "mh2-45-foil-lightly_played-unsorted",
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
      finish: "foil",
      binder: "unsorted",
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
    expect(result.cards[0].id).toBe("lea-101-normal-near_mint-unsorted");
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
    expect(result.cards[0].id).toBe("lea-232a-normal-near_mint-unsorted");
    expect(typeof result.cards[0].collectorNumber).toBe("string");
  });

  // ---- Phase 17 D-12 fixture matrix (8 scenarios) -----------------------

  it('parses Foil="etched" as finish="etched" with a 5-segment id distinct from normal/foil twin (D-12 fixture 1, CSV-08, Pitfall 7)', () => {
    // Three rows for the same (setCode, collectorNumber, condition, binder)
    // — one normal, one foil, one etched. They MUST produce three distinct
    // cards (no PK collision, no silent merge).
    const csv = makeCsv([
      {
        Name: "Wrath of God",
        "Set code": "2x2",
        "Set name": "Double Masters 2022",
        "Collector number": "10",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
        "Binder Name": "A07",
        "Binder Type": "binder",
      },
      {
        Name: "Wrath of God",
        "Set code": "2x2",
        "Set name": "Double Masters 2022",
        "Collector number": "10",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "foil",
        Rarity: "rare",
        "Binder Name": "A07",
        "Binder Type": "binder",
      },
      {
        Name: "Wrath of God",
        "Set code": "2x2",
        "Set name": "Double Masters 2022",
        "Collector number": "10",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "etched",
        Rarity: "rare",
        "Binder Name": "A07",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.skippedRows).toEqual([]);
    expect(result.cards).toHaveLength(3);

    const ids = result.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(3); // three distinct ids
    expect(ids).toContain("2x2-10-normal-near_mint-a07");
    expect(ids).toContain("2x2-10-foil-near_mint-a07");
    expect(ids).toContain("2x2-10-etched-near_mint-a07");

    // All three share the first three header-derived segments.
    for (const id of ids) {
      expect(id.startsWith("2x2-10-")).toBe(true);
      expect(id.split("-")).toHaveLength(5);
    }

    const finishes = result.cards.map((c) => c.finish).sort();
    expect(finishes).toEqual(["etched", "foil", "normal"]);
  });

  it("same setCode+collectorNumber+finish+condition in two binders produces two distinct rows (D-12 fixture 2)", () => {
    const csv = makeCsv([
      {
        Name: "Forest",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "294",
        Condition: "near_mint",
        Quantity: "5",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "A01",
        "Binder Type": "binder",
      },
      {
        Name: "Forest",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "294",
        Condition: "near_mint",
        Quantity: "3",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "A02",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(2);
    const ids = result.cards.map((c) => c.id).sort();
    expect(ids).toEqual([
      "lea-294-normal-near_mint-a01",
      "lea-294-normal-near_mint-a02",
    ]);
  });

  it('skips Binder Type="deck" and Binder Type="list" rows with reason "non-binder row" (D-12 fixture 3, CSV-06, D-04)', () => {
    const csv = makeCsv([
      // row 2: deck -> skip
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "Mono Red Burn",
        "Binder Type": "deck",
      },
      // row 3: list -> skip
      {
        Name: "Counterspell",
        "Set code": "mh2",
        "Set name": "Modern Horizons 2",
        "Collector number": "45",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "uncommon",
        "Binder Name": "Wishlist",
        "Binder Type": "list",
      },
      // row 4: valid binder
      {
        Name: "Black Lotus",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "rare",
        "Binder Name": "A07",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].name).toBe("Black Lotus");
    expect(result.skippedRows).toHaveLength(2);
    expect(result.skippedRows.every((r) => r.reason === "non-binder row")).toBe(
      true,
    );

    const skipRowNums = result.skippedRows.map((r) => r.rowNumber).sort();
    expect(skipRowNums).toEqual([2, 3]);
  });

  it(
    'normalizes binder names: "A02" / "A02 " / "a02" all share id; "A-02" produces a different id (D-12 fixture 4, CSV-07; ' +
      "the CONTEXT D-12 sentence 'all collapse to canonical binder a_02' is " +
      "imprecise — only the hyphenated input grows the underscore. " +
      "See src/lib/__tests__/binder-name.test.ts for the helper-level proof.)",
    () => {
      const csv = makeCsv([
        // Three variants that normalize to 'a02' (collapsed via mergeCards):
        {
          Name: "Forest",
          "Set code": "lea",
          "Set name": "Alpha",
          "Collector number": "294",
          Condition: "near_mint",
          Quantity: "1",
          Foil: "normal",
          Rarity: "common",
          "Binder Name": "A02",
          "Binder Type": "binder",
        },
        {
          Name: "Forest",
          "Set code": "lea",
          "Set name": "Alpha",
          "Collector number": "294",
          Condition: "near_mint",
          Quantity: "2",
          Foil: "normal",
          Rarity: "common",
          "Binder Name": "A02 ",
          "Binder Type": "binder",
        },
        {
          Name: "Forest",
          "Set code": "lea",
          "Set name": "Alpha",
          "Collector number": "294",
          Condition: "near_mint",
          Quantity: "4",
          Foil: "normal",
          Rarity: "common",
          "Binder Name": "a02",
          "Binder Type": "binder",
        },
        // Hyphenated variant: distinct id ending in -a_02
        {
          Name: "Forest",
          "Set code": "lea",
          "Set name": "Alpha",
          "Collector number": "294",
          Condition: "near_mint",
          Quantity: "8",
          Foil: "normal",
          Rarity: "common",
          "Binder Name": "A-02",
          "Binder Type": "binder",
        },
      ]);

      const result = parseManaboxCsvContent(csv);

      // Two distinct cards after merge: -a02 (sum of 1+2+4=7) and -a_02 (8).
      expect(result.cards).toHaveLength(2);

      const a02 = result.cards.find(
        (c) => c.id === "lea-294-normal-near_mint-a02",
      );
      const aUnderscore02 = result.cards.find(
        (c) => c.id === "lea-294-normal-near_mint-a_02",
      );
      expect(a02).toBeDefined();
      expect(aUnderscore02).toBeDefined();
      expect(a02!.quantity).toBe(7); // 1 + 2 + 4
      expect(aUnderscore02!.quantity).toBe(8);
    },
  );

  it('skips Quantity=0 rows with reason "zero quantity" (D-12 fixture 5, D-05)', () => {
    const csv = makeCsv([
      // row 2: Quantity=0 -> skip
      {
        Name: "Empty Slot",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "999",
        Condition: "near_mint",
        Quantity: "0",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "A01",
        "Binder Type": "binder",
      },
      // row 3: valid
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "A01",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].name).toBe("Lightning Bolt");
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].reason).toBe("zero quantity");
    expect(result.skippedRows[0].rowNumber).toBe(2);
  });

  it("preserves multilingual binder name through normalization (D-12 fixture 6)", () => {
    const csv = makeCsv([
      {
        Name: "Llanowar Elves",
        "Set code": "m21",
        "Set name": "Core Set 2021",
        "Collector number": "188",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "Compré Titán",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].binder).toBe("compré titán");
    // Internal whitespace collapses but a single space survives — id ends
    // in '-compré titán' (with the literal space).
    expect(result.cards[0].id).toBe(
      "m21-188-normal-near_mint-compré titán",
    );
  });

  it("mixed normal/foil/etched in one CSV produces three cards with three finish values (D-12 fixture 7)", () => {
    const csv = makeCsv([
      {
        Name: "Lightning Bolt",
        "Set code": "lea",
        "Set name": "Alpha",
        "Collector number": "232",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "normal",
        Rarity: "common",
        "Binder Name": "A01",
        "Binder Type": "binder",
      },
      {
        Name: "Counterspell",
        "Set code": "mh2",
        "Set name": "Modern Horizons 2",
        "Collector number": "45",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "foil",
        Rarity: "uncommon",
        "Binder Name": "A02",
        "Binder Type": "binder",
      },
      {
        Name: "Wrath of God",
        "Set code": "2x2",
        "Set name": "Double Masters 2022",
        "Collector number": "10",
        Condition: "near_mint",
        Quantity: "1",
        Foil: "etched",
        Rarity: "rare",
        "Binder Name": "A03",
        "Binder Type": "binder",
      },
    ]);

    const result = parseManaboxCsvContent(csv);

    expect(result.cards).toHaveLength(3);
    const finishes = result.cards.map((c) => c.finish).sort();
    expect(finishes).toEqual(["etched", "foil", "normal"]);

    const ids = result.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("legacy export without Binder Name / Binder Type columns defaults binder=unsorted and Binder Type defaults to binder (D-12 fixture 8, D-02 graceful degradation)", () => {
    // CSV uses the original 8-column header (no Binder columns).
    const csv = [
      "Name,Set code,Set name,Collector number,Condition,Quantity,Foil,Rarity",
      "Lightning Bolt,lea,Alpha,232,near_mint,1,normal,common",
      "Counterspell,mh2,Modern Horizons 2,45,lightly_played,2,foil,uncommon",
    ].join("\n");

    const result = parseManaboxCsvContent(csv);

    expect(result.skippedRows).toEqual([]);
    expect(result.cards).toHaveLength(2);

    for (const card of result.cards) {
      expect(card.binder).toBe("unsorted");
      expect(card.id.endsWith("-unsorted")).toBe(true);
      expect(card.id.split("-")).toHaveLength(5);
    }
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
      result.cards.find(
        (card) => card.id === "lea-232-normal-near_mint-unsorted",
      )?.quantity,
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
