import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getAdminAuditEntries,
  getImportHistory,
} from "@/db/queries";
import { isAdminEmail } from "@/lib/auth/helpers";
import { AuditTable, ImportHistoryTable } from "./_components/audit-table";

export const metadata: Metadata = {
  title: "Audit History — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toUrlSearchParams(
  searchParams: { [key: string]: string | string[] | undefined },
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const firstValue = firstParam(value);
    if (firstValue) params.set(key, firstValue);
  }
  return params;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const resolvedSearchParams = await searchParams;
  const currentParams = toUrlSearchParams(resolvedSearchParams);
  const auditPage = parsePositiveInt(firstParam(resolvedSearchParams.auditPage), 1);
  const importPage = parsePositiveInt(firstParam(resolvedSearchParams.importPage), 1);

  try {
    const [auditEntries, importHistory] = await Promise.all([
      getAdminAuditEntries({ page: auditPage, limit: 25 }),
      getImportHistory({ page: importPage, limit: 10 }),
    ]);

    return (
      <div className="space-y-8">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm dark:border-zinc-800">
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent-light">
              Operations ledger
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Audit & Import History</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              A durable trail of high-impact admin changes: what changed, who did it,
              when it happened, and the safe metadata needed to understand scope.
            </p>
          </div>
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Recent audit entries</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Inventory, import, and order workflow mutations newest first.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {auditEntries.total} total entries
            </span>
          </div>
          <AuditTable result={auditEntries} currentParams={currentParams} />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Import history</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                CSV replacement commits with filenames, row counts, inserted cards, actor, and timestamp.
              </p>
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {importHistory.total} total imports
            </span>
          </div>
          <ImportHistoryTable result={importHistory} currentParams={currentParams} />
        </section>
      </div>
    );
  } catch (error) {
    console.error("[ADMIN AUDIT] Failed to load audit history:", error);
    return (
      <div>
        <h1 className="mb-6 text-xl font-semibold">Audit & Import History</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          Failed to load audit history. Try refreshing the page.
        </div>
      </div>
    );
  }
}
