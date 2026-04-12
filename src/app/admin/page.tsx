import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
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

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Inventory</h1>
      <InventoryTable />
    </div>
  );
}
