import Header from "@/components/header";
import FilterBar from "@/components/filter-bar";
import CardGrid from "@/components/card-grid";
import { getCards, getCardsMeta } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [cards, meta] = await Promise.all([getCards(), getCardsMeta()]);

    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <FilterBar />
        <main className="pt-6">
          <CardGrid cards={cards} meta={meta} />
        </main>
      </div>
    );
  } catch (error) {
    console.error("[HOME] Database error:", error);
    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-16 text-center">
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Store temporarily unavailable, try again soon.
          </p>
        </main>
      </div>
    );
  }
}
