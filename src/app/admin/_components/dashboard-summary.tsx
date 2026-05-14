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
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-2 text-2xl font-semibold tabular-nums leading-none"
        style={{
          color: tone === "warn" ? "var(--accent)" : "var(--ink)",
          fontFamily: "var(--font-display)",
        }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
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
      className="rounded-lg p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <h3
        className="text-sm font-semibold"
        style={{ color: "var(--ink)" }}
      >
        {title}
      </h3>
      {rows.length === 0 ? (
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--muted)" }}
        >
          {emptyLabel}
        </p>
      ) : (
        <div
          className="mt-3 divide-y"
          style={{ borderColor: "var(--border)" }}
        >
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto] gap-3 py-2 text-sm"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div>
                <div
                  className="font-medium"
                  style={{ color: "var(--ink)" }}
                >
                  {row.label}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {formatNumber(row.uniqueCards)} unique · {formatCurrency(row.value)}
                </div>
              </div>
              <div
                className="text-right font-semibold tabular-nums"
                style={{ color: "var(--ink)" }}
              >
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
          label="Total value"
          value={formatCurrency(stats.inventory.totalValue)}
          helper="Missing prices count as $0"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(stats.inventory.lowStockCount)}
          helper="Cards with one copy"
          tone={stats.inventory.lowStockCount > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Missing prices"
          value={formatNumber(stats.inventory.missingPriceCount)}
          helper="Rows priced as N/A"
          tone={stats.inventory.missingPriceCount > 0 ? "warn" : "default"}
        />
      </div>

      <h2
        id="dashboard-summary-heading"
        className="text-xs font-semibold uppercase tracking-[0.08em] pt-2"
        style={{ color: "var(--muted)" }}
      >
        Breakdowns
      </h2>

      <div className="grid gap-4 lg:grid-cols-4">
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
        {/* Phase 21 D-12: Breakdown by binder. Lowercase verbatim per
            Phase 17 D-04 (no toUpperCase like the set codes above). */}
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
    </section>
  );
}
