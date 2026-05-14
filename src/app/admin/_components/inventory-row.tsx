"use client";

import type { InventoryRow as InventoryRowType } from "@/lib/types";
import { EditableCell } from "./editable-cell";
import type { RowDensity } from "./density-toggle";

type StockState = "normal" | "low" | "zero";

interface InventoryRowProps {
  card: InventoryRowType;
  selected: boolean;
  density: RowDensity;
  onSelect: (cardId: string, checked: boolean) => void;
  onRequestDelete: (cardId: string) => void;
  onSave: (
    cardId: string,
    field: string,
    value: string | number,
  ) => Promise<boolean>;
  onError: (message: string) => void;
}

function gutterStyle(stock: StockState, finish: string): React.CSSProperties {
  if (stock === "zero") return { background: "rgb(220 38 38)" };
  if (stock === "low") return { background: "var(--accent)" };
  if (finish === "foil") {
    return {
      background:
        "linear-gradient(to bottom, var(--accent), color-mix(in oklab, var(--accent) 50%, white 30%))",
    };
  }
  if (finish === "etched") {
    return {
      background:
        "repeating-linear-gradient(to bottom, var(--accent) 0 4px, transparent 4px 8px)",
    };
  }
  return { background: "transparent" };
}

/**
 * Map density to a per-row layout config:
 *   - showThumbnail: render image column at all
 *   - thumbnailSize: [w, h] in px
 *   - rowPadding:  vertical padding inside the row
 *   - twoLineMeta: if false, meta collapses into a single line (compact)
 */
function densityConfig(density: RowDensity) {
  switch (density) {
    case "compact":
      return {
        showThumbnail: false,
        thumbnailWidth: 0,
        thumbnailHeight: 0,
        verticalPaddingClass: "py-2",
        twoLineMeta: false,
      } as const;
    case "comfortable":
      return {
        showThumbnail: true,
        thumbnailWidth: 58,
        thumbnailHeight: 80,
        verticalPaddingClass: "py-4",
        twoLineMeta: true,
      } as const;
    case "standard":
    default:
      return {
        showThumbnail: true,
        thumbnailWidth: 36,
        thumbnailHeight: 50,
        verticalPaddingClass: "py-2.5",
        twoLineMeta: true,
      } as const;
  }
}

export function InventoryRowCard({
  card,
  selected,
  density,
  onSelect,
  onRequestDelete,
  onSave,
  onError,
}: InventoryRowProps) {
  const stock: StockState =
    card.quantity === 0 ? "zero" : card.quantity === 1 ? "low" : "normal";
  const config = densityConfig(density);
  const finish = String(card.finish);

  return (
    <li
      className={`group relative grid items-center gap-3 sm:gap-4 px-3 sm:px-4 ${config.verticalPaddingClass} transition-colors`}
      style={{
        gridTemplateColumns: `12px 18px ${
          config.showThumbnail ? `${config.thumbnailWidth}px ` : ""
        }minmax(0,1fr) auto auto 32px`,
        borderBottom: "1px solid var(--border)",
        background:
          stock === "zero"
            ? "color-mix(in oklab, rgb(220 38 38) 5%, transparent)"
            : "transparent",
      }}
      onMouseEnter={(e) => {
        if (stock !== "zero") {
          e.currentTarget.style.background =
            "color-mix(in oklab, var(--ink) 4%, transparent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          stock === "zero"
            ? "color-mix(in oklab, rgb(220 38 38) 5%, transparent)"
            : "transparent";
      }}
    >
      {/* Status filmstrip gutter — the load-bearing visual triage signal */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={gutterStyle(stock, finish)}
      />

      {/* Selection checkbox */}
      <span className="flex items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Select ${card.name}`}
          checked={selected}
          onChange={(e) => onSelect(card.id, e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
        />
      </span>

      {/* Thumbnail (only at standard / comfortable density) */}
      {config.showThumbnail &&
        (card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt=""
            aria-hidden="true"
            className="rounded object-cover"
            style={{
              width: config.thumbnailWidth,
              height: config.thumbnailHeight,
              border: "1px solid var(--border)",
            }}
            loading="lazy"
          />
        ) : (
          <div
            className="rounded"
            style={{
              width: config.thumbnailWidth,
              height: config.thumbnailHeight,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          />
        ))}

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="truncate text-sm font-medium"
            style={{ color: "var(--ink)" }}
            title={card.name}
          >
            {card.name}
          </span>
          {finish === "foil" && (
            <span
              aria-label="Foil"
              title="Foil"
              className="text-xs leading-none"
              style={{ color: "var(--accent)" }}
            >
              ✦
            </span>
          )}
          {finish === "etched" && (
            <span
              aria-label="Etched"
              title="Etched-foil"
              className="text-xs leading-none"
              style={{ color: "var(--accent)" }}
            >
              ◇
            </span>
          )}
        </div>
        {config.twoLineMeta && (
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11px] flex-wrap"
            style={{ color: "var(--muted)" }}
          >
            <span className="font-mono tabular-nums">
              {card.setCode.toUpperCase()}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">#{card.collectorNumber}</span>
            <span aria-hidden="true">·</span>
            <EditableCell
              value={card.condition}
              cardId={card.id}
              field="condition"
              cardName={card.name}
              onSave={onSave}
              onError={onError}
            />
            <span aria-hidden="true">·</span>
            <BinderChip binder={card.binder} />
          </div>
        )}
      </div>

      {/* Price (editable, right-aligned, tabular) */}
      <div className="text-right tabular-nums shrink-0">
        <EditableCell
          value={card.price ?? ""}
          cardId={card.id}
          field="price"
          cardName={card.name}
          onSave={onSave}
          onError={onError}
        />
      </div>

      {/* Quantity (editable) + stock badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-[11px] tabular-nums"
          style={{ color: "var(--muted)" }}
          aria-hidden="true"
        >
          ×
        </span>
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
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded"
            style={{
              background:
                "color-mix(in oklab, var(--accent) 22%, transparent)",
              color: "var(--accent)",
            }}
            title="Only 1 copy remaining"
          >
            Low
          </span>
        )}
        {stock === "zero" && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded"
            style={{
              background: "rgb(220 38 38 / 0.22)",
              color: "rgb(248 113 113)",
            }}
            title="Out of stock"
          >
            0
          </span>
        )}
      </div>

      {/* Per-row delete (kept inline for ergonomics; bulk delete is in dock) */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => onRequestDelete(card.id)}
          aria-label={`Delete ${card.name}`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded-md"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "rgb(248 113 113)";
            e.currentTarget.style.background = "rgb(220 38 38 / 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--muted)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}

function BinderChip({ binder }: { binder: string }) {
  return (
    <span
      data-binder-pill
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--muted)",
        border: "1px solid var(--border)",
      }}
    >
      {binder}
    </span>
  );
}
