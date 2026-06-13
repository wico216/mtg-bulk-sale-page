import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getPrivateWBinderCardsAggregated,
  getPrivateWBinderCardsMeta,
} from "@/db/queries";
import { listWBinderShareLinks } from "@/db/w-binder-share-links";
import { isAdminEmail } from "@/lib/auth/helpers";
import {
  e2eFixturesEnabled,
  getE2ePrivateWBinderCards,
  getE2ePrivateWBinderMeta,
} from "@/lib/e2e-fixtures";
import { AdminWBindersShell } from "./_components/admin-w-binders-shell";

export const metadata: Metadata = {
  title: "W Binders — Wiko's Spellbook Admin",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminWBindersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const fixtureEnabled =
    e2eFixturesEnabled() && firstParam(resolvedSearchParams.fixtureAdmin) === "1";

  if (fixtureEnabled) {
    const cards = getE2ePrivateWBinderCards();
    return <AdminWBindersShell cards={cards} meta={getE2ePrivateWBinderMeta(cards)} shareLinks={[]} />;
  }

  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!isAdminEmail(session.user.email)) redirect("/admin/access-denied");

  const [cards, meta, shareLinks] = await Promise.all([
    getPrivateWBinderCardsAggregated(),
    getPrivateWBinderCardsMeta(),
    listWBinderShareLinks(),
  ]);

  return <AdminWBindersShell cards={cards} meta={meta} shareLinks={shareLinks} />;
}
