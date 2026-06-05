import type { PriceMoverReportRow, PriceMoversReport } from "@/db/price-movers";
import { conditionToAbbr } from "@/lib/condition-map";
import { binderColor } from "../../_components/binder-color";

interface PriceMoversReportViewProps {
  report: PriceMoversReport;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  return `+${value.toFixed(1)}%`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "No tracked refresh yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatBoxForDisplay(box: string): string {
  if (!box || box === "unsorted") return "Unsorted";
  const codeMatch = box.match(/^([a-z]+)(\d.*)$/i);
  if (codeMatch) return `${codeMatch[1].toUpperCase()}${codeMatch[2]}`;
  return titleCase(box.replace(/[-_]+/g, " "));
}

function formatFinish(value: string): string {
  return value === "normal" ? "nonfoil" : value;
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

export function PriceMoversReportView({ report }: PriceMoversReportViewProps) {
  const hasRows = report.rows.length > 0;

  return (
    <div className="wiko-price-movers-page space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl p-6 shadow-sm"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--ink) 96%, var(--accent)), var(--ink))",
          color: "var(--bg)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-28 w-28 rounded-full blur-3xl"
          style={{ background: "color-mix(in oklab, var(--good) 35%, transparent)" }}
        />
        <div className="relative max-w-4xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--accent-light)" }}>
            Operator intelligence
          </p>
          <div className="space-y-2">
            <h1
              className="m-0 text-3xl"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              Price movers
            </h1>
            <p className="max-w-3xl text-sm leading-6 opacity-85">
              Cards that jumped in value during tracked Scryfall price refreshes.
              Use this as the “keep an eye out” list before pulling bulk, repricing
              high-upside cards, or deciding what deserves binder attention.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Price Movers summary">
        <SummaryCard label="Cards moving up" value={report.totalRows.toLocaleString()} />
        <SummaryCard label="Copies to watch" value={report.totalQuantity.toLocaleString()} />
        <SummaryCard label="Inventory upside" value={formatCurrency(report.totalInventoryGain)} />
        <SummaryCard label="Highest jump" value={formatPercent(report.highestPercentGain)} />
      </section>

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="m-0 text-lg font-semibold" style={{ color: "var(--ink)" }}>
              Latest upward moves
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Generated {formatDateTime(report.generatedAt)}. Last tracked move: {formatDateTime(report.lastSnapshotAt)}.
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: "var(--good)" }}>
            Biggest single-card gain: {formatCurrency(report.biggestDollarGain)}
          </p>
        </div>
      </section>

      {hasRows ? (
        <section aria-label="Admin Price Movers report" className="grid gap-4 lg:grid-cols-2">
          {report.rows.map((row) => (
            <PriceMoverCard key={row.cardId} row={row} />
          ))}
        </section>
      ) : (
        <section
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          <h2 className="mb-2 text-lg font-semibold" style={{ color: "var(--ink)" }}>
            No upward price moves tracked yet
          </h2>
          <p className="text-sm">
            Run a price refresh after this feature is deployed. The first changed
            refresh creates the baseline snapshots; future upward moves will appear here.
          </p>
        </section>
      )}
    </div>
  );
}

function PriceMoverCard({ row }: { row: PriceMoverReportRow }) {
  const printing = `${row.setCode.toUpperCase()} #${row.collectorNumber}`;
  const boxLabel = formatBoxForDisplay(row.binder);
  const cardMeta = [printing, formatFinish(row.finish), conditionToAbbr(row.condition)]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="wiko-price-mover-card grid gap-4 rounded-xl border p-4 shadow-sm sm:grid-cols-[116px_minmax(0,1fr)]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        borderTop: `5px solid ${binderColor(row.binder)}`,
      }}
      aria-label={`${row.name} price mover`}
    >
      <div
        className="overflow-hidden rounded-lg"
        style={{
          width: 116,
          minHeight: 162,
          background: "color-mix(in oklab, var(--ink) 10%, transparent)",
        }}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt={`${row.name} card art`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full min-h-[162px] items-center justify-center p-3 text-center text-xs" style={{ color: "var(--muted)" }}>
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span
              className="rounded-full px-2 py-0.5 font-semibold"
              style={{ background: "color-mix(in oklab, var(--good) 13%, transparent)", color: "var(--good)" }}
            >
              +{formatCurrency(row.dollarGain).replace("$", "$")}
            </span>
            <span>{formatPercent(row.percentGain)}</span>
            <span>{formatDateTime(row.lastMovedAt)}</span>
          </div>
          <h3 className="m-0 text-xl font-semibold leading-tight" style={{ color: "var(--ink)" }}>
            {row.name}
          </h3>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {cardMeta}
          </p>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Metric label="Price move" value={`${formatCurrency(row.previousPrice)} → ${formatCurrency(row.currentPrice)}`} />
          <Metric label="Source box" value={`Box ${boxLabel}`} />
          <Metric label="Quantity" value={formatCount(row.quantity, "copy", "copies")} />
          <Metric label="Inventory upside" value={`+${formatCurrency(row.inventoryGain)} inventory upside`} tone="good" />
        </div>
      </div>
    </article>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border p-4 shadow-sm"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good";
}) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>
        {label}
      </dt>
      <dd className="mt-1 font-semibold" style={{ color: tone === "good" ? "var(--good)" : "var(--ink)" }}>
        {value}
      </dd>
    </div>
  );
}
