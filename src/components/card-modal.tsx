"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Finish, PublicCard } from "@/lib/types";
import type { CardSelectionController } from "@/lib/card-selection";
import { formatBinderForDisplay } from "@/lib/binder-name";
import { useCartStore } from "@/lib/store/cart-store";
import { ManaSymbol } from "@/components/mana-symbol";

const CONDITION_MAP: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

const CONDITION_FULL: Record<string, string> = {
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

const CONDITION_NOTES: Record<string, string> = {
  near_mint: "pack-fresh, looks unplayed",
  lightly_played: "minor edge or surface wear — plays perfectly sleeved",
  moderately_played: "visible wear, priced accordingly",
  heavily_played: "heavy wear — a budget copy",
  damaged: "major wear — for casual play",
};

function formatCondition(condition: string): string {
  return CONDITION_MAP[condition] ?? condition;
}

function formatConditionFull(condition: string): string {
  return CONDITION_FULL[condition] ?? condition;
}

function formatConditionDisplay(condition: string): string {
  const full = CONDITION_FULL[condition];
  const abbreviation = CONDITION_MAP[condition];
  if (!full || !abbreviation) return condition;
  return `${full} (${abbreviation})`;
}

function getConditionNote(condition: string): string | undefined {
  return CONDITION_NOTES[condition];
}

function getConditionTitle(condition: string): string | undefined {
  const full = CONDITION_FULL[condition];
  const note = CONDITION_NOTES[condition];
  if (!full || !note) return undefined;
  return `${full} — ${note}`;
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatFinishName(finish: Finish): string {
  if (finish === "foil") return "Foil";
  if (finish === "etched") return "Etched";
  return "Nonfoil";
}

function variantOptionLabel(variant: PublicCard, variants: PublicCard[]): string {
  const finishLabel = formatFinishName(variant.finish);
  const duplicateFinish = variants.filter((candidate) => candidate.finish === variant.finish).length > 1;
  const conditionVaries = new Set(variants.map((candidate) => candidate.condition)).size > 1;
  if (!duplicateFinish && !conditionVaries) return finishLabel;
  return `${finishLabel} · ${formatCondition(variant.condition)}`;
}

function formatVariantSummary(variants: PublicCard[]): string {
  if (variants.length === 1) return formatFinishName(variants[0].finish);
  return `${variants.length} options`;
}

function totalQuantity(variants: PublicCard[]): number {
  return variants.reduce((sum, variant) => sum + variant.quantity, 0);
}

function formatLowestPrice(variants: PublicCard[]): string {
  const pricedVariants = variants
    .map((variant) => variant.price)
    .filter((price): price is number => price !== null);
  if (pricedVariants.length === 0) return "—";
  return formatPrice(Math.min(...pricedVariants));
}

function formatRarity(rarity: string): string {
  return rarity[0].toUpperCase() + rarity.slice(1);
}

function getScryfallUrl(card: PublicCard): string {
  return `https://scryfall.com/card/${encodeURIComponent(card.setCode)}/${encodeURIComponent(card.collectorNumber)}`;
}

const MANA_SYMBOL_RE = /\{([^}]+)\}/g;

function OracleText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MANA_SYMBOL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <ManaSymbol key={match.index} symbol={match[1]} style={{ margin: "0 2px" }} />,
    );
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
  textDecoration: "none",
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

const btnSecondary: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--ink)",
  border: "1px solid var(--border)",
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
};

