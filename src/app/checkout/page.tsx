import { getCardsAggregated } from "@/db/queries";
import Header from "@/components/header";
import CheckoutClient from "./checkout-client";
import type { PublicCard } from "@/lib/types";

export const metadata = {
  title: "Checkout -- Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  try {
    // v1.3 Phase 20 D-03/D-06 + AGG-02: checkout-client reads only
    // PublicCard fields (name, setName, imageUrl, price). Same option-b
    // drop as cart/page.tsx — the legacy getCards() call was a no-op for
    // the checkout client.
    const aggregatedAdmin = await getCardsAggregated();
    const cards: PublicCard[] = aggregatedAdmin.map(
      ({ binders: _binders, ...rest }) => rest,
    );

    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <main className="pt-6 pb-24">
          <CheckoutClient cards={cards} />
        </main>
      </div>
    );
  } catch (error) {
    console.error("[CHECKOUT] Failed to load cards:", error);
    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            Checkout is briefly unavailable — try again soon.
          </p>
        </main>
      </div>
    );
  }
}
