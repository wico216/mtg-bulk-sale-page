"use client";

import type { InventoryRow as InventoryRowType } from "@/lib/types";
import { formatBinderForDisplay } from "@/lib/binder-name";
import { ManaCost } from "@/components/mana-cost";
import { EditableCell } from "./editable-cell";
import { binderColor } from "./binder-color";
import type { RowDensity } from "./density-toggle";

type StockState = "normal" | "low" | "zero";

interface InventoryRowProps {
  card: InventoryRowType;
  selected: boolean;
  density: RowDensity;
  onSelect: (cardId: string, checked: boolean) => void;
  onRequestDelete: (cardId: string) => void;
  onInspect: (card: InventoryRowType) => void;
  onSave: (
    cardId: string,
    field: string,
    value: string | number,
  ) => Promise<boolean>;
  onError: (message: string) => void;
}

interface DensityConfig {
  showArt: boolean;
  artW: number;
  artH: number;
  paddingY: string;
  titleFamily: string;
  titleSize: string;
  gridTemplate: string;
}

/**
 * Per-density layout knobs. The grid template is 8 columns wide (or 7
 * when art collapses in `compact` mode) and matches the mockup's
 * `.row--compact / --standard / --comfortable` selectors verbatim:
 *
 *   check · art · name · cost · price · qty · binder · delete
 *
 * Column widths are tuned to keep tabular price/qty/binder text
 * right-aligned and stable across rows; the name column owns the
 * `1fr` slack so card titles get the breathing room.
 */
function densityConfig(density: RowDensity): DensityConfig {
  switch (density) {
    case "compact":
      return {
        showArt: false,
        artW: 0,
        artH: 0,
        paddingY: "6px",
        titleFamily: "var(--font-inter), system-ui, sans-serif",
        titleSize: "14px",
        gridTemplate: "20px minmax(0,1fr) auto 90px 96px 64px 28px",
      };
    case "comfortable":
      return {
        showArt: true,
        artW: 64,
        artH: 88,
        paddingY: "14px",
        titleFamily: "var(--font-instrument-serif), ui-serif, Georgia, serif",
        titleSize: "18px",
        gridTemplate: "20px 64px minmax(0,1fr) auto 110px 110px 80px 28px",
      };
    case "standard":
    default:
      return {
        showArt: true,
        artW: 44,
        artH: 60,
        paddingY: "10px",
        titleFamily: "var(--font-instrument-serif), ui-serif, Georgia, serif",
        titleSize: "16px",
        gridTemplate: "20px 44px minmax(0,1fr) auto 90px 96px 64px 28px",
      };
  }
}

function rarityLetter(rarity: string): string {
  const first = rarity.trim().charAt(0).toUpperCase();
  // Maps "mythic" → "M", "common" → "C", etc. Fallback "?" never appears
  // for real Scryfall-sourced rows but guards against blank legacy data.
  return first || "?";
}

function rarityChipStyle(rarity: string): React.CSSProperties {
  switch (rarity.trim().toLowerCase()) {
    case "common":
      return { background: "#c7c7c7", color: "#2a2a2a" };
    case "uncommon":
      return { background: "#c0d8e6", color: "#1a3a4a" };
    case "rare":
      return { background: "#d9c279", color: "#4a3a1a" };
    case "mythic":
      return { background: "#e58838", color: "#fff" };
    default:
      return { background: "var(--border)", color: "var(--muted)" };
  }
}

