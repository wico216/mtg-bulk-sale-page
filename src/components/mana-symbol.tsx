/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";

const DEFAULT_LABELS: Record<string, string> = {
  W: "White mana",
  U: "Blue mana",
  B: "Black mana",
  R: "Red mana",
  G: "Green mana",
  C: "Colorless mana",
};

export function getManaSymbolUrl(symbol: string) {
  const code = symbol.replace("/", "");
  return `https://svgs.scryfall.io/card-symbols/${encodeURIComponent(code)}.svg`;
}

export function ManaSymbol({
  symbol,
  size = 16,
  style,
}: {
  symbol: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <img
      src={getManaSymbolUrl(symbol)}
      alt={`{${symbol}}`}
      title={DEFAULT_LABELS[symbol] ?? `{${symbol}}`}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        verticalAlign: "text-bottom",
        ...style,
      }}
    />
  );
}
