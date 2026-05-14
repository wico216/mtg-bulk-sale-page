import type { AdminDashboardStats } from "@/db/queries";

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

function StatTile({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className="px-4 py-3 first:rounded-l-xl last:rounded-r-xl flex flex-col gap-1 min-w-0"
      style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.12em] truncate"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div
        className="text-xl sm:text-2xl font-semibold tabular-nums leading-none"
        style={{
          color: tone === "warn" ? "var(--accent)" : "var(--ink)",
          fontFamily: "var(--font-display)",
        }}
      >
        {value}
      </div>
      <div
        className="text-[10px] tabular-nums truncate"
        style={{ color: "var(--muted)" }}
      >
        {helper}
      </div>
    </div>
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
 * Tight horizontal stat band — 5 tiles in a single row on desktop, 2-3
 * tiles per row on smaller screens. Designed to be the first thing the
 * operator sees, ambient context for the table below.
 */
export function DashboardSummary({ stats }: { stats: AdminDashboardStats }) {
  return (
    <section aria-labelledby="dashboard-summary-heading">
      <h2 id="dashboard-summary-heading" className="sr-only">
        Inventory dashboard
      </h2>
      <div
        className="rounded-xl overflow-hidden grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        style={{ border: "1px solid var(--border)" }}
      >
        <StatTile
          label="Unique"
          value={formatNumber(stats.inventory.uniqueCards)}
          helper="rows"
        />
        <StatTile
          label="Total qty"
          value={formatNumber(stats.inventory.totalQuantity)}
          helper="copies"
        />
        <StatTile
          label="Value"
          value={formatCurrency(stats.inventory.totalValue)}
          helper="missing = $0"
        />
        <StatTile
          label="Low stock"
          value={formatNumber(stats.inventory.lowStockCount)}
          helper={stats.inventory.lowStockCount > 0 ? "needs attention" : "—"}
          tone={stats.inventory.lowStockCount > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Missing prices"
          value={formatNumber(stats.inventory.missingPriceCount)}
          helper={
            stats.inventory.missingPriceCount > 0 ? "N/A on storefront" : "—"
          }
          tone={stats.inventory.missingPriceCount > 0 ? "warn" : "default"}
        />
      </div>
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
            label: row.binder,
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
      </div>
    </details>
  );
}
