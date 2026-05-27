import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getManaBoxRemovalReport } from "@/db/manabox-removals";
import { isAdminEmail } from "@/lib/auth/helpers";
import {
  e2eFixtureManaBoxRemovalReport,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { ManaBoxReportView } from "./_components/manabox-report-view";

export const metadata: Metadata = {
  title: "ManaBox Removals — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function AdminManaBoxPage() {
  if (e2eFixturesEnabled()) {
    return <ManaBoxReportView report={e2eFixtureManaBoxRemovalReport} />;
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  let report: Awaited<ReturnType<typeof getManaBoxRemovalReport>>;
  try {
    report = await getManaBoxRemovalReport();
  } catch (error) {
    console.error("[ADMIN MANABOX] Failed to load ManaBox removal report:", error);
    return (
      <div className="space-y-4">
        <h1
          className="m-0"
          style={{
            fontFamily: "var(--font-instrument-serif), ui-serif, Georgia, serif",
            fontWeight: 400,
            fontSize: 36,
            color: "var(--ink)",
          }}
        >
          ManaBox removals<em style={{ fontStyle: "italic", color: "var(--accent)" }}>.</em>
        </h1>
        <div
          className="rounded-md p-4 text-sm"
          style={{
            background: "color-mix(in oklab, var(--bad) 8%, transparent)",
            borderLeft: "3px solid var(--bad)",
            color: "var(--ink)",
          }}
        >
          Failed to load ManaBox removal report. Try refreshing the page.
        </div>
      </div>
    );
  }

  return <ManaBoxReportView report={report} />;
}
