"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import type { Card } from "@/lib/types";

interface CartItemProps {
  cardId: string;
  quantity: number;
  card: Card | undefined;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  maxStock: number;
}

const rowShell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 12,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
};

const stepBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--ink)",
  cursor: "pointer",
  fontSize: 14,
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export default function CartItem({
  cardId,
  quantity,
  card,
  onQuantityChange,
  onRemove,
  maxStock,
}: CartItemProps) {
  const [stockWarning, setStockWarning] = useState(false);
  const warningTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showStockWarning() {
    setStockWarning(true);
    if (warningTimeout.current) clearTimeout(warningTimeout.current);
    warningTimeout.current = setTimeout(() => setStockWarning(false), 2000);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      onRemove();
    } else if (parsed > maxStock) {
      onQuantityChange(maxStock);
      showStockWarning();
    } else {
      onQuantityChange(parsed);
    }
  }

  // Stale cart item: card no longer in inventory. Per D-13 we silently strip
  // these in cart-page-client, but render defensively in case the effect
  // hasn't fired yet.
  if (!card) {
    return (
      <div style={rowShell}>
        <div
          style={{
            width: 48,
            height: 67,
            borderRadius: 4,
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontFamily: "var(--font-display)",
              color: "var(--muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cardId}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove unavailable item"
          style={{
            background: "none",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={rowShell}>
      <div
        style={{
          position: "relative",
          width: 48,
          height: 67,
          borderRadius: 3,
          overflow: "hidden",
          background: "var(--surface-2)",
          flexShrink: 0,
        }}
      >
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            width={48}
            height={67}
            style={{ objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: 8,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            no img
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={card.name}
        >
          {card.name}
        </p>
        <p
          style={{
            margin: "3px 0 0",
            fontSize: 10,
            color: "var(--muted)",
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {card.setCode.toUpperCase()} · {card.setName}
          {card.foil ? " · Foil" : ""}
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {card.price != null ? `$${card.price.toFixed(2)}` : "—"}
        </p>
      </div>

      <div style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => (quantity <= 1 ? onRemove() : onQuantityChange(quantity - 1))}
            style={stepBtn}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            type="number"
            value={quantity}
            min={1}
            max={maxStock}
            onChange={handleInputChange}
            aria-label="Quantity"
            style={{
              width: 48,
              textAlign: "center",
              fontSize: 13,
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
              padding: "4px 0",
              background: "var(--bg)",
              color: "var(--ink)",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "inherit",
              appearance: "textfield",
              MozAppearance: "textfield",
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (quantity >= maxStock) {
                showStockWarning();
              } else {
                onQuantityChange(quantity + 1);
              }
            }}
            disabled={quantity >= maxStock}
            aria-label="Increase quantity"
            style={{
              ...stepBtn,
              opacity: quantity >= maxStock ? 0.3 : 1,
              cursor: quantity >= maxStock ? "not-allowed" : "pointer",
            }}
          >
            +
          </button>
        </div>
        {stockWarning && (
          <p
            style={{
              fontSize: 10,
              color: "var(--accent)",
              marginTop: 4,
              textAlign: "center",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Only {maxStock} available
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from cart"
        style={{
          background: "none",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          padding: 6,
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
