import { auth } from "@/auth";
import { getAdminDashboardStats } from "@/db/queries";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  DashboardSummary,
  DashboardBreakdowns,
} from "./_components/dashboard-summary";
import { InventoryTable } from "./_components/inventory-table";

export const metadata: Metadata = {
  title: "Inventory — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const stats = await getAdminDashboardStats();

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl sm:text-3xl font-semibold tracking-tight"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--ink)",
          }}
        >
          Inventory
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Pricing, stock, bulk operations.
        </p>
      </header>

      <DashboardSummary stats={stats} />
      <DashboardBreakdowns stats={stats} />

      <InventoryTable />
    </div>
  );
}
