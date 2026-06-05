import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPriceMoversReport } from "@/db/price-movers";
import { isAdminEmail } from "@/lib/auth/helpers";
import {
  e2eFixturePriceMoversReport,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { PriceMoversReportView } from "./_components/price-movers-report-view";

export const metadata: Metadata = {
  title: "Price Movers — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function AdminPriceMoversPage() {
  if (e2eFixturesEnabled()) {
    return <PriceMoversReportView report={e2eFixturePriceMoversReport} />;
  }

  const session = await auth();
  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  let report: Awaited<ReturnType<typeof getPriceMoversReport>>;
  try {
    report = await getPriceMoversReport({ limit: 50 });
  } catch (error) {
    console.error("[ADMIN PRICE MOVERS] Failed to load Price Movers report:", error);
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
          Price movers<em style={{ fontStyle: "italic", color: "var(--accent)" }}>.</em>
        </h1>
        <div
          className="rounded-md p-4 text-sm"
          style={{
            background: "color-mix(in oklab, var(--bad) 8%, transparent)",
            borderLeft: "3px solid var(--bad)",
            color: "var(--ink)",
          }}
        >
          Failed to load Price Movers report. Try refreshing the page.
        </div>
      </div>
    );
  }

  return <PriceMoversReportView report={report} />;
}
