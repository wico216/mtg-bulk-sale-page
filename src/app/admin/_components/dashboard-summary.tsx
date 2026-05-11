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

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm">
              <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                  {row.label}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatNumber(row.uniqueCards)} unique · {formatCurrency(row.value)}
                </div>
              </div>
              <div className="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatNumber(row.quantity)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DashboardSummary({ stats }: { stats: AdminDashboardStats }) {
  return (
    <section aria-labelledby="dashboard-summary-heading" className="space-y-4">
      <div>
        <h2 id="dashboard-summary-heading" className="text-lg font-semibold">
          Inventory dashboard
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          A quick read on inventory size, value, stock risk, and collection mix.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Unique cards"
          value={formatNumber(stats.inventory.uniqueCards)}
          helper="Rows in inventory"
        />
        <StatCard
          label="Total quantity"
          value={formatNumber(stats.inventory.totalQuantity)}
          helper="Copies available"
        />
        <StatCard
          label="Total inventory value"
          value={formatCurrency(stats.inventory.totalValue)}
          helper="Missing prices count as $0"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(stats.inventory.lowStockCount)}
          helper="Cards with one copy"
        />
        <StatCard
          label="Missing prices"
          value={formatNumber(stats.inventory.missingPriceCount)}
          helper="Rows priced as N/A"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <BreakdownSection
          title="Breakdown by set"
          emptyLabel="No set breakdown yet."
          rows={stats.breakdowns.bySet.map((row) => ({
            label: row.setCode.toUpperCase(),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        <BreakdownSection
          title="Breakdown by color identity"
          emptyLabel="No color breakdown yet."
          rows={stats.breakdowns.byColor.map((row) => ({
            label: formatColorLabel(row.color),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        <BreakdownSection
          title="Breakdown by rarity"
          emptyLabel="No rarity breakdown yet."
          rows={stats.breakdowns.byRarity.map((row) => ({
            label: formatRarityLabel(row.rarity),
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
        {/* Phase 21 D-12: Breakdown by binder. Lowercase verbatim per
            Phase 17 D-04 (no toUpperCase like the set codes above). */}
        <BreakdownSection
          title="Breakdown by binder"
          emptyLabel="No binder breakdown yet."
          rows={stats.breakdowns.byBinder.map((row) => ({
            label: row.binder,
            quantity: row.quantity,
            uniqueCards: row.uniqueCards,
            value: row.value,
          }))}
        />
      </div>
    </section>
  );
}
