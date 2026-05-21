/**
 * `<ManaCost>` — renders a Scryfall-shaped mana-cost string as inline
 * mana-font symbol badges.
 *
 * Scryfall stores `cards.mana_cost` verbatim (e.g. `"{1}{R}"`,
 * `"{X}{W}"`, `"{2}{B}{B}"`); for double-faced cards each face is
 * joined with ` // ` (e.g. `"{1}{W} // {2}{U}"`), matching the
 * notation in `getManaCost()` (src/lib/enrichment.ts).
 *
 * Tokens map onto Andrew Gioia's mana-font classes (loaded via the
 * `@import "mana-font/css/mana.min.css"` line in globals.css):
 *
 *   {W} {U} {B} {R} {G} {C}        → ms-w ms-u ms-b ms-r ms-g ms-c
 *   {0}..{20}                      → ms-0..ms-20
 *   {X} {Y} {Z}                    → ms-x / ms-y / ms-z
 *   {W/U} {2/W} {W/P} …            → ms-wu / ms-2w / ms-wp (slash dropped, lowercased)
 *   {S}  (snow)                    → ms-s
 *   {T}  (tap)                     → ms-tap
 *
 * The `ms-cost` modifier wraps each glyph in the iconic colored
 * badge that every MTG player recognises.
 *
 * Behaviour matrix for the source data:
 *   - `null`        → empty fragment (Scryfall didn't resolve mana_cost)
 *   - `""`          → empty fragment (lands explicitly have no cost)
 *   - whitespace    → empty fragment (defensive — same as "")
 *   - `"{1}{R}"`    → two badges
 *   - `"{X}{W}"`    → two badges
 *   - `"{1}{W} // {2}{U}"` → first face's badges, " // " separator, second face's badges
 */
const MANA_FONT_TAP = "tap" as const;

function symbolClass(token: string): string {
  // Drop slashes (hybrid like W/U → wu, 2/W → 2w, W/P → wp) and lowercase
  // so the class name matches mana-font's `ms-wu`, `ms-2w`, `ms-wp` glyphs.
  const slug = token.replace(/\//g, "").toLowerCase();
  // {T} is the tap symbol in Scryfall notation; mana-font names it ms-tap,
  // not ms-t. Untap is {Q}/ms-untap. Everything else maps directly.
  if (slug === "t") return `ms-${MANA_FONT_TAP}`;
  if (slug === "q") return "ms-untap";
  return `ms-${slug}`;
}

function parseTokens(face: string): string[] {
  const tokens: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(face)) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

export interface ManaCostProps {
  /** Raw Scryfall mana-cost string. Null/empty render nothing. */
  cost: string | null | undefined;
  /** Optional extra className appended to the wrapper. */
  className?: string;
  /** Optional accessible label override (defaults to the raw cost string). */
  ariaLabel?: string;
}

export function ManaCost({ cost, className, ariaLabel }: ManaCostProps) {
  if (cost == null) return null;
  const trimmed = cost.trim();
  if (trimmed === "") return null;

  const faces = trimmed.split(" // ");
  const label = ariaLabel ?? `Mana cost ${trimmed}`;

  return (
    <span
      className={className}
      aria-label={label}
      role="img"
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {faces.map((face, faceIdx) => {
        const tokens = parseTokens(face);
        return (
          <span
            key={faceIdx}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {faceIdx > 0 && (
              <span
                aria-hidden="true"
                style={{
                  color: "var(--dim)",
                  fontSize: "0.75em",
                  margin: "0 2px",
                }}
              >
                {"//"}
              </span>
            )}
            {tokens.map((tok, i) => (
              <i
                key={i}
                aria-hidden="true"
                className={`ms ${symbolClass(tok)} ms-cost`}
                title={`{${tok}}`}
              />
            ))}
          </span>
        );
      })}
    </span>
  );
}
