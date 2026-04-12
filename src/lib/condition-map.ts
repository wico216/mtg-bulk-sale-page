/** Condition abbreviations for admin UI (per D-08) */
export const CONDITION_OPTIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type ConditionAbbr = (typeof CONDITION_OPTIONS)[number];

const DB_TO_ABBR: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

const ABBR_TO_DB: Record<string, string> = Object.fromEntries(
  Object.entries(DB_TO_ABBR).map(([k, v]) => [v, k]),
);

/** Convert database condition string to display abbreviation. Passthrough for unknown values. */
export function conditionToAbbr(dbCondition: string): string {
  return DB_TO_ABBR[dbCondition] ?? dbCondition;
}

/** Convert display abbreviation to database condition string. Passthrough for unknown values. */
export function abbrToCondition(abbr: string): string {
  return ABBR_TO_DB[abbr] ?? abbr;
}
