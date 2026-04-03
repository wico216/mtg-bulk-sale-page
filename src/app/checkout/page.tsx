import { loadCardData } from "@/lib/load-cards";
import Header from "@/components/header";
import CheckoutClient from "./checkout-client";

export const metadata = {
  title: "Checkout -- Viki MTG Bulk Store",
};

export default function CheckoutPage() {
  const data = loadCardData();
  const cards = data?.cards ?? [];

  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header />
      <main className="pt-6 pb-24">
        <CheckoutClient cards={cards} />
      </main>
    </div>
  );
}
