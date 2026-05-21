/**
 * Shared helper for normalizing Manabox `Binder Name` strings into the
 * canonical form used as both:
 *   - the `binder` segment of the 5-segment composite card id, and
 *   - the persisted `cards.binder` column value.
 *
 * Two callers consume this helper:
 *   1. Phase 17 parser (`src/lib/csv-parser.ts` `rowToCardOrSkip`) — applied
 *      at parse time so storage and display agree on the canonical form.
 *   2. Phase 19 picker UI — applied to user-edited binder labels in the
 *      import preview so a buyer who deletes the binder name in the picker
 *      doesn't accidentally key cards under an empty string.
 *
 * Algorithm (D-03 / CSV-07), applied IN THIS EXACT ORDER:
 *   1. `String(raw)` — defensive coerce. PapaParse with `dynamicTyping: true`
 *      may auto-type a numeric label like `"02"` into the number `2`; we
 *      coerce it back to a string before string operations.
 *   2. `.trim()` — strip leading/trailing whitespace.
 *   3. `.toLowerCase()` — locale-independent lowercasing (sufficient for
 *      the operator's known binder set per CONTEXT D-12 fixture #6).
 *   4. `.replace(/\s+/g, ' ')` — collapse internal runs of whitespace to a
 *      single space. Eliminates typo-driven splits like `"a  02"` vs `"a 02"`.
 *   5. `.replace(/-/g, '_')` — replace hyphens with underscores. Phase 20's
 *      cart-key segment-strip relies on hyphen-separated id segments; binder
 *      names containing hyphens would be ambiguous to the segment-strip,
 *      so we replace them at parse time. The operator's known binders use
 *      labels like `"A02"`, `"R03"`, `"Lord Of The Rings"` — none contain
 *      hyphens, so this is a defensive transform for future inputs.
 *
 * Empty input (`""`, `null`, `undefined`, all-whitespace) returns the literal
 * `'unsorted'` — the same default the parser applies when the `Binder Name`
 * column is missing entirely (D-02). This keeps the helper safe for the
 * picker UI: an empty edited label collapses back to the unsorted bucket
 * rather than producing a phantom empty-string binder.
 *
 * Multilingual / accented characters are PRESERVED through `.toLowerCase()`
 * (`"compré titán"` stays `"compré titán"`).
 *
 * Pure function, no side effects, no dependencies. Importable from both the
 * server (parser) and client (picker UI) without bundling concerns.
 *
 * @see CONTEXT D-03, CONTEXT D-12 fixture 4 (the wording note about
 *      hyphenated input growing an underscore vs non-hyphenated inputs
 *      collapsing to a single canonical form is captured in the matching
 *      parser test).
 */
export function normalizeBinderName(raw: unknown): string {
  if (raw === null || raw === undefined) return "unsorted";

  const coerced = String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/-/g, "_");

  return coerced === "" ? "unsorted" : coerced;
}

/**
 * Display-formats a normalized (lowercase) binder name for human-facing
 * surfaces (admin UI chips, order detail, dashboard breakdowns, seller email).
 * Binder codes that mix a letter run then digits ("a10") get the letter run
 * upper-cased so they read as "A10" — matches how the operator labels physical
 * binders. Pure-word names like "unsorted" get title-cased so they read as
 * "Unsorted" (we don't want UI shouting "UNSORTED").
 *
 * Storage layer remains canonical (lowercase) per `normalizeBinderName`;
 * this helper is display-only and is NEVER fed back into any persisted column,
 * filter value, picker selection key, or storage key. Compare against the raw
 * `binder` value, not the formatted output.
 *
 * Examples:
 *   "a10"      → "A10"
 *   "a02"      → "A02"
 *   "r03"      → "R03"
 *   "unsorted" → "Unsorted"
 *   ""         → "Unsorted" (defensive default; same fallback as normalize)
 */
export function formatBinderForDisplay(binder: string): string {
  if (!binder) return "Unsorted";
  const match = binder.match(/^([a-z]+)(\d.*)$/i);
  if (match) return match[1].toUpperCase() + match[2];
  return binder.charAt(0).toUpperCase() + binder.slice(1);
}