export function InventoryRowCard({
  card,
  selected,
  density,
  onSelect,
  onRequestDelete,
  onInspect,
  onSave,
  onError,
}: InventoryRowProps) {
  const stock: StockState =
    card.quantity === 0 ? "zero" : card.quantity === 1 ? "low" : "normal";
  const config = densityConfig(density);
  const finish = String(card.finish);
  const edgeColor = binderColor(card.binder);

  return (
    <li
      data-selected={selected ? "true" : "false"}
      className="wiko-inventory-row group relative grid items-center transition-colors"
      style={{
        gridTemplateColumns: config.gridTemplate,
        gap: 14,
        padding: `${config.paddingY} 22px ${config.paddingY} 18px`,
        borderBottom:
          "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
        background: selected
          ? "color-mix(in oklab, var(--accent) 8%, transparent)"
          : "transparent",
        // Custom property consumed by the ::before gutter rule below; we
        // inline the gutter as an absolute span instead of a pseudo-element
        // so React doesn't have to ship a stylesheet for it.
        ["--binder-color" as string]: edgeColor,
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--ink) 3%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {/* Left gutter — the binder colour stripe. 3px at rest, widens on
          hover via the group-hover modifier on the parent. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 transition-[width] duration-150 group-hover:w-[5px]"
        style={{ width: 3, background: edgeColor }}
      />

      {/* Selection checkbox */}
      <span className="wiko-inventory-row-select flex items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Select ${card.name}`}
          checked={selected}
          onChange={(e) => onSelect(card.id, e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
        />
      </span>

      {/* Card art — opens the inspection lightbox so the operator can verify
          condition/printing without leaving the page. Hidden at compact density. */}
      {config.showArt && (
        <button
          type="button"
          onClick={() => onInspect(card)}
          aria-label={`Inspect ${card.name}`}
          className="wiko-inventory-row-art group/thumb relative overflow-hidden cursor-zoom-in"
          style={{
            width: config.artW,
            height: config.artH,
            borderRadius: 3,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt=""
              aria-hidden="true"
              className="block h-full w-full object-cover transition-transform duration-200 group-hover/thumb:scale-[1.06]"
              loading="lazy"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center text-[10px]"
              style={{ color: "var(--muted)" }}
            >
              no img
            </span>
          )}
        </button>
      )}

      {/* Name + meta block */}
      <div className="wiko-inventory-row-details min-w-0 flex flex-col gap-[3px]">
        <span
          className="wiko-inventory-row-title truncate"
          style={{
            fontFamily: config.titleFamily,
            fontSize: config.titleSize,
            color: "var(--ink)",
            lineHeight: 1.05,
            fontWeight: density === "compact" ? 500 : 400,
          }}
          title={card.name}
        >
          {card.name}
          {finish === "foil" && (
            <span
              aria-label="Foil"
              title="Foil"
              className="ml-1.5 inline-block align-middle text-[13px] leading-none"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.86 0.16 90), oklch(0.7 0.18 320), oklch(0.78 0.15 200))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter:
                  "drop-shadow(0 0 4px color-mix(in oklab, var(--accent) 30%, transparent))",
              }}
            >
              ✦
            </span>
          )}
          {finish === "etched" && (
            <span
              aria-label="Etched"
              title="Etched-foil"
              className="ml-1.5 inline-block align-middle text-[13px] leading-none"
              style={{
                background:
                  "repeating-linear-gradient(90deg, var(--accent) 0 2px, var(--ink-soft) 2px 4px)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              ◇
            </span>
          )}
        </span>
        <span
          className="wiko-inventory-row-meta flex items-center gap-2 whitespace-nowrap"
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: "0.06em",
            color: "var(--muted)",
          }}
        >
          <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}>
            {card.setCode.toUpperCase()}
          </span>
          <span aria-hidden="true" style={{ color: "var(--dim)" }}>
            ·
          </span>
          <span className="tabular-nums">
            <span aria-hidden="true" style={{ color: "var(--dim)" }}>
              #
            </span>
            {card.collectorNumber}
          </span>
          <span aria-hidden="true" style={{ color: "var(--dim)" }}>
            ·
          </span>
          <span
            style={{
              padding: "2px 5px",
              border: "1px solid var(--border)",
              borderRadius: 2,
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "var(--muted)",
            }}
          >
            <EditableCell
              value={card.condition}
              cardId={card.id}
              field="condition"
              cardName={card.name}
              onSave={onSave}
              onError={onError}
            />
          </span>
        </span>
      </div>

      {/* Mana cost pips + rarity letter chip. ManaCost handles null/empty
          gracefully so lands and unresolved Scryfall rows just collapse the
          pips half; the rarity chip always renders. */}
      <span className="wiko-inventory-row-mana inline-flex items-center gap-1.5 leading-none">
        <ManaCost cost={card.manaCost} className="text-[14px]" />
        <span
          aria-label={`Rarity ${card.rarity}`}
          title={card.rarity}
          className="inline-flex items-center justify-center shrink-0 uppercase"
          style={{
            width: 14,
            height: 14,
            borderRadius: 2,
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 9,
            fontWeight: 700,
            ...rarityChipStyle(card.rarity),
          }}
        >
          {rarityLetter(card.rarity)}
        </span>
      </span>

      {/* Price — editable, right-aligned, mono-tabular. EditableCell renders
          a `$X.YY` static string at rest and swaps to a number input on
          click; the wrapper just owns the typography. */}
      <span
        className="wiko-inventory-row-price text-right shrink-0"
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 500,
          color: card.price ? "var(--ink)" : "var(--dim)",
        }}
      >
        <EditableCell
          value={card.price ?? ""}
          cardId={card.id}
          field="price"
          cardName={card.name}
          onSave={onSave}
          onError={onError}
        />
      </span>

      {/* Qty — editable + stock badge. The badge is rendered alongside the
          EditableCell rather than via ::after so the editing input doesn't
          inherit/clip it. */}
      <span
        className="wiko-inventory-row-qty flex items-center justify-end gap-1.5 shrink-0"
        data-stock={stock}
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 14,
          fontWeight: 500,
          color: stock === "zero" ? "var(--bad)" : "var(--ink)",
        }}
      >
        <EditableCell
          value={card.quantity}
          cardId={card.id}
          field="quantity"
          cardName={card.name}
          onSave={onSave}
          onError={onError}
        />
        {stock === "low" && (
          <span
            title="Only 1 copy remaining"
            className="inline-flex items-center uppercase"
            style={{
              padding: "2px 5px",
              background:
                "color-mix(in oklab, var(--accent) 22%, transparent)",
              color: "var(--accent)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              borderRadius: 2,
            }}
          >
            Low
          </span>
        )}
        {stock === "zero" && (
          <span
            title="Out of stock"
            className="inline-flex items-center"
            style={{
              padding: "2px 5px",
              background: "color-mix(in oklab, var(--bad) 18%, transparent)",
              color: "var(--bad)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              borderRadius: 2,
            }}
          >
            0
          </span>
        )}
      </span>

      {/* Binder chip — display-formatted (A02 not a02) so the operator's
          physical labels match. */}
      <span
        className="wiko-inventory-row-binder inline-flex items-center justify-center text-center"
        style={{
          padding: "4px 8px",
          border: "1px solid var(--border)",
          borderRadius: 3,
          background: "var(--surface-2)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "var(--muted)",
        }}
      >
        {formatBinderForDisplay(card.binder)}
      </span>

      {/* Per-row delete (hover-revealed; bulk delete lives in the dock) */}
      <span className="wiko-inventory-row-delete flex items-center justify-end">
        <button
          type="button"
          onClick={() => onRequestDelete(card.id)}
          aria-label={`Delete ${card.name}`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--bad)";
            e.currentTarget.style.background =
              "color-mix(in oklab, var(--bad) 12%, transparent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--muted)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
            />
          </svg>
        </button>
      </span>
    </li>
  );
}
