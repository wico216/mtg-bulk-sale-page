import type { AdminDashboardStats } from "@/db/queries";
import { formatBinderForDisplay } from "@/lib/binder-name";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatColorLabel(color: string): string {
  return color === "C" ? "C / Colorless" : color;
}

function formatRarityLabel(rarity: string): string {
  return rarity
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Top "ticker" stat band — a single mono row of label:value pairs
 * separated by interpuncts, anchored under the admin shell header.
 * Editorial-terminal aesthetic: data-dense, low-chrome, ambient. The
 * operator reads it in one glance the same way a trader reads a
 * ticker scroll. Replaces the previous tile grid.
 *
 * The `updated` slot reads the server-rendered time once; React doesn't
 * tick it forward — that's fine, the operator's mental clock for
 * "is this fresh" is the page reload, not a live timestamp.
 */
export function DashboardSummary({ stats }: { stats: AdminDashboardStats }) {
  const updated = new Date()
    .toISOString()
    .slice(11, 16); // hh:mm UTC

  return (
    <section
      aria-labelledby="dashboard-summary-heading"
      className="sticky z-20 -mx-4 sm:mx-0 px-4 sm:px-0 backdrop-blur"
      style={{
        top: 56,
        background: "color-mix(in oklab, var(--bg) 92%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h2 id="dashboard-summary-heading" className="sr-only">
        Inventory dashboard
      </h2>
      <div
        className="flex items-center gap-x-5 gap-y-1 flex-wrap overflow-x-auto whitespace-nowrap"
        style={{
          height: 38,
          padding: "0 2px",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          letterSpacing: "0.04em",
        }}
      >
        <Stat
          label="unique"
          value={formatNumber(stats.inventory.uniqueCards)}
        />
        <Sep />
        <Stat
          label="copies"
          value={formatNumber(stats.inventory.totalQuantity)}
        />
        <Sep />
        <Stat
          label="value"
          value={formatCurrency(stats.inventory.totalValue)}
        />
        <Sep />
        <Stat
          label="low"
          value={formatNumber(stats.inventory.lowStockCount)}
          warn={stats.inventory.lowStockCount > 0}
        />
        <Sep />
        <Stat
          label="missing"
          value={formatNumber(stats.inventory.missingPriceCount)}
          warn={stats.inventory.missingPriceCount > 0}
        />
        <Sep />
        <Stat label="updated" value={`${updated} utc`} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 shrink-0"
      style={{ color: "var(--muted)" }}
    >
      <span>{label}</span>
      <strong
        style={{
          color: warn ? "var(--accent)" : "var(--ink)",
          fontWeight: 600,
        }}
      >
        {value}
      </strong>
    </span>
  );
}

function Sep() {
  return (
    <span
      aria-hidden="true"
      style={{ color: "var(--dim)", flexShrink: 0 }}
    >
      ·
    </span>
  );
}

function BreakdownSection({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: Array<{ label: string; quantity: number; uniqueCards: number; value: number }>;
}) {
  return (
    <section
      className="rounded-xl p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="mt-3 space-y-1" role="list">
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-[1fr_auto] gap-3 py-1 text-sm"
            >
              <div className="min-w-0">
                <div
                  className="font-medium truncate"
                  style={{ color: "var(--ink)" }}
                >
                  {row.label}
                </div>
                <div
                  className="text-[10px] tabular-nums"
                  style={{ color: "var(--muted)" }}
                >
                  {formatNumber(row.uniqueCards)} unique ·{" "}
                  {formatCurrency(row.value)}
                </div>
              </div>
              <div
                className="text-right font-semibold tabular-nums shrink-0"
                style={{ color: "var(--ink)" }}
              >
                {formatNumber(row.quantity)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Collapsible "Insights" disclosure that renders the four breakdown tables
 * (by set / color / rarity / binder). Default closed — the operator can
 * open it when they want a deeper read on inventory composition.
 */
export function DashboardBreakdowns({ stats }: { stats: AdminDashboardStats }) {
  return (
    <details
      className="rounded-xl"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <summary
        className="cursor-pointer list-none px-4 py-3 flex items-center justify-between"
        style={{ color: "var(--ink)" }}
      >
        <span className="text-sm font-semibold">Insights</span>
        <span
          className="text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          Breakdowns by set, color, rarity, binder
        </span>
      </summary>
      <div
        className="p-4 grid gap-4 lg:grid-cols-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <BreakdownSection
          title="By set"
          emptyLabel="No set breakdown yet."
          rows={stats.breakdowns.bySet.map((row) => ({
            label: row.setCode.toUpperCase(),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        <BreakdownSection
          title="By color identity"
          emptyLabel="No color breakdown yet."
          rows={stats.breakdowns.byColor.map((row) => ({
            label: formatColorLabel(row.color),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        <BreakdownSection
          title="By rarity"
          emptyLabel="No rarity breakdown yet."
          rows={stats.breakdowns.byRarity.map((row) => ({
            label: formatRarityLabel(row.rarity),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        <BreakdownSection
          title="By binder"
          emptyLabel="No binder breakdown yet."
          rows={stats.breakdowns.byBinder.map((row) => ({
            label: formatBinderForDisplay(row.binder),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
      </div>
    </details>
  );
}
