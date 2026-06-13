import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPrivateWBinderCardsAggregated,
  getPrivateWBinderCardsMeta,
} from "@/db/queries";
import { resolveWBinderShareLink } from "@/db/w-binder-share-links";
import { SharedWBindersShell } from "./_components/shared-w-binders-shell";

export const metadata: Metadata = {
  title: "Private W Binder Preview — Wiko's Spellbook",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SharedWBindersPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveWBinderShareLink(token);
  if (!link) notFound();

  const allowedBinders = link.allowedBinders ?? undefined;
  const [cards, meta] = await Promise.all([
    getPrivateWBinderCardsAggregated(allowedBinders),
    getPrivateWBinderCardsMeta(allowedBinders),
  ]);

  return (
    <SharedWBindersShell
      cards={cards}
      meta={meta}
      linkLabel={link.label}
      expiresAt={link.expiresAt}
    />
  );
}
