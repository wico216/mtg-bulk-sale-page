"use client";

import { useEffect } from "react";
import Image from "next/image";
import type { Card } from "@/lib/types";
import { useCartStore } from "@/lib/store/cart-store";

const CONDITION_MAP: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

function formatCondition(condition: string): string {
  return CONDITION_MAP[condition] ?? condition;
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatRarity(rarity: string): string {
  return rarity[0].toUpperCase() + rarity.slice(1);
}

const MANA_SYMBOL_RE = /\{([^}]+)\}/g;

function ManaSymbol({ symbol }: { symbol: string }) {
  const code = symbol.replace("/", "");
  return (
    <img
      src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(code)}.svg`}
      alt={`{${symbol}}`}
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        verticalAlign: "text-bottom",
        margin: "0 2px",
      }}
    />
  );
}

function OracleText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MANA_SYMBOL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<ManaSymbol key={match.index} symbol={match[1]} />);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

function IconX({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--accent-fg)",
  border: "none",
  padding: "12px 22px",
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: "0.02em",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnStep: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--ink)",
  cursor: "pointer",
  fontSize: 15,
  fontFamily: "inherit",
};

const btnGhost: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--muted)",
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  fontFamily: "inherit",
};

interface CardModalProps {
  card: Card;
  onClose: () => void;
  onImageClick: () => void;
}

export default function CardModal({ card, onClose, onImageClick }: CardModalProps) {
  const inCart = useCartStore((s) => s.hasItem(card.id));
  const qty = useCartStore((s) => s.getQuantity(card.id));
  const addItem = useCartStore((s) => s.addItem);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          color: "var(--ink)",
          width: "100%",
          maxWidth: 760,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 6,
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) 1fr",
          gap: 0,
        }}
        className="wiko-card-modal"
      >
        <button
          type="button"
          onClick={card.imageUrl ? onImageClick : undefined}
          aria-label={card.imageUrl ? "View full image" : undefined}
          style={{
            position: "relative",
            aspectRatio: "5 / 7",
            background: "var(--surface-2)",
            border: "none",
            padding: 0,
            cursor: card.imageUrl ? "zoom-in" : "default",
            borderRight: "1px solid var(--border)",
          }}
        >
          {card.imageUrl ? (
            <Image
              src={card.imageUrl}
              alt={card.name}
              fill
              sizes="(max-width: 768px) 80vw, 260px"
              style={{ objectFit: "cover" }}
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
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              [ no image ]
            </div>
          )}
        </button>

        <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 400,
                  lineHeight: 1.05,
                  letterSpacing: "-0.005em",
                }}
              >
                {card.name}
              </h3>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {card.setCode.toUpperCase()} · {card.setName} · №{card.collectorNumber} ·{" "}
                {formatRarity(card.rarity)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <IconX size={18} />
            </button>
          </div>

          <dl
            style={{
              margin: "20px 0 0",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              rowGap: 8,
              columnGap: 16,
              fontSize: 12,
            }}
          >
            <dt style={{ color: "var(--muted)" }}>Condition</dt>
            <dd style={{ margin: 0, color: "var(--ink)" }}>{formatCondition(card.condition)}</dd>
            <dt style={{ color: "var(--muted)" }}>Finish</dt>
            <dd style={{ margin: 0 }}>{card.foil ? "Foil" : "Nonfoil"}</dd>
            <dt style={{ color: "var(--muted)" }}>Color identity</dt>
            <dd style={{ margin: 0, color: "var(--muted)", fontSize: 11 }}>
              {card.colorIdentity.length ? card.colorIdentity.join(" / ") : "Colorless"}
            </dd>
            <dt style={{ color: "var(--muted)" }}>In stock</dt>
            <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{card.quantity}</dd>
          </dl>

          {card.oracleText && (
            <p
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--ink)",
                lineHeight: 1.6,
                whiteSpace: "pre-line",
              }}
            >
              <OracleText text={card.oracleText} />
            </p>
          )}

          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 30,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatPrice(card.price)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  marginTop: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                per card
              </div>
            </div>
            {!inCart ? (
              <button type="button" onClick={() => addItem(card.id, card.quantity)} style={btnPrimary}>
                Add to satchel
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() =>
                    qty <= 1
                      ? removeItem(card.id)
                      : setQuantity(card.id, qty - 1, card.quantity)
                  }
                  style={btnStep}
                >
                  −
                </button>
                <span
                  style={{
                    fontSize: 15,
                    minWidth: 24,
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(card.id, qty + 1, card.quantity)}
                  disabled={qty >= card.quantity}
                  style={{ ...btnStep, opacity: qty >= card.quantity ? 0.3 : 1 }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(card.id)}
                  style={{ ...btnGhost, marginLeft: 6 }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
