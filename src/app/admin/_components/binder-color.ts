/**
 * Derive a stable hue for each binder code so the inventory row's left
 * gutter (and the filter-rail's swatch) carry the same colour for the
 * same binder across the UI.
 *
 * Binder codes follow the operator's labelling scheme: a letter run
 * followed by digits (`a01`, `a02`, `r03`). Codes matching that pattern
 * map onto an evenly-spaced hue ring (≈ 18° per slot, mirroring the
 * mockup's `binderColor()`). Anything off-pattern (`unsorted`, freeform
 * names) gets a neutral dim swatch so the UI is unambiguous.
 *
 * The output is a CSS oklch() string consumed via `var()` or `style=`.
 */
export function binderColor(code: string): string {
  if (!code || code === "unsorted") return "var(--dim)";
  const m = code.toLowerCase().match(/^[a-z]+(\d+)$/);
  if (!m) return "var(--border-strong)";
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return "var(--border-strong)";
  const hue = ((n - 1) * 18) % 360;
  return `oklch(0.72 0.17 ${hue})`;
}
