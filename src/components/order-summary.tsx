"use client";

import Image from "next/image";
import Link from "next/link";

export interface OrderSummaryItem {
  name: string;
  setName: string;
  imageUrl: string | null;
  price: number | null;
  quantity: number;
}

interface OrderSummaryProps {
  items: OrderSummaryItem[];
  totalPrice: number;
  totalItems: number;
  editCartLink?: boolean;
}

export default function OrderSummary({
  items,
  totalPrice,
  editCartLink = false,
}: OrderSummaryProps) {
  return (
    <div>
      {/* Heading row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2 className="wiko-eyebrow" style={{ margin: 0 }}>
          Order summary
        </h2>
        {editCartLink && (
          <Link
            href="/cart"
            style={{
              fontSize: 12,
              color: "var(--accent)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Edit cart
          </Link>
        )}
      </div>

      {/* Item rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div
            key={`${item.name}-${item.setName}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            {/* Thumbnail: 36px wide with MTG aspect ratio ~1:1.4 */}
            <div style={{ flexShrink: 0 }}>
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  width={36}
                  height={50}
                  style={{ borderRadius: 3, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 50,
                    borderRadius: 3,
                    background: "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--muted)",
                    fontSize: 7,
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  No img
                </div>
              )}
            </div>

            {/* Card info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={item.name}
              >
                {item.name}
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
                {item.setName}
              </p>
            </div>

            {/* Quantity badge */}
            <span
              style={{
                fontSize: 12,
                color: "var(--muted)",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              x{item.quantity}
            </span>

            {/* Line total */}
            <span
              style={{
                fontSize: 13,
                color: "var(--ink)",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {item.price !== null
                ? `$${(item.price * item.quantity).toFixed(2)}`
                : "N/A"}
            </span>
          </div>
        ))}
      </div>

      {/* Total row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingTop: 14,
          marginTop: 14,
          borderTop: "1px solid var(--border-strong)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          Total
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 19,
            color: "var(--ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ${totalPrice.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
