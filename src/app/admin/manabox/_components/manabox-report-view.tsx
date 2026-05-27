import type { ReactNode } from "react";
import type { ManaBoxRemovalReport, ManaBoxRemovalReportRow } from "@/db/manabox-removals";
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

function allOrderItemIds(rows: ManaBoxRemovalReportRow[]): number[] {
  return rows.flatMap((row) => row.orderItemIds);
}

export function ManaBoxReportView({ report }: ManaBoxReportViewProps) {
  const orderItemIds = allOrderItemIds(report.rows);
  const hasRows = report.rows.length > 0;

  return (
    <div className="space-y-6">
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
              ManaBox removals
            </h1>
            <p className="max-w-3xl text-sm leading-6 opacity-85">
              These are sold Spellbook order items that have not been marked as removed from your
              ManaBox collection yet. Download the CSV, remove the cards in ManaBox, then mark this
              report removed so the next report only shows new sales.
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
        className="rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="m-0 text-lg font-semibold" style={{ color: "var(--ink)" }}>
              Current unmarked report
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
        <section className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y text-sm" style={{ borderColor: "var(--border)" }}>
              <thead style={{ background: "color-mix(in oklab, var(--ink) 6%, transparent)" }}>
                <tr className="text-left">
                  <HeaderCell>Card</HeaderCell>
                  <HeaderCell>Printing</HeaderCell>
                  <HeaderCell>Qty</HeaderCell>
                  <HeaderCell>Orders</HeaderCell>
                  <HeaderCell>Binders</HeaderCell>
                  <HeaderCell>Sold window</HeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {report.rows.map((row) => (
                  <tr key={row.key}>
                    <BodyCell>
                      <div className="font-semibold" style={{ color: "var(--ink)" }}>{row.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {formatCurrency(row.totalValue)} total
                      </div>
                    </BodyCell>
                    <BodyCell>
                      <div>{row.setCode.toUpperCase()} #{row.collectorNumber}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {row.setName} · {formatLabel(row.finish)} · {formatLabel(row.condition)}
                      </div>
                    </BodyCell>
                    <BodyCell>
                      <span className="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
                        {row.quantity}
                      </span>
                    </BodyCell>
                    <BodyCell>
                      <div className="max-w-[240px] truncate" title={row.orderRefs.join(", ")}>
                        {row.orderRefs.join(", ")}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {row.statuses.map(formatLabel).join(", ")}
                      </div>
                    </BodyCell>
                    <BodyCell>{row.binders.join(", ")}</BodyCell>
                    <BodyCell>
                      {formatDateTime(row.firstSoldAt)}
                      {row.firstSoldAt !== row.lastSoldAt ? ` – ${formatDateTime(row.lastSoldAt)}` : ""}
                    </BodyCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{children}</th>;
}

function BodyCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 align-top" style={{ color: "var(--ink)" }}>{children}</td>;
}
