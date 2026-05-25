import { auth } from "@/auth";
import { getAdminDashboardStats } from "@/db/queries";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  DashboardSummary,
  DashboardBreakdowns,
} from "./_components/dashboard-summary";
import {
  e2eFixtureAdminDashboardStats,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { InventoryTable } from "./_components/inventory-table";

export const metadata: Metadata = {
  title: "Inventory — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const fixtureInventoryEnabled =
    e2eFixturesEnabled() && firstParam(resolvedSearchParams.fixtureAdmin) === "1";
  let stats = e2eFixtureAdminDashboardStats;

  if (!fixtureInventoryEnabled) {
    const session = await auth();

    if (!session?.user) {
      redirect("/admin/login");
    }

    if (!isAdminEmail(session.user.email)) {
      redirect("/admin/access-denied");
    }

    stats = await getAdminDashboardStats();
  }

  return (
    <div className="space-y-6">
      <DashboardSummary stats={stats} />

      <header
        className="grid gap-6 items-end pt-2 pb-3"
        style={{
          gridTemplateColumns: "1fr",
        }}
      >
        <div>
          <p
            className="m-0 mb-2"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Section · 01 — Inventory
          </p>
          <h1
            className="m-0"
            style={{
              fontFamily: "var(--font-instrument-serif), ui-serif, Georgia, serif",
              fontWeight: 400,
              fontSize: 44,
              letterSpacing: "-0.01em",
              lineHeight: 0.95,
              color: "var(--ink)",
            }}
          >
            Inventory
            <em
              style={{
                fontStyle: "italic",
                color: "var(--accent)",
              }}
            >
              .
            </em>
          </h1>
        </div>
      </header>

      <DashboardBreakdowns stats={stats} />

      <InventoryTable />
    </div>
  );
}
