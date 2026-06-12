"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import StorefrontShell from "@/components/storefront-shell";
import { formatBinderForDisplay } from "@/lib/binder-name";
import type { CardSelectionController } from "@/lib/card-selection";
import { useWBinderShareInterestStore } from "@/lib/store/w-binder-share-interest-store";
import type { AdminCard, CardData, Finish } from "@/lib/types";

interface SharedWBindersShellProps {
  cards: AdminCard[];
  meta: CardData["meta"];
  linkLabel: string;
  expiresAt: string | null;
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

function formatExpiresAt(expiresAt: string | null): string {
  if (!expiresAt) return "No expiration";
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return "Expiration unknown";
  return `Expires ${new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function formatBinderList(card: AdminCard): string {
  return card.binders.map(formatBinderForDisplay).join(" · ");
}

function SharedHeader({ linkLabel }: { linkLabel: string }) {
  return (
    <header
      className="wiko-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 32px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <div aria-hidden className="wiko-starfield" />
      <Link
        href="/"
        aria-label="Wiko's Spellbook home"
        className="wiko-header-brand"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "relative",
          textDecoration: "none",
          color: "inherit",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          Wiko&apos;s Spellbook
        </span>
        <span
          className="hidden sm:inline"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "4px 9px",
            color: "var(--muted)",
            fontSize: 11,
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={linkLabel}
        >
          Shared W binder preview
        </span>
      </Link>
      <Link
        href="/"
        style={{
          position: "relative",
          color: "var(--muted)",
          fontSize: 13,
          textDecoration: "none",
        }}
      >
        Main store
      </Link>
    </header>
  );
}

export function SharedWBindersShell({
  cards,
  meta,
  linkLabel,
  expiresAt,
}: SharedWBindersShellProps) {
  const items = useWBinderShareInterestStore((s) => s.items);
  const addItem = useWBinderShareInterestStore((s) => s.addItem);
  const setQuantity = useWBinderShareInterestStore((s) => s.setQuantity);
  const removeItem = useWBinderShareInterestStore((s) => s.removeItem);
  const clearInterestList = useWBinderShareInterestStore((s) => s.clearInterestList);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

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

  const interestText = useMemo(() => {
    const lines = [
      `Wiko's Spellbook — ${linkLabel}`,
      `Interested cards: ${selectedCount}`,
      `Approx value: ${formatPrice(selectedValue)}`,
      "",
      ...selectedRows.map(({ card, cardId, quantity }) => {
        if (!card) return `${quantity}x ${cardId}`;
        return `${quantity}x ${card.name} — ${card.setCode.toUpperCase()} #${card.collectorNumber} — ${formatFinish(card.finish)} — ${formatCondition(card.condition)} — ${formatPrice(card.price)} — ${formatBinderList(card)}`;
      }),
    ];
    return lines.join("\n");
  }, [linkLabel, selectedCount, selectedRows, selectedValue]);

  const selectionController: CardSelectionController = {
    items,
    addItem,
    setQuantity,
    removeItem,
    copy: {
      addLabel: "Mark interested",
      quickAddLabel: "Quick interest",
      selectedBadgeLabel: "interest list",
      reviewHref: "#w-interest-list",
      reviewLabel: "Review interest list",
      chooseOptionsLabel: "choose version",
      quantityAvailableLabel: "in W binders",
    },
  };

  const copyInterestList = async () => {
    setCopyMessage(null);
    try {
      await navigator.clipboard.writeText(interestText);
      setCopyMessage("Interest list copied. Send it to Wiko when ready.");
    } catch {
      setCopyMessage("Copy failed — select the list text manually.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SharedHeader linkLabel={linkLabel} />
      <main style={{ flex: 1 }}>
        <section
          style={{
            padding: "28px 32px 18px",
            borderBottom: "1px solid var(--border)",
            background:
              "linear-gradient(180deg, color-mix(in oklch, var(--surface) 72%, transparent), transparent)",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              color: "var(--muted)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
            }}
          >
            Private preview · {formatExpiresAt(expiresAt)}
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "clamp(32px, 4.5vw, 52px)",
              fontWeight: 400,
              lineHeight: 0.95,
              fontStyle: "italic",
            }}
          >
            W binder preview
          </h1>
          <p style={{ margin: "12px 0 0", maxWidth: 720, color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
            Browse this private Wiko share, mark cards you&apos;re interested in, then copy the list back to Wiko. This link is browse-only: no checkout, no admin access, and no inventory changes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" style={{ color: "var(--muted)", fontSize: 12 }}>
            <span>{cards.length.toLocaleString()} card rows</span>
            <span>·</span>
            <span>{totalWQuantity.toLocaleString()} copies</span>
            <span>·</span>
            <span>{binderCount.toLocaleString()} W folders</span>
          </div>
        </section>

        <section
          id="w-interest-list"
          style={{
            margin: "18px 32px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 8,
            padding: 18,
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>
                Interest list
              </h2>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
                {selectedCount === 0
                  ? "Use Mark interested on cards below to stage a list."
                  : `${selectedCount} card${selectedCount === 1 ? "" : "s"} staged · approx ${formatPrice(selectedValue)}`}
              </p>
            </div>
            {selectedCount > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyInterestList}
                  style={{
                    border: "none",
                    background: "var(--accent)",
                    color: "var(--accent-fg)",
                    borderRadius: 4,
                    padding: "9px 12px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Copy list
                </button>
                <button
                  type="button"
                  onClick={clearInterestList}
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
                  Clear
                </button>
              </div>
            )}
          </div>
          {copyMessage && <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 12 }}>{copyMessage}</p>}

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
            margin: "0 32px 48px",
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
              No cards are available on this private share link.
            </div>
          )}
        </section>
      </main>
      <footer style={{ borderTop: "1px solid var(--border)", padding: "18px 32px", color: "var(--muted)", fontSize: 12 }}>
        Private W binder preview · shared by Wiko
      </footer>
    </div>
  );
}
