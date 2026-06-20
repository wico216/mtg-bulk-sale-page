import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listCommanderLinks } from "@/db/commander-links";
import { isAdminEmail } from "@/lib/auth/helpers";
import type { CommanderLink } from "@/lib/commander-links-types";
import { e2eFixturesEnabled } from "@/lib/e2e-fixtures";
import { CommanderLinksManager } from "./_components/commander-links-manager";

export const metadata: Metadata = {
  title: "Commanders — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

const e2eCommanderLinks: CommanderLink[] = [
  {
    id: 1,
    name: "Muldrotha, the Gravetide",
    edhrecUrl: "https://edhrec.com/commanders/muldrotha-the-gravetide",
    imageUrl: "/window.svg",
    createdByEmail: "admin@example.com",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Prosper, Tome-Bound",
    edhrecUrl: "https://edhrec.com/commanders/prosper-tome-bound",
    imageUrl: "/file.svg",
    createdByEmail: "admin@example.com",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  },
];

export default async function AdminCommandersPage() {
  let commanders = e2eCommanderLinks;

  if (!e2eFixturesEnabled()) {
    const session = await auth();
    if (!session?.user) {
      redirect("/admin/login");
    }
    if (!isAdminEmail(session.user.email)) {
      redirect("/admin/access-denied");
    }
    commanders = await listCommanderLinks();
  }

  return (
    <div className="space-y-6">
      <header
        className="grid gap-6 items-end pt-2 pb-3"
        style={{ gridTemplateColumns: "1fr" }}
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
            Personal toolbox · EDHREC
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
            Commanders
            <em style={{ fontStyle: "italic", color: "var(--accent)" }}>.</em>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "var(--muted)" }}>
            Save your Commander EDHREC pages here. Add the commander once, then click the
            picture to jump straight to EDHREC when you want new card ideas.
          </p>
        </div>
      </header>

      <CommanderLinksManager initialCommanders={commanders} />
    </div>
  );
}
