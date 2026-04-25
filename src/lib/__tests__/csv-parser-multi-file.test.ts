import { describe, it, expect } from "vitest";
import { parseManaboxCsvFiles, parseManaboxCsvContent } from "../csv-parser";

const HEADER =
  "Name,Set code,Set name,Collector number,Condition,Quantity,Foil,Rarity";

function bolt(qty: number) {
  return `Lightning Bolt,lea,Alpha,232,near_mint,${qty},normal,rare`;
}
function counterspellFoilNm(qty: number) {
  return `Counterspell,mh2,Modern Horizons 2,45,near_mint,${qty},foil,uncommon`;
}
function rowMissingSetCode() {
  return `Some Card,,,123,near_mint,1,normal,common`;
}

describe("parseManaboxCsvFiles (Phase 10.1 D-01..D-03)", () => {
  it("Test A: cross-file composite-ID duplicates sum quantities (D-03)", () => {
    const files = [
      { filename: "binder1.csv", content: [HEADER, counterspellFoilNm(1)].join("\n") },
      { filename: "binder2.csv", content: [HEADER, counterspellFoilNm(2)].join("\n") },
    ];
    const result = parseManaboxCsvFiles(files);
    expect(result.skippedRows).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe("mh2-45-foil-near_mint");
    expect(result.cards[0].quantity).toBe(3);
  });

  it("Test B: skipped rows carry the source filename and per-file row number (D-08)", () => {
    const files = [
      {
        filename: "blue.csv",
        content: [HEADER, rowMissingSetCode()].join("\n"),
      },
    ];
    const result = parseManaboxCsvFiles(files);
    expect(result.cards).toEqual([]);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].filename).toBe("blue.csv");
    expect(result.skippedRows[0].rowNumber).toBe(2); // header=row 1, first data row=row 2 INSIDE the file
    expect(result.skippedRows[0].reason).toBe("missing Set code");
  });

  it("Test C: mixed files preserve per-file provenance and per-file dedup", () => {
    const files = [
      {
        filename: "file1.csv",
        content: [HEADER, bolt(1), counterspellFoilNm(1)].join("\n"),
      },
      {
        filename: "file2.csv",
        content: [HEADER, bolt(2), rowMissingSetCode()].join("\n"),
      },
    ];
    const result = parseManaboxCsvFiles(files);
    // 2 unique composite IDs (lea-232-normal-near_mint summed to 3, mh2-45-foil-near_mint as 1)
    expect(result.cards).toHaveLength(2);
    const lightning = result.cards.find((c) => c.id === "lea-232-normal-near_mint");
    expect(lightning?.quantity).toBe(3);
    // Skipped row from file2 carries that filename
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].filename).toBe("file2.csv");
  });

  it("Test D: empty input returns empty result", () => {
    const result = parseManaboxCsvFiles([]);
    expect(result).toEqual({ cards: [], skippedRows: [] });
  });

  it("Test E: parseManaboxCsvContent (single-file path) does NOT set filename — backward compat", () => {
    const csv = [HEADER, rowMissingSetCode()].join("\n");
    const result = parseManaboxCsvContent(csv);
    expect(result.skippedRows).toHaveLength(1);
    expect(result.skippedRows[0].filename).toBeUndefined();
  });
});
