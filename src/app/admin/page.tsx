import { auth } from "@/auth";
import { getAdminDashboardStats } from "@/db/queries";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DashboardSummary } from "./_components/dashboard-summary";
import { InventoryTable } from "./_components/inventory-table";

export const metadata: Metadata = {
  title: "Inventory -- Viki MTG Bulk Store",
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
      <div>
        <h1 className="text-xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage inventory, pricing, stock, and bulk operations.
        </p>
      </div>
      <DashboardSummary stats={stats} />
      <InventoryTable />
    </div>
  );
}
