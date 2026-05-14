"use client";

import Image from "next/image";
import type { PublicCard, Finish } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatDisplayName(card: PublicCard): string {
  if (card.finish === "foil") return `${card.name} - Foil`;
  if (card.finish === "etched") return `${card.name} - Etched`;
  return card.name;
}

/**
 * Phase 17 D-09 — finish badge in the top-left of a tile.
 * - 'normal' renders nothing (the absence of a badge IS the signal).
 * - 'foil' uses the existing var(--ink) on var(--bg) pill (preserved from v1.2).
 * - 'etched' uses an inline-style purple pill (#e9d5ff bg / #581c87 text;
 *   Tailwind bg-purple-200 text-purple-900) to differentiate visually.
 *
 * Inline styles are used to match the prevailing pattern in this file
 * (the file does not use Tailwind classes anywhere; CardTile is built on
 * inline `style={{}}` and CSS variables).
 */
function FinishPill({ finish }: { finish: Finish }) {
  if (finish === "normal") return null;

  const isEtched = finish === "etched";
  return (
    <span
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        fontSize: 9,
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        letterSpacing: "0.1em",
        background: isEtched ? "#e9d5ff" : "var(--ink)",
        color: isEtched ? "#581c87" : "var(--bg)",
        padding: "2px 5px",
        borderRadius: 2,
      }}
    >
      {isEtched ? "ETCHED" : "FOIL"}
    </span>
  );
}

interface CardTileProps {
  card: PublicCard;
  onClick: () => void;
}

export default function CardTile({ card, onClick }: CardTileProps) {
  const inCart = useCartStore((s) => s.hasItem(card.id));
  const qty = useCartStore((s) => s.getQuantity(card.id));
  const addItem = useCartStore((s) => s.addItem);
  const displayName = formatDisplayName(card);

  return (
    <div
      className="wiko-tile"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      style={{
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div
        className="wiko-tile-image"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "5 / 7",
          borderRadius: 4,
          overflow: "hidden",
          background: "var(--surface-2)",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            [ card art ]
          </div>
        )}
        <FinishPill finish={card.finish} />
        {card.price == null && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              fontSize: 9,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              color: "var(--muted)",
              background: "var(--bg)",
              padding: "2px 5px",
              borderRadius: 2,
              border: "1px solid var(--border)",
            }}
          >
            ASK
          </span>
        )}
        {inCart && (
          <span
            style={{
              position: "absolute",
              bottom: 6,
              right: 6,
              fontSize: 10,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              background: "var(--accent)",
              color: "var(--accent-fg)",
              padding: "2px 6px",
              borderRadius: 2,
              fontWeight: 500,
            }}
          >
            ×{qty}
          </span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 400,
            color: "var(--ink)",
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.005em",
          }}
          title={displayName}
        >
          {displayName}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
            title={card.setName}
          >
            {card.setCode.toUpperCase()} · {card.setName}
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              color: "var(--ink)",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 400,
              flexShrink: 0,
            }}
          >
            {formatPrice(card.price)}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="wiko-tile-add"
        onClick={(e) => {
          e.stopPropagation();
          if (!inCart) addItem(card.id, card.quantity);
        }}
        aria-label="Quick add to cart"
        style={{
          position: inCart ? "absolute" : "absolute",
          top: 8,
          right: 8,
          opacity: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          color: "var(--ink)",
          cursor: "pointer",
          display: inCart ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          lineHeight: 1,
          transition: "opacity 0.15s",
          fontFamily: "inherit",
        }}
      >
        +
      </button>
    </div>
  );
}
