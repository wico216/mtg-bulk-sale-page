import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin -- Viki MTG Bulk Store",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const firstName = session.user.name?.split(" ")[0] ?? "Admin";

  return (
    <div>
      <h1 className="text-xl font-bold">Welcome, {firstName}</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
        Inventory management coming soon.
      </p>
    </div>
  );
}
