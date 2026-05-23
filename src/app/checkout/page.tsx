import { getCardsAggregated } from "@/db/queries";
import Header from "@/components/header";
import CheckoutClient from "./checkout-client";
import {
  e2eFixtureCards,
  e2eFixturesEnabled,
} from "@/lib/e2e-fixtures";
import { toPublicCards } from "@/lib/public-card";
import type { PublicCard } from "@/lib/types";

export const metadata = {
  title: "Checkout — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

async function loadCheckoutCards(): Promise<PublicCard[]> {
  if (e2eFixturesEnabled()) return e2eFixtureCards;

  // v1.3 Phase 20 D-03/D-06 + AGG-02: checkout-client reads only
  // PublicCard fields (name, setName, imageUrl, price). Same option-b
  // drop as cart/page.tsx — the legacy getCards() call was a no-op for
  // the checkout client.
  const aggregatedAdmin = await getCardsAggregated();
  return toPublicCards(aggregatedAdmin);
}

async function loadCheckoutCardsSafely(): Promise<PublicCard[] | null> {
  try {
    return await loadCheckoutCards();
  } catch (error) {
    console.error("[CHECKOUT] Failed to load cards:", error);
    return null;
  }
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header />
      {children}
    </div>
  );
}

export default async function CheckoutPage() {
  const cards = await loadCheckoutCardsSafely();

  if (!cards) {
    return (
      <CheckoutShell>
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            Checkout is briefly unavailable — try again soon.
          </p>
        </main>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell>
      <main className="pt-6 pb-24">
        <CheckoutClient cards={cards} />
      </main>
    </CheckoutShell>
  );
}
