"use client";

import { useMemo } from "react";
import StorefrontShell from "@/components/storefront-shell";
import { formatBinderForDisplay } from "@/lib/binder-name";
import type { CardSelectionController } from "@/lib/card-selection";
import { useWBinderPickStore } from "@/lib/store/w-binder-pick-store";
import type { AdminCard, CardData, Finish } from "@/lib/types";
import type { WBinderShareLink } from "@/lib/w-binder-share-types";
import { WBinderShareManager } from "./w-binder-share-manager";

interface AdminWBindersShellProps {
  cards: AdminCard[];
  meta: CardData["meta"];
  shareLinks: WBinderShareLink[];
}

const CONDITION_MAP: Record<string, string> = {
  near_mint: "NM",
  lightly_played: "LP",
  moderately_played: "MP",
  heavily_played: "HP",
  damaged: "DMG",
};

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return `$${price.toFixed(2)}`;
}

function formatCondition(condition: string): string {
  return CONDITION_MAP[condition] ?? condition;
}

function formatFinish(finish: Finish): string {
  if (finish === "foil") return "Foil";
  if (finish === "etched") return "Etched";
  return "Nonfoil";
}

function formatBinderList(card: AdminCard): string {
  return card.binders.map(formatBinderForDisplay).join(" · ");
}

export function AdminWBindersShell({ cards, meta, shareLinks }: AdminWBindersShellProps) {
  const items = useWBinderPickStore((s) => s.items);
  const addItem = useWBinderPickStore((s) => s.addItem);
  const setQuantity = useWBinderPickStore((s) => s.setQuantity);
  const removeItem = useWBinderPickStore((s) => s.removeItem);
  const clearPickList = useWBinderPickStore((s) => s.clearPickList);

  const cardsById = useMemo(() => {
    const map = new Map<string, AdminCard>();
    for (const card of cards) map.set(card.id, card);
    return map;
  }, [cards]);

  const selectedRows = useMemo(
    () =>
      [...items.entries()]
        .map(([cardId, quantity]) => ({ card: cardsById.get(cardId), cardId, quantity }))
        .filter((row) => row.quantity > 0)
        .sort((a, b) => (a.card?.name ?? a.cardId).localeCompare(b.card?.name ?? b.cardId)),
    [cardsById, items],
  );

  const selectedCount = selectedRows.reduce((sum, row) => sum + row.quantity, 0);
  const selectedValue = selectedRows.reduce((sum, row) => {
    if (!row.card?.price) return sum;
    return sum + row.card.price * row.quantity;
  }, 0);
  const totalWQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const binderCount = new Set(cards.flatMap((card) => card.binders)).size;

  const selectionController: CardSelectionController = {
    items,
    addItem,
    setQuantity,
    removeItem,
    copy: {
      addLabel: "Pick",
      quickAddLabel: "Quick pick",
      selectedBadgeLabel: "pick list",
      reviewHref: "#w-pick-list",
      reviewLabel: "Review picks",
      chooseOptionsLabel: "choose version",
      quantityAvailableLabel: "in W binders",
    },
  };

  return (
    <div className="space-y-6">
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: 8,
          padding: 20,
        }}
      >
        <p
          className="m-0 mb-2"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Private collection · W binders
        </p>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1
              className="m-0"
              style={{
                fontFamily: "var(--font-instrument-serif), ui-serif, Georgia, serif",
                fontSize: 44,
                fontWeight: 400,
                lineHeight: 0.95,
                letterSpacing: "-0.01em",
                color: "var(--ink)",
              }}
            >
              My W binders
              <em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
            </h1>
            <p style={{ margin: "12px 0 0", maxWidth: 760, color: "var(--muted)", fontSize: 14 }}>
              Admin-only lookup for personal folders. These cards are excluded from the public store and public checkout; picking here only builds a private pull list.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[360px]">
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 20, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{cards.length}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>cards</div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 20, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{totalWQuantity}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>copies</div>
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 20, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{binderCount}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>folders</div>
            </div>
          </div>
        </div>
      </section>

      <WBinderShareManager cards={cards} initialLinks={shareLinks} />

      <section
        id="w-pick-list"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 8,
          padding: 18,
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>
              Personal pick list
            </h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
              {selectedCount === 0
                ? "Use Pick on cards below to stage what you want to pull."
                : `${selectedCount} card${selectedCount === 1 ? "" : "s"} staged · approx ${formatPrice(selectedValue)}`}
            </p>
          </div>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={clearPickList}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--ink)",
                borderRadius: 4,
                padding: "9px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              Clear picks
            </button>
          )}
        </div>

        {selectedRows.length > 0 && (
          <div className="mt-4 grid gap-2">
            {selectedRows.map(({ card, cardId, quantity }) => {
              const maxStock = card?.quantity;
              return (
                <div
                  key={cardId}
                  className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center"
                  style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
                      {card?.name ?? cardId}
                    </div>
                    {card && (
                      <div
                        style={{
                          marginTop: 4,
                          color: "var(--muted)",
                          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                          fontSize: 11,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {formatBinderList(card)} · {card.setCode.toUpperCase()} #{card.collectorNumber} · {formatFinish(card.finish)} · {formatCondition(card.condition)} · {formatPrice(card.price)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        quantity <= 1
                          ? removeItem(cardId)
                          : setQuantity(cardId, quantity - 1, maxStock)
                      }
                      style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", cursor: "pointer" }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 26, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(cardId, quantity + 1, maxStock)}
                      disabled={maxStock != null && quantity >= maxStock}
                      style={{ width: 30, height: 30, borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", cursor: "pointer", opacity: maxStock != null && quantity >= maxStock ? 0.35 : 1 }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(cardId)}
                      style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        {cards.length > 0 ? (
          <StorefrontShell
            cards={cards}
            meta={meta}
            initialSort="name-asc"
            selectionController={selectionController}
          />
        ) : (
          <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--muted)" }}>
            No W binder cards found yet. Import folders named W01/W02/etc. and they’ll appear here instead of the public store.
          </div>
        )}
      </section>
    </div>
  );
}
