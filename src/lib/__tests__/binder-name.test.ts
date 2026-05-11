import { describe, it, expect } from "vitest";
import { normalizeBinderName } from "../binder-name";

/**
 * Phase 17 Task 1 — normalizeBinderName unit coverage.
 *
 * The parser (`rowToCardOrSkip`) and the Phase 19 picker UI both call this
 * helper, so it is exercised in isolation here. The CONTEXT D-12 fixture-4
 * wording asymmetry (hyphenated `"A-02"` becomes `a_02`; non-hyphenated
 * variants `"A02" / "A02 " / "a02"` stay `a02`) is exercised by case (f)
 * below and re-proven end-to-end in the parser fixture (csv-parser-content
 * test #4).
 */
describe("normalizeBinderName", () => {
  describe.each([
    // case label                     | input                 | expected
    ["lowercases input",                "A07",                  "a07"],
    ["trims trailing whitespace",       "A07 ",                 "a07"],
    ["trims leading whitespace",        " A07",                 "a07"],
    ["collapses internal whitespace",   "A  07",                "a 07"],
    ["replaces hyphen with underscore", "A-07",                 "a_07"],
    [
      "preserves multilingual / accented characters through lowercase",
      "compré titán",
      "compré titán",
    ],
    [
      "trims, collapses, and hyphen-converts in combination",
      "  Lord Of The - Rings  ",
      "lord of the _ rings",
    ],
  ])("%s", (_label, input, expected) => {
    it(`'${input}' -> '${expected}'`, () => {
      expect(normalizeBinderName(input)).toBe(expected);
    });
  });

  it(
    "fixture-4 asymmetry: 'A02' / 'A02 ' / 'a02' all collapse to 'a02'; 'A-02' is the lone outlier at 'a_02' " +
      "(see csv-parser-content.test.ts test #4 for end-to-end equivalence-class proof)",
    () => {
      expect(normalizeBinderName("A02")).toBe("a02");
      expect(normalizeBinderName("A02 ")).toBe("a02");
      expect(normalizeBinderName("a02")).toBe("a02");
      // Hyphenated variant grows the underscore; CONTEXT D-12 wording is
      // imprecise on this point, plan Task 1 case (f) reconciles it.
      expect(normalizeBinderName("A-02")).toBe("a_02");
    },
  );

  it("returns 'unsorted' for empty string input", () => {
    expect(normalizeBinderName("")).toBe("unsorted");
  });

  it("returns 'unsorted' for whitespace-only input", () => {
    expect(normalizeBinderName("   ")).toBe("unsorted");
  });

  it("returns 'unsorted' for null", () => {
    expect(normalizeBinderName(null as unknown as string)).toBe("unsorted");
  });

  it("returns 'unsorted' for undefined", () => {
    expect(normalizeBinderName(undefined as unknown as string)).toBe("unsorted");
  });

  it(
    "defensively coerces a numeric input to string (PapaParse dynamicTyping " +
      "may hand back numbers for purely-numeric labels)",
    () => {
      expect(normalizeBinderName(2 as unknown as string)).toBe("2");
    },
  );
});
