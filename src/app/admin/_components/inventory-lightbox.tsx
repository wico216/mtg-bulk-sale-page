"use client";

import { useEffect, useRef } from "react";
import type { InventoryRow } from "@/lib/types";
import { conditionToAbbr } from "@/lib/condition-map";
import { formatBinderForDisplay } from "@/lib/binder-name";

interface InventoryLightboxProps {
  card: InventoryRow | null;
  onClose: () => void;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Scryfall image URLs follow a predictable pattern:
 *   https://cards.scryfall.io/{size}/front/x/y/abc.jpg
 * where {size} is one of small / normal / large / png / art_crop / etc.
 *
 * Our parser stores `normal` (488×680). For inspection we want the
 * `large` version (672×936) which is the next size up and still loads
 * fast. If the URL pattern doesn't match (older import, custom CDN,
 * future Scryfall change), fall back to the stored URL.
 */
function upgradeScryfallImage(url: string | null): string | null {
  if (!url) return null;
  if (!url.includes("cards.scryfall.io/")) return url;
  return url.replace(
    /cards\.scryfall\.io\/(small|normal)\//,
    "cards.scryfall.io/large/",
  );
}

export function InventoryLightbox({ card, onClose }: InventoryLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Esc to close, focus trap on the close button.
  useEffect(() => {
    if (!card) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);

    // Body scroll lock so the page underneath doesn't scroll while
    // the lightbox is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog for keyboard users.
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [card, onClose]);

  if (!card) return null;

  const largeImage = upgradeScryfallImage(card.imageUrl);
  const finish = String(card.finish);
  const stock =
    card.quantity === 0
      ? { label: "Out of stock", tone: "danger" as const }
      : card.quantity === 1
      ? { label: "Low — 1 left", tone: "warn" as const }
      : { label: `${card.quantity} in stock`, tone: "normal" as const };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${card.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{
        background: "color-mix(in oklab, var(--bg) 92%, transparent)",
        backdropFilter: "blur(8px)",
        animation: "admin-slide-up 180ms cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
      onClick={(e) => {
        // Click on the backdrop (not the content) closes the lightbox.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative grid w-full max-w-4xl gap-6 sm:gap-8 md:grid-cols-[auto_1fr] items-center"
      >
        {/* Card image */}
        <div className="flex items-center justify-center md:justify-end">
          {largeImage ? (
            <img
              src={largeImage}
              alt={card.name}
              className="rounded-2xl shadow-2xl"
              style={{
                maxWidth: "min(90vw, 480px)",
                maxHeight: "min(85vh, 670px)",
                width: "auto",
                height: "auto",
                aspectRatio: "488 / 680",
                border: "1px solid var(--border-strong)",
                boxShadow:
                  "0 30px 60px -20px color-mix(in oklab, var(--bg) 60%, transparent), 0 0 0 1px color-mix(in oklab, var(--accent) 14%, transparent)",
              }}
            />
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center"
              style={{
                width: "min(90vw, 360px)",
                aspectRatio: "488 / 680",
                background: "var(--surface)",
                border: "1px dashed var(--border-strong)",
                color: "var(--muted)",
              }}
            >
              No image
            </div>
          )}
        </div>

        {/* Meta column */}
        <div
          className="rounded-2xl p-5 sm:p-6 max-w-md"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="text-xl sm:text-2xl font-semibold leading-tight"
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {card.name}
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                <span className="font-mono">
                  {card.setCode.toUpperCase()}
                </span>{" "}
                · #{card.collectorNumber} · {card.setName}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close lightbox"
              className="shrink-0 h-9 w-9 rounded-full inline-flex items-center justify-center transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              ✕
            </button>
          </div>

          {/* Status pill */}
          <div className="mt-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{
                background:
                  stock.tone === "danger"
                    ? "rgb(220 38 38 / 0.18)"
                    : stock.tone === "warn"
                    ? "color-mix(in oklab, var(--accent) 22%, transparent)"
                    : "color-mix(in oklab, var(--ink) 8%, transparent)",
                color:
                  stock.tone === "danger"
                    ? "rgb(248 113 113)"
                    : stock.tone === "warn"
                    ? "var(--accent)"
                    : "var(--muted)",
              }}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    stock.tone === "danger"
                      ? "rgb(220 38 38)"
                      : stock.tone === "warn"
                      ? "var(--accent)"
                      : "var(--muted)",
                }}
              />
              {stock.label}
            </span>
          </div>

          {/* Property grid */}
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Price
            </dt>
            <dd
              className="tabular-nums font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {card.price !== null && card.price !== undefined
                ? currencyFormatter.format(card.price)
                : "—"}
            </dd>

            <dt
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Condition
            </dt>
            <dd style={{ color: "var(--ink)" }}>
              {conditionToAbbr(card.condition)}
            </dd>

            <dt
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Binder
            </dt>
            <dd>
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {formatBinderForDisplay(card.binder)}
              </span>
            </dd>

            <dt
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Finish
            </dt>
            <dd
              className="inline-flex items-center gap-1.5"
              style={{ color: "var(--ink)" }}
            >
              {finish === "foil" && (
                <span aria-hidden="true" style={{ color: "var(--accent)" }}>
                  ✦
                </span>
              )}
              {finish === "etched" && (
                <span aria-hidden="true" style={{ color: "var(--accent)" }}>
                  ◇
                </span>
              )}
              <span className="capitalize">{finish}</span>
            </dd>

            <dt
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              Rarity
            </dt>
            <dd className="capitalize" style={{ color: "var(--ink)" }}>
              {card.rarity}
            </dd>

            {card.colorIdentity && card.colorIdentity.length > 0 && (
              <>
                <dt
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--muted)" }}
                >
                  Colors
                </dt>
                <dd
                  className="flex items-center gap-1"
                  style={{ color: "var(--ink)" }}
                >
                  {card.colorIdentity.join(" / ")}
                </dd>
              </>
            )}
          </dl>

          {/* Oracle text */}
          {card.oracleText && (
            <div
              className="mt-5 pt-4 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                borderTop: "1px solid var(--border)",
                color: "var(--ink)",
                fontFamily: "var(--font-display)",
                fontSize: "14px",
                lineHeight: "1.55",
              }}
            >
              {card.oracleText}
            </div>
          )}

          {/* Scryfall deep-link, for the cases where the operator wants the
              canonical printing context (legality, rulings, etc.) */}
          {card.scryfallId && (
            <a
              href={`https://scryfall.com/card/${card.setCode}/${card.collectorNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
              style={{ color: "var(--muted)" }}
            >
              View on Scryfall <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
