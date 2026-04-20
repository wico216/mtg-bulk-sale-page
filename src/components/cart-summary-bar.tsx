"use client";

import Link from "next/link";

interface CartSummaryBarProps {
  totalItems: number;
  totalPrice: number;
}

export default function CartSummaryBar({
  totalItems,
  totalPrice,
}: CartSummaryBarProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span
            style={{
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: 10,
              color: "var(--muted)",
            }}
          >
            {totalItems} {totalItems === 1 ? "card" : "cards"} · Subtotal
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${totalPrice.toFixed(2)}
          </span>
        </div>
        <Link
          href="/checkout"
          style={{
            background: "var(--accent)",
            color: "var(--accent-fg)",
            padding: "12px 22px",
            borderRadius: 3,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.02em",
            textDecoration: "none",
            fontFamily: "inherit",
          }}
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
