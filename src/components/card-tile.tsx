"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PublicCard, Finish } from "@/lib/types";
import type { CardSelectionController } from "@/lib/card-selection";
import { formatBinderForDisplay } from "@/lib/binder-name";
import { useCartStore } from "@/lib/store/cart-store";

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatDisplayName(card: PublicCard, variantCount = 1): string {
  if (variantCount > 1) return card.name;
  if (card.finish === "foil") return `${card.name} - Foil`;
  if (card.finish === "etched") return `${card.name} - Etched`;
  return card.name;
}

function formatTilePrice(card: PublicCard, variants: PublicCard[]): string {
  if (variants.length <= 1) return formatPrice(card.price);
  const pricedVariants = variants
    .map((variant) => variant.price)
    .filter((price): price is number => price !== null);
  if (pricedVariants.length === 0) return "From —";
  return `From ${formatPrice(Math.min(...pricedVariants))}`;
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
        zIndex: 2,
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

function IconTransform({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17 3h4v4" />
      <path d="M21 3l-7 7" />
      <path d="M7 21H3v-4" />
      <path d="M3 21l7-7" />
      <path d="M14 3h-3a8 8 0 0 0-8 8v1" />
      <path d="M10 21h3a8 8 0 0 0 8-8v-1" />
    </svg>
  );
}

interface CardTileProps {
  card: PublicCard;
  variants?: PublicCard[];
  selectionController?: CardSelectionController;
  onClick: () => void;
}

type CardWithOptionalBinders = PublicCard & { binders?: string[] };

function getVariantBinders(variants: PublicCard[]): string[] {
  const binders = variants.flatMap((variant) =>
    Array.isArray((variant as CardWithOptionalBinders).binders)
      ? ((variant as CardWithOptionalBinders).binders ?? [])
      : [],
  );
  return [...new Set(binders)].sort();
}

export default function CardTile({
  card,
  variants = [card],
  selectionController,
  onClick,
}: CardTileProps) {
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const selectionItems = selectionController?.items ?? cartItems;
  const addSelectionItem = selectionController?.addItem ?? addItem;
  const inCart = variants.some((variant) => selectionItems.has(variant.id));
  const qty = variants.reduce((sum, variant) => sum + (selectionItems.get(variant.id) ?? 0), 0);
  const isGrouped = variants.length > 1;
  const displayName = formatDisplayName(card, variants.length);
  const tilePrice = formatTilePrice(card, variants);
  const binderLabels = getVariantBinders(variants).map(formatBinderForDisplay);
  const [showingBack, setShowingBack] = useState(false);
  const hasBackFace = Boolean(card.backImageUrl);
  const activeImageUrl =
    showingBack && card.backImageUrl ? card.backImageUrl : card.imageUrl;

  // Image fade-in. loadedUrl tracks WHICH url finished loading so the
  // Transform flip fades the other face in too. The `complete` check is
  // load-bearing: cached/SSR-decoded images (and tiles re-mounted by the
  // grid virtualizer on scroll-back) never re-fire onLoad — without it
  // they would stay stuck at opacity 0. A callback ref (not an effect —
  // react-hooks/set-state-in-effect) performs the check at attach time;
  // the same-value setState bails out, so no render loop.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const imageLoaded = loadedUrl === activeImageUrl;
  const handleImageRef = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoadedUrl(activeImageUrl);
  };

  // Quick-add ✓ confirmation. After 900ms the button returns to the
  // pre-existing end state (hidden while inCart, ×qty badge showing).
  // Timer cleared on unmount — the virtualizer unmounts tiles freely.
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

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
        data-finish={
          !isGrouped && card.finish !== "normal" ? card.finish : undefined
        }
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
        {activeImageUrl ? (
          <Image
            ref={handleImageRef}
            src={activeImageUrl}
            alt={`${card.name} ${showingBack ? "back" : "front"}`}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className={`object-cover wiko-card-img${imageLoaded ? " wiko-card-img--loaded" : ""}`}
            onLoad={() => setLoadedUrl(activeImageUrl)}
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
        {!isGrouped && <FinishPill finish={card.finish} />}
        {isGrouped && (
          <span
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              zIndex: 2,
              fontSize: 9,
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.1em",
              background: "var(--ink)",
              color: "var(--bg)",
              padding: "2px 5px",
              borderRadius: 2,
            }}
          >
            {variants.length} OPTIONS
          </span>
        )}
        {hasBackFace && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowingBack((current) => !current);
            }}
            aria-label={
              showingBack ? "Transform card to front side" : "Transform card to back side"
            }
            title="Transform"
            style={{
              position: "absolute",
              left: 6,
              bottom: 6,
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              minWidth: 86,
              height: 28,
              padding: "0 8px",
              borderRadius: 3,
              border: "1px solid rgba(17,24,39,0.18)",
              background: "rgba(255,255,255,0.92)",
              color: "#111827",
              boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            <IconTransform />
            <span>Transform</span>
          </button>
        )}
        {card.price == null && (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              zIndex: 2,
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
              zIndex: 2,
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
        <button
          type="button"
          className={`wiko-tile-add${justAdded ? " wiko-tile-add--added" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isGrouped) {
              onClick();
              return;
            }
            if (!inCart) {
              addSelectionItem(card.id, card.quantity);
              setJustAdded(true);
              if (addedTimer.current) clearTimeout(addedTimer.current);
              addedTimer.current = setTimeout(() => setJustAdded(false), 900);
            }
          }}
          aria-label={
            isGrouped
              ? (selectionController?.copy?.chooseOptionsLabel ?? "Choose finish options")
              : justAdded
                ? "Added to satchel"
                : (selectionController?.copy?.quickAddLabel ?? "Quick add to cart")
          }
          title={
            isGrouped
              ? "Choose finish"
              : (selectionController?.copy?.quickAddLabel ?? "Quick add")
          }
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            opacity: 0,
            width: isGrouped ? 64 : 28,
            height: 28,
            borderRadius: isGrouped ? 3 : "50%",
            background: justAdded ? "var(--accent)" : "var(--bg)",
            border: justAdded
              ? "1px solid transparent"
              : "1px solid var(--border-strong)",
            color: justAdded ? "var(--accent-fg)" : "var(--ink)",
            cursor: "pointer",
            display: !isGrouped && inCart && !justAdded ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isGrouped ? 10 : 16,
            fontWeight: isGrouped ? 700 : undefined,
            letterSpacing: isGrouped ? "0.08em" : undefined,
            textTransform: isGrouped ? "uppercase" : undefined,
            lineHeight: 1,
            transition: "opacity 0.15s",
            fontFamily: "inherit",
          }}
        >
          {isGrouped ? "Options" : justAdded ? "✓" : "+"}
        </button>
      </div>

      <div className="wiko-tile-body" style={{ marginTop: 10 }}>
        <div
          className="wiko-tile-title"
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
        {isGrouped && (
          <div
            style={{
              marginTop: 3,
              fontSize: 10,
              color: "var(--muted)",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {variants.length} options
          </div>
        )}
        {binderLabels.length > 0 && (
          <div
            style={{
              marginTop: 3,
              fontSize: 10,
              color: "var(--accent)",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={binderLabels.join(", ")}
          >
            {binderLabels.join(" · ")}
          </div>
        )}
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
            className="wiko-tile-set"
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
            className="wiko-tile-price"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              color: "var(--ink)",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 400,
              flexShrink: 0,
            }}
          >
            {tilePrice}
          </span>
        </div>
      </div>
    </div>
  );
}