interface CardModalProps {
  card: PublicCard;
  variants?: PublicCard[];
  selectionController?: CardSelectionController;
  onClose: () => void;
  onImageClick: (imageUrl: string) => void;
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

export default function CardModal({
  card,
  variants = [card],
  selectionController,
  onClose,
  onImageClick,
}: CardModalProps) {
  const cartItems = useCartStore((s) => s.items);
  const cartAddItem = useCartStore((s) => s.addItem);
  const cartSetQuantity = useCartStore((s) => s.setQuantity);
  const cartRemoveItem = useCartStore((s) => s.removeItem);
  const selectionItems = selectionController?.items ?? cartItems;
  const addItem = selectionController?.addItem ?? cartAddItem;
  const setQuantity = selectionController?.setQuantity ?? cartSetQuantity;
  const removeItem = selectionController?.removeItem ?? cartRemoveItem;
  const inCart = selectionItems.has(card.id);
  const qty = selectionItems.get(card.id) ?? 0;
  const hasMultipleVariants = variants.length > 1;
  const anyVariantInCart = variants.some((variant) => selectionItems.has(variant.id));
  const binderLabels = getVariantBinders(variants).map(formatBinderForDisplay);
  const addLabel = selectionController?.copy?.addLabel ?? "Add to satchel";
  const reviewHref = selectionController?.copy?.reviewHref ?? "/cart";
  const reviewLabel = selectionController?.copy?.reviewLabel ?? "Go to cart";
  const selectedBadgeLabel = selectionController?.copy?.selectedBadgeLabel ?? "satchel";
  const availableLabel = selectionController?.copy?.quantityAvailableLabel ?? "available";
  const conditionNote = hasMultipleVariants ? undefined : getConditionNote(card.condition);
  const etchedFinishClassName = !hasMultipleVariants && card.finish === "etched" ? "wiko-finish-etched" : undefined;
  const [imageSide, setImageSide] = useState({
    cardId: card.id,
    showingBack: false,
  });
  const showingBack =
    imageSide.cardId === card.id ? imageSide.showingBack : false;
  const activeImageUrl =
    showingBack && card.backImageUrl ? card.backImageUrl : card.imageUrl;
  const hasBackFace = Boolean(card.backImageUrl);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Focus the dialog on open; hand focus back to the opener (the originating
  // tile) on close. The tile stays mounted while the modal is open — body
  // scroll is locked, so the grid virtualizer cannot evict it meanwhile.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    return () => {
      if (
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Hand-rolled focus trap: wrap Tab / Shift+Tab at the panel edges (no
  // dependency; everything inside the panel is focusable-queryable).
  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      onClick={onClose}
      role="presentation"
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiko-card-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
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
        <div
          style={{
            background: "var(--surface-2)",
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              position: "relative",
              aspectRatio: "5 / 7",
              width: "100%",
            }}
          >
            <button
              type="button"
              onClick={
                activeImageUrl ? () => onImageClick(activeImageUrl) : undefined
              }
              aria-label={activeImageUrl ? "View full image" : undefined}
              style={{
                position: "absolute",
                inset: 0,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: activeImageUrl ? "zoom-in" : "default",
              }}
            >
              {activeImageUrl ? (
                <Image
                  src={activeImageUrl}
                  alt={`${card.name} ${showingBack ? "back" : "front"}`}
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
          </div>
          {hasBackFace && (
            <div
              style={{
                padding: 8,
                borderTop: "1px solid var(--border)",
                background: "var(--bg)",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setImageSide({
                    cardId: card.id,
                    showingBack: !showingBack,
                  })
                }
                aria-label={
                  showingBack
                    ? "Transform card to front side"
                    : "Transform card to back side"
                }
                title="Transform"
                style={{
                  width: "100%",
                  minHeight: 34,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                <IconTransform />
                <span>Transform</span>
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h3
                id="wiko-card-modal-title"
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
              <a
                href={getScryfallUrl(card)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--accent)",
                  textUnderlineOffset: 3,
                }}
              >
                View on Scryfall
              </a>
            </div>
            <button
              ref={closeButtonRef}
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
            <dd style={{ margin: 0, color: "var(--ink)" }}>
              <div>{formatConditionDisplay(card.condition)}</div>
              {conditionNote && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {conditionNote}
                </div>
              )}
            </dd>
            <dt style={{ color: "var(--muted)" }}>Finish</dt>
            <dd
              className={etchedFinishClassName}
              style={{
                margin: 0,
              }}
            >
              {formatVariantSummary(variants)}
            </dd>
            <dt style={{ color: "var(--muted)" }}>Color identity</dt>
            <dd style={{ margin: 0, color: "var(--muted)", fontSize: 11 }}>
              {card.colorIdentity.length ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {card.colorIdentity.map((symbol) => (
                    <ManaSymbol key={symbol} symbol={symbol} size={15} />
                  ))}
                </span>
              ) : (
                "Colorless"
              )}
            </dd>
            <dt style={{ color: "var(--muted)" }}>In stock</dt>
            <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{totalQuantity(variants)}</dd>
            {binderLabels.length > 0 && (
              <>
                <dt style={{ color: "var(--muted)" }}>W folders</dt>
                <dd
                  style={{
                    margin: 0,
                    color: "var(--accent)",
                    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                    fontSize: 11,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {binderLabels.join(" · ")}
                </dd>
              </>
            )}
          </dl>

          {card.oracleText && (
            <p
              className="wiko-card-modal-oracle"
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
            className="wiko-card-modal-actions"
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
            {hasMultipleVariants ? (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 30,
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    From {formatLowestPrice(variants)}
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
                    {selectionController?.copy?.chooseOptionsLabel ?? "choose finish"}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {variants.map((variant) => {
                    const optionLabel = variantOptionLabel(variant, variants);
                    const conditionTitle = getConditionTitle(variant.condition);
                    const conditionDetail = variant.condition !== "near_mint" ? ` · ${formatConditionFull(variant.condition)}` : "";
                    const variantQty = selectionItems.get(variant.id) ?? 0;
                    const variantInCart = variantQty > 0;

                    return (
                      <div
                        key={variant.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "12px 14px",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          background: "var(--surface-2)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            title={conditionTitle}
                            style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}
                          >
                            {optionLabel}
                          </div>
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 11,
                              color: "var(--muted)",
                              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                              letterSpacing: "0.04em",
                              textTransform: "uppercase",
                            }}
                          >
                            {formatPrice(variant.price)} · {variant.quantity} {availableLabel}{conditionDetail}
                          </div>
                        </div>

                        {!variantInCart ? (
                          <button
                            type="button"
                            aria-label={`Add ${optionLabel} to ${selectedBadgeLabel}`}
                            onClick={() => addItem(variant.id, variant.quantity)}
                            style={{ ...btnPrimary, padding: "10px 14px", fontSize: 12 }}
                          >
                            {addLabel}
                          </button>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              type="button"
                              aria-label={`Decrease ${optionLabel} quantity`}
                              onClick={() =>
                                variantQty <= 1
                                  ? removeItem(variant.id)
                                  : setQuantity(variant.id, variantQty - 1, variant.quantity)
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
                              {variantQty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Increase ${optionLabel} quantity`}
                              onClick={() => setQuantity(variant.id, variantQty + 1, variant.quantity)}
                              disabled={variantQty >= variant.quantity}
                              style={{ ...btnStep, opacity: variantQty >= variant.quantity ? 0.3 : 1 }}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {anyVariantInCart && (
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" onClick={onClose} style={btnSecondary}>
                      Close
                    </button>
                    <Link href={reviewHref} style={{ ...btnPrimary, padding: "10px 14px", fontSize: 12 }}>
                      {reviewLabel}
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <>
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
                    {addLabel}
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={onClose} style={btnSecondary}>
                        Close
                      </button>
                      <Link href={reviewHref} style={{ ...btnPrimary, padding: "10px 14px", fontSize: 12 }}>
                        {reviewLabel}
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
