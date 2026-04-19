import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCardsMeta } from "@/db/queries";
import { ImportClient } from "./_components/import-client";

export const metadata: Metadata = {
  title: "Import CSV -- Viki MTG Bulk Store",
};

// Current total must reflect latest DB state on every visit (D-12 delta accuracy)
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!isAdminEmail(session.user.email)) redirect("/admin/access-denied");

  const meta = await getCardsMeta();

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/admin"
        className="text-sm text-accent hover:text-accent-hover inline-block mb-2"
      >
        ← Back to Inventory
      </Link>
      <h1 className="text-xl font-semibold mb-2">Import CSV</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Upload a Manabox CSV to replace your entire inventory.
      </p>
      <ImportClient currentTotal={meta.totalCards} />
    </div>
  );
}
