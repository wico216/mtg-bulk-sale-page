import type { ReactNode } from "react";
import type {
  ManaBoxRemovalBoxBreakdown,
  ManaBoxRemovalReport,
  ManaBoxRemovalReportRow,
} from "@/db/manabox-removals";
import { conditionToAbbr } from "@/lib/condition-map";
import { binderColor } from "../../_components/binder-color";
import { ManaBoxReportActions } from "./manabox-report-actions";

interface ManaBoxReportViewProps {
  report: ManaBoxRemovalReport;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
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

function boxesForRow(row: ManaBoxRemovalReportRow): ManaBoxRemovalBoxBreakdown[] {
  if (row.boxBreakdown.length > 0) return row.boxBreakdown;
  return row.binders.map((box) => ({
    box,
    quantity: row.quantity,
    orderRefs: row.orderRefs,
    orderItemIds: row.orderItemIds,
  }));
}

function allOrderItemIds(rows: ManaBoxRemovalReportRow[]): number[] {
  return rows.flatMap((row) => row.orderItemIds);
}

export function ManaBoxReportView({ report }: ManaBoxReportViewProps) {
  const orderItemIds = allOrderItemIds(report.rows);
  const hasRows = report.rows.length > 0;

  return (
    <div className="wiko-manabox-page space-y-6">
      <section
        className="relative overflow-hidden rounded-2xl p-6 shadow-sm"
        style={{
          background: "linear-gradient(135deg, color-mix(in oklab, var(--ink) 96%, var(--accent)), var(--ink))",
          color: "var(--bg)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-28 w-28 rounded-full blur-3xl"
          style={{ background: "color-mix(in oklab, var(--accent) 35%, transparent)" }}
        />
        <div className="relative max-w-4xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--accent-light)" }}>
            Collection sync
          </p>
          <div className="space-y-2">
            <h1
              className="m-0 text-3xl"
              style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
            >
              ManaBox visual removals
            </h1>
            <p className="max-w-3xl text-sm leading-6 opacity-85">
              These are sold Spellbook order items that still need manual ManaBox cleanup.
              Use the visual report below while you remove each card: every row shows the
              card picture, exact printing, quantity, order refs, and the Spellbook box it
              came from. Print it if you want a paper checklist, then mark this report
              removed when ManaBox is updated.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="ManaBox report summary">
        <SummaryCard label="Cards to remove" value={report.totalQuantity.toLocaleString()} />
        <SummaryCard label="Report rows" value={report.totalRows.toLocaleString()} />
        <SummaryCard label="Orders covered" value={report.orderCount.toLocaleString()} />
        <SummaryCard label="Sold value" value={formatCurrency(report.totalValue)} />
      </section>

      <section
        className="wiko-manabox-toolbar rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="m-0 text-lg font-semibold" style={{ color: "var(--ink)" }}>
              Current visual report
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Generated {formatDateTime(report.generatedAt)}. Last marked removed: {formatDateTime(report.lastMarkedAt)}
              {report.lastMarkedBy ? ` by ${report.lastMarkedBy}` : ""}.
            </p>
          </div>
          <ManaBoxReportActions orderItemIds={orderItemIds} disabled={!hasRows} />
        </div>
      </section>

      {hasRows ? (
        <section
          aria-label="Visual ManaBox removal report"
          className="wiko-manabox-report-grid grid gap-4 lg:grid-cols-2"
        >
          {report.rows.map((row) => (
            <ManaBoxReportCard key={row.key} row={row} />
          ))}
        </section>
      ) : (
        <section
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          <h2 className="mb-2 text-lg font-semibold" style={{ color: "var(--ink)" }}>
            No ManaBox removals pending
          </h2>
          <p className="text-sm">
            Every non-cancelled order item has already been marked removed from ManaBox.
          </p>
        </section>
      )}
    </div>
  );
}

function ManaBoxReportCard({ row }: { row: ManaBoxRemovalReportRow }) {
  const boxes = boxesForRow(row);
  const printing = `${row.setCode.toUpperCase()} #${row.collectorNumber}`;
  return (
    <article
      className="wiko-manabox-report-card grid gap-4 rounded-xl border p-4 sm:grid-cols-[116px_minmax(0,1fr)]"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-label={`${row.name} ManaBox removal card`}
    >
      <div
        className="wiko-manabox-card-art overflow-hidden rounded-lg"
        style={{
          width: 116,
          height: 162,
          maxWidth: "100%",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        {row.imageUrl ? (
          <img
            src={row.imageUrl}
            alt={`${row.name} card art`}
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center px-3 text-center text-xs"
            style={{ color: "var(--muted)" }}
          >
            No card image saved
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3
              className="m-0 text-2xl leading-none"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink)", fontWeight: 500 }}
            >
              {row.name}
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              <span className="font-semibold" style={{ color: "var(--ink-soft)" }}>{printing}</span>
              {" · "}{row.setName}
            </p>
          </div>
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-full px-3 py-1 text-sm font-bold tabular-nums"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            aria-label={`${row.quantity} ${row.quantity === 1 ? "copy" : "copies"} to remove`}
          >
            ×{row.quantity}
          </span>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <ReportFact label="Finish" value={formatLabel(row.finish)} />
          <ReportFact label="Condition" value={conditionToAbbr(row.condition)} />
          <ReportFact label="Value" value={formatCurrency(row.totalValue)} />
          <ReportFact label="Sold" value={formatDateTime(row.firstSoldAt)} />
        </dl>

        <div className="space-y-2">
          <h4 className="m-0 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
            Source boxes
          </h4>
          <ul className="m-0 grid list-none gap-2 p-0" aria-label={`${row.name} source boxes`}>
            {boxes.map((box) => (
              <li
                key={box.box}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "color-mix(in oklab, var(--bg) 26%, transparent)",
                  borderLeft: `4px solid ${binderColor(box.box)}`,
                  color: "var(--ink)",
                }}
              >
                <strong>Box {formatBoxForDisplay(box.box)}</strong>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: "var(--surface-2)" }}>
                  ×{box.quantity}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {box.orderRefs.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Pill>Orders {row.orderRefs.join(", ")}</Pill>
          <Pill>Items #{row.orderItemIds.join(", #")}</Pill>
          <Pill>Status {row.statuses.map(formatLabel).join(", ")}</Pill>
        </div>
      </div>
    </article>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "color-mix(in oklab, var(--bg) 24%, transparent)" }}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--dim)" }}>
        {label}
      </dt>
      <dd className="m-0 mt-1 font-medium" style={{ color: "var(--ink)" }}>
        {value}
      </dd>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full border px-2 py-1"
      style={{ borderColor: "var(--border)", background: "transparent" }}
    >
      {children}
    </span>
  );
}
