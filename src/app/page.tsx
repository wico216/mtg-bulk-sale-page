import { loadCardData } from "@/lib/load-cards";
import Header from "@/components/header";
import FilterBar from "@/components/filter-bar";
import CardGrid from "@/components/card-grid";

export default function Home() {
  const data = loadCardData();

  if (!data) {
    return (
      <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-16 text-center">
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            No card data generated yet. Run{" "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-sm">
              npm run generate
            </code>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header />
      <FilterBar />
      <main className="pt-6">
        <CardGrid cards={data.cards} meta={data.meta} />
      </main>
    </div>
  );
}
