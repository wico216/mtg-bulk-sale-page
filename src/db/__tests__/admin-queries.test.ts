import { describe, it, expect } from "vitest";

import {
  conditionToAbbr,
  abbrToCondition,
  CONDITION_OPTIONS,
} from "@/lib/condition-map";

describe("conditionToAbbr", () => {
  it('converts "near_mint" to "NM"', () => {
    expect(conditionToAbbr("near_mint")).toBe("NM");
  });

  it('converts "lightly_played" to "LP"', () => {
    expect(conditionToAbbr("lightly_played")).toBe("LP");
  });

  it('converts "moderately_played" to "MP"', () => {
    expect(conditionToAbbr("moderately_played")).toBe("MP");
  });

  it('converts "heavily_played" to "HP"', () => {
    expect(conditionToAbbr("heavily_played")).toBe("HP");
  });

  it('converts "damaged" to "DMG"', () => {
    expect(conditionToAbbr("damaged")).toBe("DMG");
  });

  it("passes through unknown values unchanged", () => {
    expect(conditionToAbbr("unknown_value")).toBe("unknown_value");
  });
});

describe("abbrToCondition", () => {
  it('converts "NM" to "near_mint"', () => {
    expect(abbrToCondition("NM")).toBe("near_mint");
  });

  it('converts "LP" to "lightly_played"', () => {
    expect(abbrToCondition("LP")).toBe("lightly_played");
  });

  it('converts "MP" to "moderately_played"', () => {
    expect(abbrToCondition("MP")).toBe("moderately_played");
  });

  it('converts "HP" to "heavily_played"', () => {
    expect(abbrToCondition("HP")).toBe("heavily_played");
  });

  it('converts "DMG" to "damaged"', () => {
    expect(abbrToCondition("DMG")).toBe("damaged");
  });

  it("passes through unknown abbreviations unchanged", () => {
    expect(abbrToCondition("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("CONDITION_OPTIONS", () => {
  it("has exactly 5 entries", () => {
    expect(CONDITION_OPTIONS).toHaveLength(5);
  });

  it("contains NM, LP, MP, HP, DMG in order", () => {
    expect([...CONDITION_OPTIONS]).toEqual(["NM", "LP", "MP", "HP", "DMG"]);
  });
});
